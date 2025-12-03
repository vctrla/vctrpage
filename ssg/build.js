import fs, { rmSync } from 'fs';
import path from 'path';
import { paths, site } from './config.js';
import {
	formatDate,
	hrefFor,
	injectContent,
	minify,
	escAttr,
	injectRssLink,
} from './utils.js';
import { processAssets } from './assets.js';
import { embedNewsletter } from './newsletter.js';
import { loadTemplateWithExtras, updateHeadPerArticle } from './templates.js';
import {
	buildArticleJsonLd,
	buildIndexJsonLd,
	writeRobotsTxt,
	writeSitemap,
	writeRSS,
	buildMeta,
} from './seo.js';
import { loadArticles } from './fetch.js';
import { generateCdnHeaders } from './cloudflare.js';
import { landingImgTag, articleImgTag } from './imgs.js';

const IS_PROD = process.env.NODE_ENV === 'production';
const ARTICLES_ON_LANDING = 4;
const ARTICLES_PER_PAGE = 3;
const articlesWithoutHeader = ['404', '500'];
const MAX_INTERNAL_LINKS = 3;

function renderArticlesList(articles, assetMap, { isLanding = false } = {}) {
	return `<h1 class="visually-hidden">Artículos de Víctor</h1>
    <ul class="landing-list">
        ${articles
					.filter((a) => !a.isTopLevel)
					.map((a, i) => {
						const href = hrefFor(a, site.articlesBase);
						const target = a.link
							? ' target="_blank" rel="noopener noreferrer"'
							: '';

						const imgTag =
							a.img && assetMap[a.img]
								? landingImgTag({
										asset: assetMap[a.img],
										title: a.title,
										highPriority: isLanding && i === 0,
								  })
								: '';

						const authorTag = a.author
							? `<p class="article-author">${escAttr(a.author)}</p>`
							: '';

						// layout for all others
						return `<li class="landing-item">
                                        <a class="landing-link" href="${href}"${target}>
                                            ${imgTag}
                                            <div class="landing-item-text">
                                                <p class="landing-title">${escAttr(
																									a.title
																								)}</p>
                                                <p class="landing-description">${escAttr(
																									a.description
																								)}</p>
                                                <div class="landing-item-meta">
                                                    <p class="date">
                                                        <time datetime="${
																													a.date
																												}">${formatDate(
							a.date,
							site.locale
						)}</time>
                                                    </p>
                                                    ${authorTag}
                                                </div>
                                            </div>
                                        </a>
                                    </li>`;
					})
					.join('\n')}
        </ul>`;
}

function paginate(array) {
	const pages = [];
	for (let i = 0; i < array.length; i += ARTICLES_PER_PAGE) {
		pages.push(array.slice(i, i + ARTICLES_PER_PAGE));
	}
	return pages;
}

function buildMoreBtn(nextUrl) {
	return nextUrl
		? `<div class="load-more">
			<a href="${nextUrl}" class="load-more-link">Ver más</a>
			<noscript><a href="${nextUrl}">Ver más</a></noscript>
		  </div>`
		: '';
}

function buildInternalLinking(article, allArticles, assetMap) {
	const links = [];

	// explicit linking -> article.linking is an array of slugs
	if (Array.isArray(article.linking) && article.linking.length) {
		for (const slug of article.linking) {
			const target = allArticles.find((a) => a.slug === slug);
			if (target && target.slug !== article.slug) {
				links.push(target);
				if (links.length === MAX_INTERNAL_LINKS) break;
			}
		}
	}

	// first fallback: fill remaining with most recent articles from the same category
	if (links.length < MAX_INTERNAL_LINKS && article.category) {
		const remaining = allArticles
			.filter(
				(a) =>
					a.slug !== article.slug &&
					a.category === article.category &&
					!links.some((l) => l.slug === a.slug)
			)
			.slice(0, MAX_INTERNAL_LINKS - links.length);

		links.push(...remaining);
	}

	// final fallback with "non-git" precedence
	if (links.length < MAX_INTERNAL_LINKS) {
		// candidates: all articles except current + already linked
		const candidates = allArticles.filter(
			(a) => a.slug !== article.slug && !links.some((l) => l.slug === a.slug)
		);

		// 1) first, non-git categories
		const nonGit = candidates
			.filter((a) => a.category !== 'git')
			.slice(0, MAX_INTERNAL_LINKS - links.length);

		links.push(...nonGit);

		// 2) if still not filled -> allow remaining (incl. git)
		if (links.length < MAX_INTERNAL_LINKS) {
			const remainingGlobal = candidates
				.filter((a) => !links.some((l) => l.slug === a.slug)) // avoid dupes
				.slice(0, MAX_INTERNAL_LINKS - links.length);

			links.push(...remainingGlobal);
		}
	}

	// nothing ->  don't render anything
	if (!links.length) return '';

	// build html
	const itemsHtml = links
		.map((a) => {
			const href = hrefFor(a, site.articlesBase);
			const targetAttr = a.link
				? ' target="_blank" rel="noopener noreferrer"'
				: '';

			const imgTag =
				a.img && assetMap[a.img]
					? landingImgTag({
							asset: assetMap[a.img],
							title: a.title,
							highPriority: false,
					  })
					: '';

			const authorTag = a.author
				? `<p class="article-author">${escAttr(a.author)}</p>`
				: '';

			return `
				<li class="internal-linking-item">
					<a class="internal-linking-link" href="${href}"${targetAttr}>
						${imgTag}
						<div class="internal-linking-item-text">
							<p class="internal-linking-title">${escAttr(a.title)}</p>
                            <p class="internal-linking-description">${escAttr(
															a.description
														)}</p>
							<div class="internal-linking-item-meta">
								<p class="date">
                                    <time datetime="${a.date}">${formatDate(
				a.date,
				site.locale
			)}</time>
                                </p>
								${authorTag}
							</div>
						</div>
					</a>
				</li>
			`;
		})
		.join('\n');

	return `
		<aside class="internal-linking" role="complementary" aria-labelledby="relacionados-titulo">
			<h2 id="relacionados-titulo" class="internal-linking-title">También puede interesarte:</h2>
			<ul class="internal-linking-list">
				${itemsHtml}
			</ul>
		</aside>
	`;
}

