import fs from 'fs/promises';
import path from 'path';
import { paths, site } from './config.js';
import { injectContent, minify, injectRssLink, buildMoreBtn } from './utils.js';
import { loadTemplateWithExtras } from './load-templates.js';
import { renderArticlesList } from './render-landing.js';
import { buildIndexJsonLd, buildMeta } from './seo.js';

export async function renderPaginated(paginated, i, assetMap) {
	const pageArticles = paginated[i];
	const jsonLdMin = buildIndexJsonLd(pageArticles, assetMap);
	let html = loadTemplateWithExtras(assetMap, jsonLdMin);

	const listHtml = renderArticlesList(pageArticles, assetMap);
	html = injectContent(html, listHtml);
	html = injectRssLink(html);

	const nextUrl = i + 1 < paginated.length ? `/page/${i + 3}` : null;
	const moreBtn = nextUrl ? buildMoreBtn(nextUrl) : '';
	html = html.replace('</ul>', `</ul>${moreBtn}`);

	// prev/next link tags
	const prevUrl = i === 0 ? '/' : `/page/${i + 1}`;
	const prevLink = `<link rel="prev" href="${prevUrl}">`;
	const nextLink = nextUrl ? `<link rel="next" href="${nextUrl}">` : '';
	html = html.replace('</head>', `${prevLink}${nextLink}</head>`);

	// build & swap the entire head block for this page
	const pageNum = i + 2; // pages start at 2
	const pageTitle = `${site.title} — Página ${pageNum}`;
	const pageCanon = `${site.origin}/page/${pageNum}`;

	const pagedHead = buildMeta(
		{
			title: pageTitle,
			description: site.description, // keep site-wide desc for paginated lists
			canonical: pageCanon,
			type: 'website',
		},
		assetMap
	);

	// replace wrapped head block inserted by loadTemplateWithExtras
	if (/<!-- HEAD_START -->[\s\S]*?<!-- HEAD_END -->/i.test(html)) {
		html = html.replace(
			/<!-- HEAD_START -->[\s\S]*?<!-- HEAD_END -->/i,
			`<!-- HEAD_START -->\n${pagedHead}\n<!-- HEAD_END -->`
		);
	} else if (html.includes('<!-- HEAD_DYNAMIC -->')) {
		// fallback if placeholder survived
		html = html.replace(
			'<!-- HEAD_DYNAMIC -->',
			`<!-- HEAD_START -->\n${pagedHead}\n<!-- HEAD_END -->`
		);
	} else {
		// last resort: inject before </head>
		html = html.replace(
			'</head>',
			`<!-- HEAD_START -->\n${pagedHead}\n<!-- HEAD_END --></head>`
		);
	}

	// write file
	const pageFile = path.join(paths.dist, 'page', `${pageNum}.html`);
	await fs.mkdir(path.dirname(pageFile), { recursive: true });
	await fs.writeFile(pageFile, await minify(html), 'utf-8');
}
