import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadArticles } from './ssg/fetch.js';
import { encodeEmail, signEmailWithTs } from './functions/_utils/unsub.js';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';
import { TwitterApi } from 'twitter-api-v2';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ARTICLES_ROOT = path.resolve(__dirname, '..', 'articles');
const HASHES = JSON.parse(
	fs.readFileSync(path.resolve(__dirname, './hashes.json'), 'utf8')
);

const BASE_URL = 'https://vctr.page/articulos';
const DELIVER_CF_ACCOUNT_ID = process.env.DELIVER_CF_ACCOUNT_ID;
const DELIVER_CF_API_TOKEN = process.env.DELIVER_CF_API_TOKEN;
const DELIVER_CF_D1_DATABASE_ID = process.env.DELIVER_CF_D1_DATABASE_ID;
const AWS_REGION = process.env.AWS_REGION;
const SES_FROM = process.env.SES_FROM;
const SES_REPLY = process.env.SES_REPLY_TO
	? [process.env.SES_REPLY_TO]
	: undefined;
const UNSUB_SECRET = process.env.NEWSLETTER_UNSUBSCRIBE_SECRET;
const X_API_KEY = process.env.X_API_KEY;
const X_API_SECRET = process.env.X_API_SECRET;
const X_ACCESS_TOKEN = process.env.X_ACCESS_TOKEN;
const X_ACCESS_SECRET = process.env.X_ACCESS_SECRET;

const twitterClient = new TwitterApi({
	appKey: X_API_KEY,
	appSecret: X_API_SECRET,
	accessToken: X_ACCESS_TOKEN,
	accessSecret: X_ACCESS_SECRET,
}).readWrite;

const sesClient = new SESv2Client({ region: AWS_REGION });

// *
// **
// ***
// ****
// ***** helpers

function findLatestYearMonthDir(rootDir) {
	const years = fs
		.readdirSync(rootDir, { withFileTypes: true })
		.filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
		.map((d) => d.name)
		.sort();

	if (years.length === 0) {
		throw new Error(`No year directories found in ${rootDir}`);
	}

	const latestYear = years[years.length - 1];
	const yearPath = path.join(rootDir, latestYear);

	const months = fs
		.readdirSync(yearPath, { withFileTypes: true })
		.filter((d) => d.isDirectory() && /^\d{2}$/.test(d.name))
		.map((d) => d.name)
		.sort();

	if (months.length === 0) {
		throw new Error(`No month directories found in ${yearPath}`);
	}

	const latestMonth = months[months.length - 1];
	const latestMonthPath = path.join(yearPath, latestMonth);

	return {
		year: latestYear,
		month: latestMonth,
		path: latestMonthPath,
	};
}

function buildArticleUrl(article) {
	const slug = article.slug;
	const link = article.link;

	if (link) return link;

	const base = BASE_URL.replace(/\/+$/, '');
	const slugPart = String(slug).replace(/^\/+/, '');
	return `${base}/${slugPart}`;
}

function extractFirstParagraph(html) {
	if (!html) return '';

	const match = html.match(/<p[^>]*>[\s\S]*?<\/p>/i);
	if (!match) return '';

	let paragraph = match[0];

	paragraph = paragraph.replace(
		/<p([^>]*)>/i,
		'<p$1 style="margin: 16px 0 0 0;">'
	);

	paragraph = paragraph.replace(
		/(<p[^>]*>)([\s\S]*?)(<\/p>)/i,
		(full, open, content, close) => {
			let trimmed = content.trim();

			if (trimmed.endsWith('...')) {
				return `${open}${trimmed}${close}`;
			}

			if (trimmed.endsWith('.')) {
				trimmed = trimmed.slice(0, -1) + '...';
				return `${open}${trimmed}${close}`;
			}

			return `${open}${trimmed}...${close}`;
		}
	);

	return paragraph;
}

