import fs from 'fs';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import { minify as _minify } from 'html-minifier-terser';
import { site } from './config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function getCssVar(varName) {
	const cssPath = path.resolve(__dirname, '../assets/main.css');
	const css = fs.readFileSync(cssPath, 'utf8');
	const match = css.match(new RegExp(`--${varName}:\\s*([^;]+);`));
	if (!match) throw new Error(`Variable ${varName} not found`);
	return match[1].trim();
}

export function stripHtmlTags(str) {
	return str.replace(/<[^>]*>/g, '');
}

export function fileHash(input) {
	const hash = crypto.createHash('md5');
	let buf;

	if (Buffer.isBuffer(input)) {
		buf = input; // already a buffer
	} else {
		buf = fs.readFileSync(input); // input is a path
	}

	return hash.update(buf).digest('hex').slice(0, 8);
}

export function loadHashes(hashFilePath) {
	return fs.existsSync(hashFilePath)
		? JSON.parse(fs.readFileSync(hashFilePath, 'utf-8'))
		: {};
}

export function saveHashes(hashFilePath, hashes) {
	fs.writeFileSync(hashFilePath, JSON.stringify(hashes, null, 2), 'utf-8');
}

export function escapeRegex(str) {
	return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const escAttr = (s) =>
	String(s)
		.replace(/&/g, '&amp;')
		.replace(/"/g, '&quot;')
		.replace(/</g, '&lt;');

export function slugify(str) {
	return String(str || '')
		.normalize('NFD')
		.replace(/[\u0300-\u036f]/g, '')
		.replace(/[^a-zA-Z0-9\s-]/g, '')
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-');
}

// unique slugs (adds -2, -3, ... if duplicates)
export function uniqueSlugs(items, getBase, setSlug) {
	const seen = new Map();
	for (const it of items) {
		const base = slugify(getBase(it));
		let s = base || 'articulo';
		let n = 1;
		while (seen.has(s)) {
			n += 1;
			s = `${base}-${n}`;
		}
		seen.set(s, true);
		setSlug(it, s);
	}
}

export function formatDate(isoDate, locale = 'es-ES') {
	return new Date(isoDate).toLocaleDateString(locale, {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
	});
}

export function hrefFor(a, base) {
	if (a.link) return a.link;
	if (a.isTopLevel) return `/${a.slug}`;
	if (base === '/' || base === '') return `/${a.slug}`;
	return `${base}/${a.slug}`;
}

export function absoluteUrlFor(a, origin, base) {
	if (a.link) return a.link;
	if (a.isTopLevel) return `${origin}/${a.slug}`;
	return `${origin}${base}/${a.slug}`;
}

// prefer marker; otherwise inject after </nav>
export function injectContent(template, html) {
	if (template.includes('<!-- CONTENT -->')) {
		return template.replace('<!-- CONTENT -->', html);
	}
	const re = /<\/nav>\s*<\/div>/i;
	if (re.test(template)) {
		return template.replace(re, `</nav>${html}</div>`);
	}
	// fallback before footer
	return template.replace(/<\/div>\s*<footer>/i, `${html}</div><footer>`);
}

export function injectRssLink(html) {
	const rssLink = `<link rel="alternate" type="application/rss+xml" title="${
		site.title || 'RSS'
	}" href="${site.origin}/rss.xml">`;

	if (html.includes('type="application/rss+xml"')) {
		// replace existing
		return html.replace(
			/<link[^>]+type="application\/rss\+xml"[^>]*>/i,
			rssLink
		);
	} else {
		// inject before </head>
		return html.replace('</head>', `${rssLink}</head>`);
	}
}

export async function minify(html) {
	return _minify(html, {
		collapseWhitespace: true,
		removeComments: true,
		removeRedundantAttributes: true,
		removeEmptyAttributes: true,
		useShortDoctype: true,
		minifyCSS: true,
		minifyJS: true,
	});
}
