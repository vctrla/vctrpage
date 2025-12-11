import fs from 'fs';
import path from 'path';
import { escapeRegex } from './utils.js';
import { site, paths } from './config.js';
import { buildMeta } from './seo.js';

let cachedBaseTemplate = null;

export function loadTemplateWithExtras(assetMap, jsonLdMin) {
	if (!cachedBaseTemplate) {
		cachedBaseTemplate = fs.readFileSync(
			path.join(paths.templates, 'template.html'),
			'utf-8'
		);
	}

	const defaultHead = buildMeta(
		{
			title: site.title,
			description: site.description,
			canonical: site.origin + '/',
			ogImage: site.ogImg,
			type: 'website',
		},
		assetMap
	);

	let out = cachedBaseTemplate.replace(
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