// confirm prompt in console
async function confirm(question) {
	const rl = readline.createInterface({ input, output });
	try {
		const answer = await rl.question(`${question} [y/N] `);
		const normalized = answer.trim().toLowerCase();
		return normalized === 'y' || normalized === 'yes';
	} finally {
		rl.close();
	}
}

// *
// **
// ***
// ****
// ***** cloudflare

async function getConfirmedEmails() {
	const url = `https://api.cloudflare.com/client/v4/accounts/${DELIVER_CF_ACCOUNT_ID}/d1/database/${DELIVER_CF_D1_DATABASE_ID}/query`;

	const res = await fetch(url, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${DELIVER_CF_API_TOKEN}`,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify({
			sql: 'SELECT email FROM subscribers WHERE status = ?',
			params: ['confirmed'],
		}),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(
			`D1 query failed: ${res.status} ${res.statusText} – ${text}`
		);
	}

	const json = await res.json();

	const rows = Array.isArray(json.result)
		? json.result.flatMap((chunk) => chunk.results || [])
		: json.result?.results || [];

	const emails = rows.map((row) => row.email).filter(Boolean);

	return emails;
}

// *
// **
// ***
// ****
// ***** aws

async function sendNewsletterEmail({
	to,
	subject,
	html,
	text,
	listTag = 'newsletter',
	typeTag = 'issue',
}) {
	const command = new SendEmailCommand({
		FromEmailAddress: SES_FROM,
		Destination: { ToAddresses: [to] },
		ReplyToAddresses: SES_REPLY,
		ConfigurationSetName: process.env.SES_CONFIGURATION_SET || undefined,
		EmailTags: [
			{ Name: 'list', Value: listTag },
			{ Name: 'type', Value: typeTag },
		],
		Content: {
			Simple: {
				Subject: { Data: subject, Charset: 'UTF-8' },
				Body: {
					Html: { Data: html, Charset: 'UTF-8' },
					Text: { Data: text, Charset: 'UTF-8' },
				},
			},
		},
	});

	return sesClient.send(command);
}

// *
// **
// ***
// ****
// ***** email

async function buildUnsubscribeUrl(to) {
	const ts = Date.now().toString(); // ms since epoch
	const canonicalEmail = to.trim().toLowerCase();

	const eParam = encodeEmail(canonicalEmail);

	// no secret -> still build but warn earlier
	const sParam = UNSUB_SECRET
		? await signEmailWithTs(canonicalEmail, ts, UNSUB_SECRET)
		: 'no-signature';

	return `https://vctr.page/api/newsletter-unsubscribe?e=${encodeURIComponent(
		eParam
	)}&ts=${encodeURIComponent(ts)}&s=${encodeURIComponent(sParam)}`;
}

async function buildEmailHtml({
	to,
	title,
	firstParagraphHtml,
	url,
	imgUrl,
	externalLink = false,
}) {
	const unsubUrl = await buildUnsubscribeUrl(to);
	const safeFirstParagraph = firstParagraphHtml || '';
	const cta = externalLink ? 'Link' : 'Leer artículo completo';

	return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5; color:#111;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:500px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e5e5;">
            <tr>
              <td style="padding:24px;">
                <h1 style="margin: 0;font-size:22px;line-height:1.3;color:#111827;">
                  ${escapeHtml(title)}
                </h1>
                ${safeFirstParagraph}
              </td>
            </tr>
            <tr>
              <td style="padding:0 24px 24px 24px;">
                <p style="margin:0;">
                  <a href="${url}" style="font-size:16px;background:#111;color:#fff;padding:8px 12px;border-radius:6px;text-decoration:none;display:inline-block;">
                    ${cta}
                  </a>
                </p>
                <p style="margin: 24px 0 0 0">
									<img
										src="${imgUrl}"
										alt="${escapeHtml(title)}"
										style="
											display: block;
											width: 100%;
											height: 200px;
											object-fit: cover;
											object-position: center;
											border-radius: 6px;
										"
									/>
				</p>
                <p style="margin:24px 0 0 0;font-size:13px;color:#4b5563;">
                  <a href="${url}" style="color:#111827;">${url}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding: 10px 0 34px 0; text-align: center">
                <a
                  href="https://vctr.page"
                  aria-label="Víctor"
                  style="font-family:Georgia, 'Times New Roman', Times, serif;font-variant:small-caps;font-weight:400;font-size:32px;color:#111827;text-decoration:none;"
                >
                  Víctor
                </a>
              </td>
            </tr>
          </table>
          <table
						role="presentation"
						width="100%"
						cellspacing="0"
						cellpadding="0"
						style="background: #f5f5f5; padding-top: 12px"
					>
						<tr>
							<td align="center" style="padding: 0 24px 24px 24px">
								<p
									style="
										margin: 0;
										font-size: 11px;
										color: #858c9a;
										text-align: center;
									"
								>
									Recibes este email porque te suscribiste a vctr.page.
								</p>
								<p
									style="
										margin: 0;
										font-size: 11px;
										color: #858c9a;
										text-align: center;
									"
								>
									Puedes darte de baja
									<a href="${unsubUrl}" style="color: #858c9a">aquí</a>.
								</p>
							</td>
						</tr>
					</table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

async function buildEmailText({ title, url, to, externalLink = false }) {
	const unsubUrl = await buildUnsubscribeUrl(to);
	const lead = externalLink ? 'Enlace:' : 'Lee el artículo completo:';

	return `${title}

