import fs from 'fs/promises';
import path from 'path';

export async function generateCdnHeaders(distDir) {
	const allowedHosts = [
		"'self'",
		'https://cloudflareinsights.com',
		'https://static.cloudflareinsights.com',
		'https://challenges.cloudflare.com',
	];

	const cspDirectives = [
		"default-src 'self'",
		`script-src ${allowedHosts.join(' ')} 'unsafe-inline'`,
		"script-src-attr 'none'",
		`connect-src ${allowedHosts.join(' ')}`,
		"img-src 'self' data: https://cloudflareinsights.com https://static.cloudflareinsights.com",
		"style-src 'self' 'unsafe-inline'",
		"font-src 'self' data:",
		"frame-src 'self' https://challenges.cloudflare.com",
		"form-action 'self'",
		"object-src 'none'",
		"base-uri 'none'",
		"frame-ancestors 'none'",
		'upgrade-insecure-requests',
	].join('; ');

	const cspTrustedTypesReportOnly = [
		"require-trusted-types-for 'script'",
		'trusted-types default vctr vctr#unsafe-html',
	].join('; ');

	const securityHeaders = `
        Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
        X-Content-Type-Options: nosniff
        Referrer-Policy: strict-origin-when-cross-origin
        Permissions-Policy: geolocation=(), microphone=(), camera=()
        Cross-Origin-Opener-Policy: same-origin
        Cross-Origin-Resource-Policy: same-origin
        X-Frame-Options: DENY
        Content-Security-Policy: ${cspDirectives};
        Content-Security-Policy-Report-Only: ${cspTrustedTypesReportOnly};`;

	const headers = `/*${securityHeaders}

/
  Cache-Control: no-cache, must-revalidate

/*/
  Cache-Control: no-cache, must-revalidate

/*.html
  Cache-Control: no-cache, must-revalidate

/robots.txt
  Cache-Control: no-cache, must-revalidate

/sitemap.xml
  Cache-Control: no-cache, must-revalidate

/*.css
  Cache-Control: public, max-age=31536000, immutable
/*.js
  Cache-Control: public, max-age=31536000, immutable
/*.webp
  Cache-Control: public, max-age=31536000, immutable
/*.png
  Cache-Control: public, max-age=31536000, immutable
/*.jpg
  Cache-Control: public, max-age=31536000, immutable
/*.jpeg
  Cache-Control: public, max-age=31536000, immutable
/*.svg
  Cache-Control: public, max-age=31536000, immutable
/*.woff2
  Cache-Control: public, max-age=31536000, immutable
/*.woff
  Cache-Control: public, max-age=31536000, immutable
/*.ttf
  Cache-Control: public, max-age=31536000, immutable

/img/*
  Cache-Control: public, max-age=31536000, immutable
/fonts/*
  Cache-Control: public, max-age=31536000, immutable

/favicon.ico
  Cache-Control: public, max-age=86400
`;

	await fs.writeFile(
		path.join(distDir, '_headers'),
		headers.trim() + '\n',
		'utf-8'
	);
	console.log('✅ _headers file written');
}
