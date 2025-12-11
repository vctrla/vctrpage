import path from 'path';
import fs from 'fs/promises';
import sharp from 'sharp';
import { escAttr } from './utils.js';

const IS_PROD = process.env.NODE_ENV === 'production';

const config = {
	width: 900,
	quality: 100,
};

export async function processImage(absPath, relPath, distDir, srcHash) {
	const ext = path.extname(relPath);
	const base = path.basename(relPath, ext);
	const dir = path.posix.dirname(relPath);

	// Resize + desaturate
	const buffer = await sharp(absPath)
		.resize({
			width: config.width,
			withoutEnlargement: true,
			kernel: sharp.kernel.lanczos3,
			fit: 'inside',
		})
		// .modulate({ saturation: 0 }) // desaturate completely
		.webp({ quality: config.quality, effort: 6, smartSubsample: true })
		.toBuffer();

	const hashedName = `${base}.${srcHash}.webp`;
	const outPath = path.join(distDir, hashedName);

	await fs.mkdir(distDir, { recursive: true });
	await fs.writeFile(outPath, buffer);

	const relHashed = path.posix.join(dir, hashedName);
	return relHashed;
}

// img size presets for different contexts -> on <img> elements' sizes (cloudflare transformations)
export const IMG_SIZES = {
	landing: {
		small: 200,
		large: 500,
	},
	article: {
		small: 600,
		large: 800,
	},
};

function cfImg(
	assetPath,
	{ width, height, quality = 'auto', format = 'auto', extra = '' } = {}
) {
	const dims = [];
	if (width) dims.push(`width=${width}`);
	if (height) dims.push(`height=${height}`);
	const opts = [dims.join(','), `quality=${quality}`, `format=${format}`, extra]
		.filter(Boolean)
		.join(',');
	return `/cdn-cgi/image/${opts}/${assetPath}`;
}

export function landingImgTag({
	asset,
	title,
	isFirst = false,
	highPriority = false,
}) {
	// isFirst -> modifies css and fetch priority for featured img
	// highPriority -> forces high fetch priority
	if (!asset) return '';

	if (!IS_PROD) {
		return `<img class="${isFirst ? 'landing-thumb-featured' : 'landing-thumb'}"
      src="/${asset}"
      alt="${escAttr(title)}"
      width="500" height="500"
      ${
				isFirst || highPriority
					? 'fetchpriority="high" decoding="async"'
					: 'loading="lazy" decoding="async"'
			}
    >`;
	}

	const wSmall = IMG_SIZES.landing.small;
	const wLarge = IMG_SIZES.landing.large;

	// return responsive <img> for landing thumbnails
	// - Uses Cloudflare Image Resizing (cfImg) to deliver optimized versions
	// - Loads 200 px wide by default, or 500 px when viewport ≤ 500 px (via srcset/sizes)
	// - Keeps correct aspect ratio with width/height attributes
	// - First image on the landing page gets high fetch priority for faster LCP, others lazy-load
	return `<img class="${isFirst ? 'landing-thumb-featured' : 'landing-thumb'}"
    src="${cfImg(asset, { width: wSmall })}"
    srcset="
      ${cfImg(asset, { width: wSmall })} ${wSmall}w,
      ${cfImg(asset, { width: wLarge })} ${wLarge}w"
    sizes="(max-width: 500px) ${wLarge}px, ${wSmall}px"
    alt="${escAttr(title)}"
    width="${wSmall}" height="${wSmall}"
    ${
			isFirst || highPriority
				? 'fetchpriority="high" decoding="async"'
				: 'loading="lazy" decoding="async"'
		}
  >`;
}

export function articleImgTag({ asset, title }) {
	if (!asset) return '';

	if (!IS_PROD) {
		return `<img class="article-image"
      src="/${asset}"
      width="900" height="900"
      alt="${escAttr(title)}"
      fetchpriority="high"
      decoding="async"
    >`;
	}

	const wSmall = IMG_SIZES.article.small;
	const wLarge = IMG_SIZES.article.large;

	// Return responsive <img> for article headers
	// - Uses Cloudflare Image Resizing (cfImg) for 600 px and 800 px variants
	// - Browser picks 600 px when viewport ≤ 600 px, otherwise 800 px
	// - Width/height attributes preserve layout stability (no CLS)
	// - Always high fetch priority
	return `<img class="article-image"
    src="${cfImg(asset, { width: wLarge })}"
    srcset="
      ${cfImg(asset, { width: wSmall })} ${wSmall}w,
      ${cfImg(asset, { width: wLarge })} ${wLarge}w"
    sizes="(max-width: 600px) ${wSmall}px, ${wLarge}px"
    width="${wLarge}" height="${wLarge}"
    alt="${escAttr(title)}"
    fetchpriority="high"
    decoding="async"
  >`;
}
