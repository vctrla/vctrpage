import fs from 'fs/promises';
import path from 'path';
import { paths, site, ui } from './config.js';
import {
	injectContent,
	minify,
	injectRssLink,
	buildMoreBtn,
	saveHashes,
	hashString,
} from './utils.js';
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
async function exists(p) {
	try {
		await fs.access(p);
		return true;
	} catch {
		return false;
	}
}

function paginate(array) {
	const pages = [];
	for (let i = 0; i < array.length; i += ui.articlesPerPage) {
		pages.push(array.slice(i, i + ui.articlesPerPage));
	}
	return pages;
}

// minimal article fingerprint for incremental rebuilds
function articleSignature(article, templateHash, assetMapHash) {
	return JSON.stringify({
		type: 'article',
		slug: article.slug,
		title: article.title,
		description: article.description,
		date: article.date,
		modified: article.modified || null,
		img: article.img || null,
		author: article.author || null,
		authorLink: article.authorLink || null,
		category: article.category || null,
		isTopLevel: article.isTopLevel || false,
		content: article.content || '',
		sources: article.sources || '',
		templateHash,
		assetMapHash,
	});
}

// small snippet of article data for list/pagination signatures
function pageArticlesSignature(pageArticles) {
	return pageArticles.map((a) => ({
		slug: a.slug,
		title: a.title,
		description: a.description,
		date: a.date,
		img: a.img || null,
	}));
}

