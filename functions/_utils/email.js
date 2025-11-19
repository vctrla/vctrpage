import { AwsClient } from 'aws4fetch';
import { verificationEmailHtml } from '../_utils/templates.js';

export function isValidEmail(email) {
	if (typeof email !== 'string') return false;
	email = email.trim();
	if (email.length > 320) return false;
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * AWS SES v2 HTTPS API using SigV4 signing
 */
export async function sendVerificationEmail(to, token, env) {
	try {
		if (
			!env ||
			!env.AWS_REGION ||
			!env.AWS_ACCESS_KEY_ID ||
			!env.AWS_SECRET_ACCESS_KEY ||
			!env.SES_FROM ||
			!env.APP_BASE_URL
		) {
			console.error('❌ Missing required SES env vars');
			return false;
		}

		const region = env.AWS_REGION;
		const client = new AwsClient({
			accessKeyId: env.AWS_ACCESS_KEY_ID,
			secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
			region,
			service: 'ses',
		});

		const confirmUrl = `${env.APP_BASE_URL.replace(
			/\/+$/,
			''
		)}/api/newsletter-confirm?token=${encodeURIComponent(token)}`;

		const subject = 'Confirma tu suscripción';
		const html = verificationEmailHtml({ confirmUrl });

		const text = `Confirma tu suscripción

            Abre este enlace para confirmar:
            ${confirmUrl}
            `;

		// SES v2 SendEmail endpoint
		const url = `https://email.${region}.amazonaws.com/v2/email/outbound-emails`;

		const payload = {
			FromEmailAddress: env.SES_FROM,
			Destination: { ToAddresses: [to] },
			ReplyToAddresses: env.SES_REPLY_TO ? [env.SES_REPLY_TO] : undefined,
			ConfigurationSetName: env.SES_CONFIGURATION_SET || undefined,
			EmailTags: [
				{ Name: 'list', Value: 'newsletter' },
				{ Name: 'type', Value: 'confirmation' },
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
		};

		const res = await client.fetch(url, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(payload),
		});

		if (!res.ok) {
			const body = await res.text();
			console.error('❌ SES SendEmail failed', res.status, body, { to });
			return false;
		}

		return true;
	} catch (err) {
		console.error('❌ Failed to send verification email', err);
		return false;
	}
}