${lead}
${url}

Si no quieres recibir más emails, puedes darte de baja aquí:
${unsubUrl}
`;
}

function escapeHtml(str = '') {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#39;');
}

// *
// **
// ***
// ****
// ***** twitter

async function tweetArticle({ title, url }) {
	let text = `${title} ${url}`;

	// 280-char safety: if too long -> truncate title but keep url
	const MAX_TWEET_LENGTH = 280;
	if (text.length > MAX_TWEET_LENGTH) {
		const reservedForUrlAndSpace = url.length + 1; // " " + url
		const maxTitleLength = MAX_TWEET_LENGTH - reservedForUrlAndSpace;

		let safeTitle = title;
		if (safeTitle.length > maxTitleLength) {
			// leave space for the ellipsis
			safeTitle = safeTitle.slice(0, maxTitleLength - 1).trim() + '…';
		}

		text = `${safeTitle} ${url}`;
	}

	const resp = await twitterClient.v2.tweet(text);
	console.log('✅ Tweet posted. ID:', resp.data?.id);
}

// *
// **
// ***
// ****
// ***** newsletter sending (concurrency + retry)

const MAX_CONCURRENCY = 6;
const MAX_RETRIES = 3;

function sleep(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendOneWithRetry(
	to,
	{ latestArticle, url, subject, firstParagraphHtml, imgUrl, externalLink }
) {
	let attempt = 0;

	while (true) {
		try {
			const html = await buildEmailHtml({
				to,
				title: latestArticle.title,
				firstParagraphHtml,
				url,
				imgUrl,
				externalLink,
			});

			const text = await buildEmailText({
				to,
				title: latestArticle.title,
				url,
				externalLink,
			});

			await sendNewsletterEmail({
				to,
				subject,
				html,
				text,
				listTag: 'newsletter',
				typeTag: 'issue',
			});

			return true;
		} catch (err) {
			const message = err?.message || String(err);
			const isThrottle =
				err?.name === 'ThrottlingException' || message.includes('Throttling');

			attempt++;

			if (!isThrottle || attempt > MAX_RETRIES) {
				console.error(`❌ Error sending to ${to}:`, message);
				return false;
			}

			const backoffMs = 500 * attempt; // 0.5s, 1s, 1.5s...
			console.warn(
				`⏳ Throttled for ${to}, backing off ${backoffMs}ms (attempt ${attempt})`
			);
			await sleep(backoffMs);
		}
	}
}

async function sendNewsletterBatch(emails, ctx) {
	const queue = [...emails];
	let sent = 0;
	let failed = 0;
	const failedEmails = [];

	async function worker() {
		while (true) {
			const to = queue.shift();
			if (!to) break;

			const ok = await sendOneWithRetry(to, ctx);
			if (ok) sent++;
			else {
				failed++;
				failedEmails.push(to);
			}
		}
	}

	const workers = Array.from({ length: MAX_CONCURRENCY }, () => worker());
	await Promise.all(workers);

	return { sent, failed, failedEmails };
}

// *
// **
// ***
// ****
// ***** trigger

(async () => {
	try {
		const latest = findLatestYearMonthDir(ARTICLES_ROOT);
		const articles = loadArticles(latest.path);
		if (!articles || articles.length === 0) {
			throw new Error(`No articles found in ${latest.path}`);
		}

		const latestArticle = articles[0];
		const url = buildArticleUrl(latestArticle);

		const firstParagraphHtml = extractFirstParagraph(latestArticle.content);
		const subject = latestArticle.title;

		let imgUrl = '';
		if (latestArticle.img) {
			const clean = latestArticle.img.replace(/^\/+/, '');

			const hash = HASHES[clean];
			if (hash) {
				const ext = path.extname(clean);
				const base = path.basename(clean, ext);
				const dir = path.posix.dirname(clean);

				const hashedPath = `${dir}/${base}.${hash}.webp`;

				imgUrl = `https://vctr.page/cdn-cgi/image/width=500,quality=auto,format=auto/${hashedPath}`;
			}
		}

		console.log('\nLatest article detected:');
		console.log(` > Title: ${latestArticle.title}`);
		console.log(` > URL:   ${url}`);
		console.log(` > Img:   ${imgUrl}\n`);

		const tweetOk = await confirm('Post article on X (Twitter)?');
		if (!tweetOk) {
			console.log('🛑 Skipping tweet.');
		} else {
			try {
				await tweetArticle({ title: latestArticle.title, url });
			} catch (err) {
				console.error('❌ Error sending tweet:', err);
			}
		}

		const emails = await getConfirmedEmails();
		console.log(`\nFound ${emails.length} confirmed subscribers.`);
		if (emails.length === 0) {
			console.log('Nothing to send.');
			return;
		}

		const ok = await confirm('Send this newsletter to confirmed subscribers?');
		if (!ok) {
			console.log('🛑 Aborted. No emails sent.');
			return;
		}

		// send emails with limited concurrency (individual content per recipient)
		const { sent, failed, failedEmails } = await sendNewsletterBatch(emails, {
			latestArticle,
			url,
			subject,
			firstParagraphHtml,
			imgUrl,
			externalLink: Boolean(latestArticle.link),
		});

		console.log(
			`✅ Successfully sent to ${sent}/${emails.length} addresses. ${
				failed > 0 ? `(${failed} failed)` : ''
			}`
		);

		try {
			const home = process.env.HOME || process.env.USERPROFILE;
			const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

			const reportsDir = path.join(home, 'Desktop', 'vctr_reports');

			if (!fs.existsSync(reportsDir)) {
				fs.mkdirSync(reportsDir, { recursive: true });
			}

			// ---- FAILED REPORT ----
			if (failedEmails.length > 0) {
				const failedPath = path.join(
					reportsDir,
					`newsletter_failed_${timestamp}.txt`
				);

				fs.writeFileSync(failedPath, failedEmails.join('\n'), 'utf8');
				console.log(`📄 Failed emails written to: ${failedPath}`);
			}

			// ---- SUCCESS REPORT ----
			const successfulEmails = emails.filter((e) => !failedEmails.includes(e));

			if (successfulEmails.length > 0) {
				const successPath = path.join(
					reportsDir,
					`newsletter_success_${timestamp}.txt`
				);

				fs.writeFileSync(successPath, successfulEmails.join('\n'), 'utf8');
			}
		} catch (err) {
			console.error('⚠️ Error writing newsletter report files:', err);
		}
	} catch (err) {
		console.error('❌ Fatal error in newsletter script:', err);
	}
})();
