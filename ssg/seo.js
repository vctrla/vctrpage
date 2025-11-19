import fs from 'fs';
import path from 'path';
import { absoluteUrlFor } from './utils.js';
import { site, paths } from './config.js';
import { escAttr } from './utils.js';

function hashedAssetUrl(assetMap, logicalName) {
	// returns absolute URL to the hashed asset, or falls back to logical
	const p = assetMap?.[logicalName];
	return p ? `${site.origin}/${p}` : `${site.origin}/${logicalName}`;
}

export function buildMeta(
	{
		title,
		description,
		canonical,
		ogImage,
		robots = 'index, follow',
		type = 'website',
		skipCanonical = false,
	},
	assetMap
) {
	const t = escAttr(title);
	const d = escAttr(description);
	const c = canonical;

	// resolve og image with a safe fallback chain
	const LOGICAL_OG = 'og_img.png';
	let ogResolved = '';

	if (ogImage) {
		// if a full URL was provided -> use it as-is
		// if a logical name was provided -> try to hash-resolve it
		const looksLikeUrl = /^https?:\/\//i.test(ogImage);
		ogResolved = looksLikeUrl
			? ogImage
			: assetMap?.[ogImage]
			? `${site.origin}/${assetMap[ogImage]}`
			: `${site.origin}/${ogImage}`;
	} else if (assetMap?.[LOGICAL_OG]) {
		ogResolved = `${site.origin}/${assetMap[LOGICAL_OG]}`;
	} else if (site.ogImg) {
		ogResolved = site.ogImg; // may be non-hashed, acceptable fallback
	} else {
		ogResolved = `${site.origin}/${LOGICAL_OG}`;
	}

	const og = escAttr(ogResolved);
	const locale = (site.locale || 'es-ES').replace('-', '_');

	return `
<title>${t}</title>
${skipCanonical ? '' : `<link rel="canonical" href="${c}" />`}
<meta name="description" content="${d}" />
<meta name="robots" content="${robots}" />
<meta property="og:type" content="${type}" />
<meta property="og:title" content="${t}" />
<meta property="og:site_name" content="${escAttr(
		site.siteName || site.title
	)}" />
<meta property="og:description" content="${d}" />
<meta property="og:url" content="${c}" />
<meta property="og:image" content="${og}" />
<meta property="og:locale" content="${locale}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${t}" />
<meta name="twitter:description" content="${d}" />
<meta name="twitter:image" content="${og}" />
<meta name="twitter:site" content="@vctrlax" />
`.trim();
}

export function buildIndexJsonLd(latest, assetMap) {
	const website = {
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		'@id': site.origin + '/',
		name: site.title,
		url: site.origin + '/',
		inLanguage: site.locale || 'es-ES',
	};

	const blog = {
		'@context': 'https://schema.org',
		'@type': 'Blog',
		name: site.title,
		url: site.origin + '/',
		description: site.description,
		blogPost: latest.map((a) => ({
			'@id': absoluteUrlFor(a, site.origin, site.articlesBase),
		})),
	};

	return JSON.stringify([website, blog]);
}