// BUILD
async function build() {
	// clean dist
	if (fs.existsSync(paths.dist)) {
		rmSync(paths.dist, { recursive: true, force: true });
		if (fs.existsSync(paths.dist)) {
			console.error('❌ Failed to remove dist directory');
		}
	}
	fs.mkdirSync(paths.dist, { recursive: true });

	// assets
	const { assetMap } = await processAssets();

	// content
	const articles = loadArticles(paths.articles);
	const latestArticles = articles
		.filter((a) => !a.isTopLevel)
		.slice(0, ARTICLES_ON_LANDING);

	// pagination
	const remainingArticles = articles
		.filter((a) => !a.isTopLevel)
		.slice(ARTICLES_ON_LANDING);
	const paginated = paginate(remainingArticles);

	// template
	const jsonLdMin = buildIndexJsonLd(latestArticles, assetMap);
	const baseTemplate = loadTemplateWithExtras(assetMap, jsonLdMin);

	// email newsletter HTML
	const turnstileSiteKey = IS_PROD
		? '0x4AAAAAACBv_qQyd1sIX-Ve'
		: // : '3x00000000000000000000FF'; // testing key (always shows visible)
		  '1x00000000000000000000BB'; // testing key (always passes invisible)

	const landingNewsletterHtml = embedNewsletter(
		'Recibe nuevos artículos en tu correo:',
		turnstileSiteKey
	);
	const articleNewsletterHtml = embedNewsletter(
		'Si te ha gustado este artículo, <br>recibe los próximos por email:',
		turnstileSiteKey
	);

	// index.html
	const listHtml = renderArticlesList(latestArticles, assetMap, {
		isLanding: true,
	});
	let indexHtml = injectContent(baseTemplate, listHtml + landingNewsletterHtml);
	indexHtml = injectRssLink(indexHtml);

	if (paginated.length > 0) {
		indexHtml = indexHtml.replace(
			/<\/head>/i,
			`<link rel="next" href="/page/2"></head>`
		);

		const moreBtn = buildMoreBtn('/page/2');
		indexHtml = indexHtml.replace('</ul>', `</ul>${moreBtn}`);
	}

	fs.writeFileSync(
		path.join(paths.dist, 'index.html'),
		await minify(indexHtml),
		'utf-8'
	);

	if (paginated.length > 0) {
		for (let i = 0; i < paginated.length; i++) {
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
			fs.mkdirSync(path.dirname(pageFile), { recursive: true });
			fs.writeFileSync(pageFile, await minify(html), 'utf-8');
		}
	}

	// each article (internal only)
	const articleDir = path.join(
		paths.dist,
		site.articlesBase.replace(/^\//, '')
	);
	fs.mkdirSync(articleDir, { recursive: true });

	for (const article of articles) {
		if (article.link) continue; // external -> don’t build a file

		const isError = articlesWithoutHeader.includes(article.title);

		const articleJsonLd = isError
			? null
			: buildArticleJsonLd(article, assetMap);
		let html = loadTemplateWithExtras(assetMap, articleJsonLd);
		html = updateHeadPerArticle(html, article, assetMap);

		const publishedStr = formatDate(article.date, site.locale);
		const modifiedStr =
			article.modified && article.modified !== article.date
				? formatDate(article.modified, site.locale)
				: null;

		const articleHeader = `
    <h1 class="article-title">${escAttr(article.title)}</h1>
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
			assetMap
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
			fs.writeFileSync(
				path.join(paths.dist, `${article.slug}.html`),
				await minify(html),
				'utf-8'
			);
		} else {
			// under /articulos/
			fs.writeFileSync(
				path.join(articleDir, `${article.slug}.html`),
				await minify(html),
				'utf-8'
			);
		}
	}

	writeRobotsTxt();
	writeSitemap(articles, latestArticles, paginated);
	writeRSS(articles, 12);

	const icoSrc = path.join(paths.rootDir, 'favicon.ico');
	const icoDest = path.join(paths.dist, 'favicon.ico');

	if (fs.existsSync(icoSrc)) {
		fs.copyFileSync(icoSrc, icoDest);
		console.log('✅ favicon.ico copied to dist');
	} else {
		console.warn('⚠️ No favicon.ico found, skipping copy');
	}

	generateCdnHeaders(paths.dist);

	console.log(
		'✅ SSG completed on ' + (IS_PROD ? 'production' : 'development') + ' mode'
	);
}

build();
