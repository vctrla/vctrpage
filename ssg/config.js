import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

export const paths = {
	rootDir,
	dist: path.join(rootDir, 'dist'),
	articles: '/Users/vitor/Desktop/articles',
	images: '/Users/vitor/Desktop/images',
	templates: path.join(rootDir, 'templates'),
	assets: path.join(rootDir, 'assets'),
	hashFile: path.join(rootDir, 'hashes.json'),
};

export const site = {
	title: 'Víctor',
	description: 'Víctor. La curiosidad: infinita.',
	origin: 'https://vctr.page',
	ownerName: 'Víctor López Arias',
	local: 'http://localhost:8788',
	articlesBase: '/articulos',
	locale: 'es-ES',
	ogImg: 'https://vctr.page/og_img.png',
	siteName: 'Víctor',
};