// *
// **
// ***
// ****
// ***** build
async function build() {
	const startTime = performance.now();
	console.log('⏳ Build started…');

	// clean dist only in production
	if (IS_PROD && (await exists(paths.dist))) {
		console.log('🧹 Cleaning dist directory…');
		await fs.rm(paths.dist, { recursive: true, force: true });
		if (await exists(paths.dist)) {
			console.error('❌ Failed to remove dist directory');
		}
	}

	// ensure dist exists
	await fs.mkdir(paths.dist, { recursive: true });

	// assets
	const { assetMap, hashes } = await processAssets();

	// fingerprint template + assetMap so we can invalidate when they change
	const templateSource = await fs.readFile(
		path.join(paths.templates, 'template.html'),
		'utf-8'
	);
	const templateHash = hashString(templateSource);
	const assetMapHash = hashString(JSON.stringify(assetMap));

	// content
	const articles = await loadArticles(paths.articles);
	const latestArticles = articles
		.filter((a) => !a.isTopLevel)
		.slice(0, ui.articlesOnLanding);

	// pagination data
	const remainingArticles = articles
		.filter((a) => !a.isTopLevel)
		.slice(ui.articlesOnLanding);
	const paginated = paginate(remainingArticles);

	// incremental index.html (landing)
	const indexKey = 'html:index';
	const indexSig = JSON.stringify({
		type: 'index',
		templateHash,
		assetMapHash,
		articles: pageArticlesSignature(latestArticles),
	});
	const indexHash = hashString(indexSig);
	const indexPath = path.join(paths.dist, 'index.html');
	const prevIndexHash = hashes[indexKey];
	const shouldRenderIndex =
		prevIndexHash !== indexHash || !(await exists(indexPath));

	if (shouldRenderIndex) {
		hashes[indexKey] = indexHash;

		// template + JSON-LD
		const jsonLdMin = buildIndexJsonLd(latestArticles, assetMap);
		const baseTemplate = await loadTemplateWithExtras(assetMap, jsonLdMin);

		// email newsletter HTML
		const turnstileSiteKey = IS_PROD
			? '0x4AAAAAACBv_qQyd1sIX-Ve'
			: '1x00000000000000000000BB';

		const landingNewsletterHtml = embedNewsletter(
			'Recibe nuevos artículos en tu correo:',
			turnstileSiteKey
		);

		// index.html
		const listHtml = renderArticlesList(latestArticles, assetMap, {
			isLanding: true,
		});
		let indexHtml = injectContent(
			baseTemplate,
			listHtml + landingNewsletterHtml
		);
		indexHtml = injectRssLink(indexHtml);

		if (paginated.length > 0) {
			indexHtml = indexHtml.replace(
				/<\/head>/i,
				`<link rel="next" href="/page/2"></head>`
			);

			const moreBtn = buildMoreBtn('/page/2');
			indexHtml = indexHtml.replace('</ul>', `</ul>${moreBtn}`);
		}

		const minified = await minify(indexHtml);
		await fs.writeFile(indexPath, minified, 'utf-8');
	}

	// incremental paginated pages (/page/2, /page/3, …)
	if (paginated.length > 0) {
		const pageTasks = [];

		for (let i = 0; i < paginated.length; i++) {
			const pageArticles = paginated[i];
			const pageNum = i + 2; // pages start at 2
			const key = `html:page:${pageNum}`;

			const sig = JSON.stringify({
				type: 'paginated',
				pageNum,
				templateHash,
				assetMapHash,
				articles: pageArticlesSignature(pageArticles),
			});
			const sigHash = hashString(sig);

			const outPath = path.join(paths.dist, 'page', `${pageNum}.html`);
			const prev = hashes[key];

			if (prev === sigHash && (await exists(outPath))) {
				continue; // unchanged page, skip
			}

			hashes[key] = sigHash;
			pageTasks.push(renderPaginated(paginated, i, assetMap));
		}

		if (pageTasks.length > 0) {
			await Promise.all(pageTasks);
		}
	}

	// articles (incremental per article)
	const articleDir = path.join(
		paths.dist,
		site.articlesBase.replace(/^\//, '')
	);
	await fs.mkdir(articleDir, { recursive: true });

	const articleTasks = [];

	// newsletter html & key computed once
	const turnstileSiteKey = IS_PROD
		? '0x4AAAAAACBv_qQyd1sIX-Ve'
		: '1x00000000000000000000BB';

	const landingNewsletterHtml = embedNewsletter(
		'Recibe nuevos artículos en tu correo:',
		turnstileSiteKey
	);

	for (const article of articles) {
		if (article.link) continue; // skip external link articles

		const sig = articleSignature(article, templateHash, assetMapHash);
		const sigHash = hashString(sig);
		const key = `html:article:${article.slug}`;

		const outPath = article.isTopLevel
			? path.join(paths.dist, `${article.slug}.html`)
			: path.join(articleDir, `${article.slug}.html`);

		const prev = hashes[key];

		// skip rebuild if unchanged and file exists
		if (prev === sigHash && (await exists(outPath))) {
			continue;
		}

		hashes[key] = sigHash;

		articleTasks.push(
			renderArticle(
				article,
				articles,
				assetMap,
				landingNewsletterHtml,
				turnstileSiteKey,
				articleDir
			)
		);
	}

	if (articleTasks.length > 0) {
		await Promise.all(articleTasks);
	}

	// concurrent fs operations
	await Promise.all([
		writeRobotsTxt(),
		writeSitemap(articles, latestArticles, paginated),
		writeRSS(articles, 12),
		(async () => {
			const icoSrc = path.join(paths.rootDir, 'favicon.ico');
			const icoDest = path.join(paths.dist, 'favicon.ico');

			if (await exists(icoSrc)) {
				await fs.copyFile(icoSrc, icoDest);
				console.log('✅ favicon.ico copied to dist');
			} else {
				console.warn('⚠️ No favicon.ico found, skipping copy');
			}
		})(),
		generateCdnHeaders(paths.dist),
		saveHashes(paths.hashFile, hashes),
	]);

	// done
	const endTime = performance.now();
	const seconds = ((endTime - startTime) / 1000).toFixed(2);

	console.log(
		`🏁 (${seconds}s) SSG completed ~ ${
			IS_PROD ? 'production' : 'development'
		} mode`
	);
}

build().catch((err) => {
	console.error('❌ Build failed:', err);
	process.exitCode = 1;
});
