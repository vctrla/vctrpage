import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { uniqueSlugs } from './utils.js';

function getAllHtmlFiles(dir) {
	const entries = fs.readdirSync(dir, { withFileTypes: true });
	let files = [];
	for (const entry of entries) {
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			files = files.concat(getAllHtmlFiles(full));
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			files.push(full);
		}
	}
	return files;
}

export function loadArticles(articlesPath) {
	const files = getAllHtmlFiles(articlesPath);

	const items = files.map((filePath) => {
		const raw = fs.readFileSync(filePath, 'utf-8');
		const { data, content } = matter(raw);

		// figure out relative path to articlesPath
		const relPath = path.relative(articlesPath, filePath);
		const parts = relPath.split(path.sep);

		return {
			// slug will be filled by uniqueSlugs below
			slug: '',
			link: data.link || null,
			title: data.title,
			description: data.description || null,
			date: data.date,
			modified: data.modified || null,
			author: data.author || null,
			authorLink: data.authorLink || null,
			img: data.img,
			content,
			filePath,
			isTopLevel: parts.length === 1,
			category: data.category || null,
			linking: data['linking'] || null,
			sources: data.sources || '',
		};
	});

	// generate stable unique slugs from title
	uniqueSlugs(
		items,
		(it) => it.title || '',
		(it, s) => (it.slug = s)
	);

	return items.sort((a, b) => new Date(b.date) - new Date(a.date));
}