export function buildArticleJsonLd(article, assetMap) {
	const img =
		article.img && assetMap[article.img]
			? `${site.origin}/${assetMap[article.img]}`
			: undefined;

	if (article.category === 'meta') {
		const asType = article.slug === 'sobre-vctr' ? 'AboutPage' : 'WebPage';

		const obj = {
			'@context': 'https://schema.org',
			'@type': asType,
			name: article.title,
			description: article.description || article.title,
			url: absoluteUrlFor(article, site.origin, site.articlesBase),
			inLanguage: site.locale || 'es-ES',
			isPartOf: { '@type': 'Blog', '@id': site.origin + '/' },
			author: {
				'@type': 'Organization',
				name: site.title,
				url: site.origin + '/',
			},
			publisher: {
				'@type': 'Organization',
				name: site.title,
				logo: {
					'@type': 'ImageObject',
					url: hashedAssetUrl(assetMap, 'favicon.png'),
				},
			},
			mainEntityOfPage: {
				'@type': 'WebPage',
				'@id': absoluteUrlFor(article, site.origin, site.articlesBase),
			},
		};

		if (img) obj.image = img;

		return JSON.stringify(obj);
	}

	return JSON.stringify({
		'@context': 'https://schema.org',
		'@type': 'BlogPosting',
		headline: article.title,
		description: article.description || article.title,
		datePublished: article.date,
		dateModified: article.date,
		url: absoluteUrlFor(article, site.origin, site.articlesBase),
		inLanguage: site.locale || 'es-ES',
		wordCount: article.content
			? article.content.trim().split(/\s+/).length
			: undefined,
		isPartOf: { '@type': 'Blog', '@id': site.origin + '/' },
		author: article.author
			? {
					'@type': 'Person',
					name: article.author,
					...(article.authorLink && { url: article.authorLink }),
			  }
			: {
					'@type': 'Organization',
					name: site.title,
					url: site.origin + '/',
			  },
		publisher: {
			'@type': 'Organization',
			name: site.title,
			logo: {
				'@type': 'ImageObject',
				url: hashedAssetUrl(assetMap, 'favicon.png'),
			},
		},
		mainEntityOfPage: {
			'@type': 'WebPage',
			'@id': absoluteUrlFor(article, site.origin, site.articlesBase),
		},
		...(img && { image: img }),
	});
}

export function writeRobotsTxt() {
	const robots = `User-agent: *\nAllow: /\nSitemap: ${site.origin}/sitemap.xml\n`;
	fs.writeFileSync(path.join(paths.dist, 'robots.txt'), robots, 'utf-8');
}

export function writeSitemap(articles, totalPages) {
	const today = new Date().toISOString().split('T')[0];
	const urls = [
		`<url><loc>${site.origin}/</loc><lastmod>${today}</lastmod></url>`,
		...Array.from({ length: totalPages - 1 }, (_, i) => {
			const page = i + 2; // pages start at 2
			return `<url><loc>${site.origin}/page/${page}</loc><lastmod>${today}</lastmod></url>`;
		}),
		...articles
			.filter((a) => !a.link && a.title !== '404' && a.title !== '500')
			.map((a) => {
				const loc = absoluteUrlFor(a, site.origin, site.articlesBase);
				return `<url><loc>${loc}</loc><lastmod>${a.date}</lastmod></url>`;
			}),
	];
	const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join(
		'\n'
	)}\n</urlset>`;
	fs.writeFileSync(path.join(paths.dist, 'sitemap.xml'), sitemap, 'utf-8');
}

export function writeRSS(articles, limit = 20) {
	const latest = articles
		.filter((a) => !a.link && !a.isTopLevel) // only real articles
		.sort((a, b) => new Date(b.date) - new Date(a.date))
		.slice(0, limit);

	const rssItems = latest
		.map((a) => {
			const url = absoluteUrlFor(a, site.origin, site.articlesBase);
			const pubDate = new Date(a.date).toUTCString();

			return `
                <item>
                    <title><![CDATA[${a.title}]]></title>
                    <link>${url}</link>
                    <guid isPermaLink="true">${url}</guid>
                    <pubDate>${pubDate}</pubDate>
                    ${
											a.author
												? `<dc:creator><![CDATA[${a.author}]]></dc:creator>`
												: ''
										}
                </item>`;
		})
		.join('\n');

	const rss = `<?xml version="1.0" encoding="UTF-8"?>
                <rss version="2.0"
                    xmlns:dc="http://purl.org/dc/elements/1.1/"
                    xmlns:atom="http://www.w3.org/2005/Atom">
                    <channel>
                        <title><![CDATA[${site.title}]]></title>
                        <link>${site.origin}/</link>
                        <description><![CDATA[${
													site.description
												}]]></description>
                        <language>${site.locale || 'en'}</language>
                        <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
                        <atom:link href="${
													site.origin
												}/rss.xml" rel="self" type="application/rss+xml"/>
                        ${rssItems}
                    </channel>
                </rss>`;

	fs.writeFileSync(path.join(paths.dist, 'rss.xml'), rss, 'utf-8');
	console.log(
		`✅ RSS feed written with ${latest.length} articles (no descriptions)`
	);
}
