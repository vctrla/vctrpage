import fs from 'fs';
import path from 'path';
import { fileHash, loadHashes, saveHashes } from './utils.js';
import { processImage } from './imgs.js';
import { paths, site } from './config.js';
import { minify as terserMinify } from 'terser';

const IS_PROD = process.env.NODE_ENV === 'production';

export async function processAssets() {
	const hashes = loadHashes(paths.hashFile);
	const assetMap = {};

	if (paths.images && fs.existsSync(paths.images)) {
		const destImgDir = path.join(paths.dist, 'img');
		fs.mkdirSync(destImgDir, { recursive: true });

		const entries = fs.readdirSync(paths.images, { withFileTypes: true });
		for (const entry of entries) {
			if (
				entry.name.startsWith('.') ||
				entry.name === 'Thumbs.db' ||
				entry.name === 'desktop.ini'
			)
				continue;

			if (!entry.isFile()) continue;

			const ext = path.extname(entry.name).toLowerCase();
			if (!ext.match(/\.(jpe?g|png)$/i)) continue;

			const abs = path.join(paths.images, entry.name);
			const rel = path.posix.join('img', entry.name);
			const variants = await processImage(abs, rel, destImgDir);
			assetMap[rel] = variants;
		}
	} else {
		console.warn(`⚠️  No Desktop images folder at ${paths.images}`);
	}

	if (!fs.existsSync(paths.assets)) {
		console.warn(`⚠️  No assets folder at ${paths.assets}`);
		return { assetMap, hashes };
	}

	const walk = async (absDir, relBase = '') => {
		const entries = fs.readdirSync(absDir, { withFileTypes: true });

		for (const entry of entries) {
			if (
				entry.name.startsWith('.') ||
				entry.name === 'Thumbs.db' ||
				entry.name === 'desktop.ini'
			)
				continue;

			const rel = path.posix.join(relBase, entry.name);
			const abs = path.join(absDir, entry.name);

			if (entry.isDirectory()) {
				await walk(abs, rel);
				continue;
			}

			const ext = path.extname(entry.name).toLowerCase();
			const destDir = path.join(paths.dist, path.posix.dirname(rel));
			fs.mkdirSync(destDir, { recursive: true });

			if (['.html', '.txt', '.xml'].includes(ext)) {
				fs.copyFileSync(abs, path.join(paths.dist, rel));
				assetMap[rel] = rel;
				continue;
			}

			const newHash = fileHash(abs);
			const hash = hashes[rel] === newHash ? hashes[rel] : newHash;
			hashes[rel] = hash;

			const base = path.basename(entry.name, ext);
			const hashedRel = path.posix.join(
				path.posix.dirname(rel),
				`${base}.${hash}${ext}`
			);

			const hashedAbs = path.join(paths.dist, hashedRel);

			if (ext === '.js') {
				try {
					let code = fs.readFileSync(abs, 'utf8');

					const endpoint = IS_PROD ? site.origin : site.local;
					code = code.replace(/__ENDPOINT__/g, JSON.stringify(endpoint));

					const turnstileSiteKey = IS_PROD
						? '0x4AAAAAACBv_qQyd1sIX-Ve'
						: '3x00000000000000000000FF'; // testing key (always shows challenge)

					code = code.replace(
						/__TURNSTILE_KEY__/g,
						JSON.stringify(turnstileSiteKey)
					);

					const result = await terserMinify(code, {
						module: true,
						compress: {
							passes: 3,
							ecma: 2020,
							drop_console: IS_PROD,
							drop_debugger: IS_PROD,
							unsafe_arrows: true,
							unsafe_comps: true,
							unsafe_methods: true,
							unsafe_proto: true,
							unsafe_undefined: true,
						},
						mangle: true,
						format: {
							comments: false,
						},
					});

					if (result.code && result.code.length) {
						fs.writeFileSync(hashedAbs, result.code, 'utf8');
					} else {
						fs.copyFileSync(abs, hashedAbs);
					}
				} catch (err) {
					console.warn(`⚠️  Terser failed for ${rel}: ${err?.message || err}`);
					fs.copyFileSync(abs, hashedAbs);
				}
				assetMap[rel] = hashedRel;
				continue;
			}

			fs.copyFileSync(abs, path.join(paths.dist, hashedRel));
			assetMap[rel] = hashedRel;
		}
	};

	await walk(paths.assets);
	saveHashes(paths.hashFile, hashes);
	console.log(`📦 Processed assets recursively`);
	return { assetMap, hashes };
}
