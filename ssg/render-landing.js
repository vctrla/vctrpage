import { formatDate, hrefFor, escAttr } from './utils.js';
import { landingImgTag } from './imgs.js';
import { site } from './config.js';

export function renderArticlesList(
	articles,
	assetMap,
	{ isLanding = false } = {}
) {
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
