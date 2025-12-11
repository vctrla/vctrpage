import fs from 'fs/promises';
import path from 'path';
import { paths, site, ui } from './config.js';
import {
	formatDate,
	injectContent,
	minify,
	escAttr,
	injectRssLink,
	absoluteUrlFor,
	isoDate,
} from './utils.js';
import { embedNewsletter } from './newsletter.js';
import { buildInternalLinking } from './internal-linking.js';
import { loadTemplateWithExtras } from './load-templates.js';
import { buildArticleJsonLd, buildMeta } from './seo.js';
import { articleImgTag } from './imgs.js';

// *
// **
// ***
// ****
// ***** update head per article
function updateHeadPerArticle(html, article, assetMap) {
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

// *
// **
// ***
// ****
// ***** render
export async function renderArticle(
	article,
	articles,
	assetMap,
	landingNewsletterHtml,
	turnstileSiteKey,
	articleDir
) {
	const isError = ui.articlesWithoutHeader.includes(article.title);

	const articleJsonLd = isError ? null : buildArticleJsonLd(article, assetMap);
	let html = loadTemplateWithExtras(assetMap, articleJsonLd);
	html = updateHeadPerArticle(html, article, assetMap);

	const publishedStr = formatDate(article.date, site.locale);
	const modifiedStr =
		article.modified && article.modified !== article.date
			? formatDate(article.modified, site.locale)
			: null;

	const articleHeader = `
    <h1 class="article-title">${escAttr(article.title)}</h1>
    <p class="article-description">${escAttr(article.description)}</p>
    ${
			article.author
				? article.authorLink
					? `<div class="article-sub">
                        <p class="date">
                            <time datetime="${
															article.date
														}">${publishedStr}</time>
                            ${
															modifiedStr
																? ` · Actualizado: <time datetime="${article.modified}">${modifiedStr}</time>`
																: ''
														}
                        </p>
                        <p class="article-author">
                            <a href="${
															article.authorLink
														}" target="_blank" rel="noopener noreferrer">
                                ${escAttr(article.author)}
                            </a>
                            <svg
                                class="author-link-icon"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                stroke-width="2"
                            >
                                <path d="M7 17L17 7M17 7H7M17 7V17" />
                            </svg>
                        </p>
                    </div>`
					: `<div class="article-sub">
                        <p class="date">
                            <time datetime="${
															article.date
														}">${publishedStr}</time>
                            ${
															modifiedStr
																? ` · Actualizado: <time datetime="${article.modified}">${modifiedStr}</time>`
																: ''
														}
                        </p>
                        <p class="article-author">${escAttr(article.author)}</p>
                    </div>`
				: `
                    <div class="article-sub">
                        <p class="date">
                            <time datetime="${
															article.date
														}">${publishedStr}</time>
                            ${
															modifiedStr
																? ` · Actualizado: <time datetime="${article.modified}">${modifiedStr}</time>`
																: ''
														}
                        </p>
                    </div>
                `
		}
`;

	const imageTag =
		article.img && assetMap[article.img]
			? articleImgTag({ asset: assetMap[article.img], title: article.title })
			: '';

	const linkableArticles = articles.filter((a) => a.category !== 'meta');

	const internalLinking = buildInternalLinking(
		article,
		linkableArticles,
		assetMap,
		ui.maxInternalLinks
	);

	const articleNewsletterHtml = embedNewsletter(
		'Si te ha gustado este artículo, <br>recibe los próximos por email:',
		turnstileSiteKey
	);

	if (article.category !== 'meta') {
		html = injectContent(
			html,
			articleHeader +
				imageTag +
				article.content +
				articleNewsletterHtml +
				internalLinking +
				article.sources
		);
	} else {
		html = injectContent(html, article.content + landingNewsletterHtml);
	}

	html = injectRssLink(html);

	if (article.isTopLevel) {
		// root
		await fs.writeFile(
			path.join(paths.dist, `${article.slug}.html`),
			await minify(html),
			'utf-8'
		);
	} else {
		// under /articulos/
		await fs.writeFile(
			path.join(articleDir, `${article.slug}.html`),
			await minify(html),
			'utf-8'
		);
	}
}
