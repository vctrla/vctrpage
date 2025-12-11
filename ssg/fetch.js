import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';
import { uniqueSlugs } from './utils.js';

async function getAllHtmlFiles(dir) {
	const entries = await fs.readdir(dir, { withFileTypes: true });
	let files = [];

	for (const entry of entries) {
		const full = path.join(dir, entry.name);

		if (entry.isDirectory()) {
			const subFiles = await getAllHtmlFiles(full);
			files = files.concat(subFiles);
		} else if (entry.isFile() && entry.name.endsWith('.html')) {
			files.push(full);
		}
	}

	return files;
}

export async function loadArticles(articlesPath) {
	const files = await getAllHtmlFiles(articlesPath);

	const items = await Promise.all(
		files.map(async (filePath) => {
			const raw = await fs.readFile(filePath, 'utf-8');
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
				newsletter: data.newsletter || null,
			};
		})
	);

	// generate stable unique slugs from title
	uniqueSlugs(
		items,
		(it) => it.title || '',
		(it, s) => (it.slug = s)
	);

	return items.sort((a, b) => new Date(b.date) - new Date(a.date));
}
