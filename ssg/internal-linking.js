import { site } from './config.js';
import { formatDate, escAttr, hrefFor } from './utils.js';
import { landingImgTag } from './imgs.js';

export function buildInternalLinking(
	article,
	allArticles,
	assetMap,
	maxInternalLinks
) {
	const links = [];

	// explicit linking -> article.linking is an array of slugs
	if (Array.isArray(article.linking) && article.linking.length) {
		for (const slug of article.linking) {
			const target = allArticles.find((a) => a.slug === slug);
			if (target && target.slug !== article.slug) {
				links.push(target);
				if (links.length === maxInternalLinks) break;
			}
		}
	}

	// first fallback: fill remaining with most recent articles from the same category
	if (links.length < maxInternalLinks && article.category) {
		const remaining = allArticles
			.filter(
				(a) =>
					a.slug !== article.slug &&
					a.category === article.category &&
					!links.some((l) => l.slug === a.slug)
			)
			.slice(0, maxInternalLinks - links.length);

		links.push(...remaining);
	}

	// final fallback with "non-git" precedence
	if (links.length < maxInternalLinks) {
		// candidates: all articles except current + already linked
		const candidates = allArticles.filter(
			(a) => a.slug !== article.slug && !links.some((l) => l.slug === a.slug)
		);

		// 1) first, non-git categories
		const nonGit = candidates
			.filter((a) => a.category !== 'git')
			.slice(0, maxInternalLinks - links.length);

		links.push(...nonGit);

		// 2) if still not filled -> allow remaining (incl. git)
		if (links.length < maxInternalLinks) {
			const remainingGlobal = candidates
				.filter((a) => !links.some((l) => l.slug === a.slug)) // avoid dupes
				.slice(0, maxInternalLinks - links.length);

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
                            <p class="internal-linking-title">${escAttr(
															a.title
														)}</p>
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
