import fs from 'fs';
import path from 'path';
import { escapeRegex, absoluteUrlFor, isoDate } from './utils.js';
import { site, paths } from './config.js';
import { buildMeta } from './seo.js';

export function loadTemplateWithExtras(assetMap, jsonLdMin) {
	const template = fs
		.readFileSync(path.join(paths.templates, 'template.html'), 'utf-8')
		.trim();

	const defaultHead = buildMeta(
		{
			title: site.title,
			description: site.description,
			canonical: site.origin,
			ogImage: site.ogImg,
			type: 'website',
		},
		assetMap
	);

	let out = template.replace(
		'<!-- HEAD_DYNAMIC -->',
		`<!-- HEAD_START -->\n${defaultHead}\n<!-- HEAD_END -->`
	);

	if (jsonLdMin) {
		out = out.replace(
			/<\/head>/i,
			`<script type="application/ld+json">${jsonLdMin}</script></head>`
		);
	}

	for (const [orig, hashed] of Object.entries(assetMap)) {
		if (typeof hashed === 'string') {
			const re = new RegExp(`/?${escapeRegex(orig)}`, 'g');
			out = out.replace(re, `/${hashed}`);
		}
	}

	return out;
}

// PER ARTICLE HEAD TAGS
export function updateHeadPerArticle(html, article, assetMap) {
	const isError = article.title === '404' || article.title === '500';

	const canonical = absoluteUrlFor(article, site.origin, site.articlesBase);

	const siteOgHashed = assetMap['og_img.png']
		? `${site.origin}/${assetMap['og_img.png']}`
		: `${site.origin}/og_img.png`;
	const ogImage =
		article.img && assetMap[article.img]
			? `${site.origin}/${assetMap[article.img]}`
			: siteOgHashed;

	const metaType = article.isTopLevel ? 'website' : 'article';

	const published = isoDate(article.date);
	const modified = article.modified ? isoDate(article.modified) : published;

	const head = buildMeta(
		{
			title: article.title,
			description: article.description || article.title || site.description,
			canonical,
			published,
			modified,
			ogImage,
			type: metaType,
			robots: isError ? 'noindex, nofollow' : 'index, follow',
			skipCanonical: isError,
		},
		assetMap
	);

	// prefer replacing wrapped block if present
	if (/<!-- HEAD_START -->[\s\S]*?<!-- HEAD_END -->/i.test(html)) {
		return html.replace(
			/<!-- HEAD_START -->[\s\S]*?<!-- HEAD_END -->/i,
			`<!-- HEAD_START -->\n${head}\n<!-- HEAD_END -->`
		);
	}

	// fallback: if placeholder somehow survived (shouldn’t happen)
	if (html.includes('<!-- HEAD_DYNAMIC -->')) {
		return html.replace(
			'<!-- HEAD_DYNAMIC -->',
			`<!-- HEAD_START -->\n${head}\n<!-- HEAD_END -->`
		);
	}

	// last resort: inject before </head>
	return html.replace(
		/<\/head>/i,
		`<!-- HEAD_START -->\n${head}\n<!-- HEAD_END --></head>`
	);
}
