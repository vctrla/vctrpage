import fs from 'fs/promises';
import path from 'path';
import { fileHash, loadHashes } from './utils.js';
import { processImage } from './imgs.js';
import { paths, site } from './config.js';
import { minify as terserMinify } from 'terser';

const IS_PROD = process.env.NODE_ENV === 'production';

async function exists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

export async function processAssets() {
	console.log(`📦 Processing assets...`);

	const hashes = await loadHashes(paths.hashFile);
	const assetMap = {};

	// IMAGES
	if (paths.images && (await exists(paths.images))) {
		const destImgDir = path.join(paths.dist, 'img');
		await fs.mkdir(destImgDir, { recursive: true });

		const entries = await fs.readdir(paths.images, { withFileTypes: true });

		const imgTasks = [];

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

			imgTasks.push(
				(async () => {
					const abs = path.join(paths.images, entry.name);
					const rel = path.posix.join('img', entry.name);

					// hash of the source image content
					const srcHash = await fileHash(abs);
					const prevHash = hashes[rel];

					// if same content as last time -> reuse existing output
					if (prevHash === srcHash) {
						const base = path.basename(entry.name, ext);
						const hashedRel = path.posix.join('img', `${base}.${srcHash}.webp`);
						const hashedAbs = path.join(paths.dist, hashedRel);

						if (await exists(hashedAbs)) {
							assetMap[rel] = hashedRel;
							return; // ✅ skip Sharp
						}
					}

					// fallback: do the expensive work
					const relHashed = await processImage(abs, rel, destImgDir, srcHash);
					assetMap[rel] = relHashed;
					hashes[rel] = srcHash;
				})()
			);
		}

		await Promise.all(imgTasks);
	} else {
		console.warn(`⚠️  No Desktop images folder at ${paths.images}`);
	}

	// ASSETS ROOT
	if (!(await exists(paths.assets))) {
		console.warn(`⚠️  No assets folder at ${paths.assets}`);
		return { assetMap, hashes };
	}

	const walk = async (absDir, relBase = '') => {
		const entries = await fs.readdir(absDir, { withFileTypes: true });

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
			await fs.mkdir(destDir, { recursive: true });

			if (['.html', '.txt', '.xml'].includes(ext)) {
				await fs.copyFile(abs, path.join(paths.dist, rel));
				assetMap[rel] = rel;
				continue;
			}

			const newHash = await fileHash(abs);
			const prevHash = hashes[rel];
			const hash = prevHash === newHash ? prevHash : newHash;
			hashes[rel] = hash;

			const base = path.basename(entry.name, ext);
			const hashedRel = path.posix.join(
				path.posix.dirname(rel),
				`${base}.${hash}${ext}`
			);

			const hashedAbs = path.join(paths.dist, hashedRel);

			// if unchanged && output exists -> reuse and skip heavy work
			if (prevHash === newHash && (await exists(hashedAbs))) {
				assetMap[rel] = hashedRel;
				continue;
			}

			if (ext === '.js') {
				try {
					let code = await fs.readFile(abs, 'utf8');
					const endpoint = IS_PROD ? site.origin : site.local;
					code = code.replace(/__ENDPOINT__/g, JSON.stringify(endpoint));

					if (!IS_PROD) {
						// dev: no terser -> just write hashed
						await fs.writeFile(hashedAbs, code, 'utf8');
					} else {
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
							await fs.writeFile(hashedAbs, result.code, 'utf8');
						} else {
							await fs.copyFile(abs, hashedAbs);
						}
					}
				} catch (err) {
					console.warn(`⚠️  Terser failed for ${rel}: ${err?.message || err}`);
					await fs.copyFile(abs, hashedAbs);
				}
				assetMap[rel] = hashedRel;
				continue;
			}

			// default: copy with hashed name
			await fs.copyFile(abs, path.join(paths.dist, hashedRel));
			assetMap[rel] = hashedRel;
		}
	};

	await walk(paths.assets);
	console.log(`✅ Processed assets recursively`);
	return { assetMap, hashes };
}
