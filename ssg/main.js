import fs, { rmSync } from 'fs';
import path from 'path';
import { paths, site, ui } from './config.js';
import { injectContent, minify, injectRssLink, buildMoreBtn } from './utils.js';
import { processAssets } from './assets.js';
import { embedNewsletter } from './newsletter.js';
import { loadTemplateWithExtras } from './load-templates.js';
import { renderArticlesList } from './render-landing.js';
import { renderArticle } from './render-article.js';
import { renderPaginated } from './render-paginated.js';
import {
	buildIndexJsonLd,
	writeRobotsTxt,
	writeSitemap,
	writeRSS,
} from './seo.js';
import { loadArticles } from './fetch.js';
import { generateCdnHeaders } from './cloudflare.js';

const IS_PROD = process.env.NODE_ENV === 'production';

// *
// **
// ***
// ****
// ***** helper functions
function paginate(array) {
	const pages = [];
	for (let i = 0; i < array.length; i += ui.articlesPerPage) {
		pages.push(array.slice(i, i + ui.articlesPerPage));
	}
	return pages;
}

// *
// **
// ***
// ****
// ***** build
async function build() {
	const startTime = performance.now();
	console.log('⏳ Build started…');

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
		.slice(0, ui.articlesOnLanding);

	// pagination
	const remainingArticles = articles
		.filter((a) => !a.isTopLevel)
		.slice(ui.articlesOnLanding);
	const paginated = paginate(remainingArticles);

	if (paginated.length > 0) {
		for (let i = 0; i < paginated.length; i++) {
			await renderPaginated(paginated, i, assetMap);
		}
	}

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

	// each article
	const articleDir = path.join(
		paths.dist,
		site.articlesBase.replace(/^\//, '')
	);
	fs.mkdirSync(articleDir, { recursive: true });

	for (const article of articles) {
		if (article.link) continue; // external -> don’t build a file

		await renderArticle(
			article,
			articles,
			assetMap,
			landingNewsletterHtml,
			turnstileSiteKey,
			articleDir
		);
	}

	// SEO files
	writeRobotsTxt();
	writeSitemap(articles, latestArticles, paginated);
	writeRSS(articles, 12);

	// favicon.ico
	const icoSrc = path.join(paths.rootDir, 'favicon.ico');
	const icoDest = path.join(paths.dist, 'favicon.ico');

	if (fs.existsSync(icoSrc)) {
		fs.copyFileSync(icoSrc, icoDest);
		console.log('✅ favicon.ico copied to dist');
	} else {
		console.warn('⚠️ No favicon.ico found, skipping copy');
	}

	// Cloudflare CDN headers
	generateCdnHeaders(paths.dist);

	// done
	const endTime = performance.now();
	const seconds = ((endTime - startTime) / 1000).toFixed(2);

	console.log(
		`✅ (${seconds}s) SSG completed ~ ${
			IS_PROD ? 'production' : 'development'
		} mode`
	);
}

build();
