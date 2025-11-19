import { json } from '../_utils/utils.js';
import { generateConfirmationToken, hashToken } from '../_utils/tokens.js';
import { sendVerificationEmail, isValidEmail } from '../_utils/email.js';

const DEFAULT_RESEND_COOLDOWN_MINS = 10;

function getResendCooldownMins(env) {
	const raw = env.NEWSLETTER_RESEND_COOLDOWN_MINS;
	if (!raw) return DEFAULT_RESEND_COOLDOWN_MINS;
	const n = Number.parseInt(raw, 10);
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_RESEND_COOLDOWN_MINS;
}

// *
// **
// ***
// ****
// ***** endpoint
export async function onRequestPost(context) {
	const { request, env } = context;

	try {
		const body = await request.json().catch(() => null);

		// honeypot check
		if (body?.website && body.website.trim() !== '') {
			return json(
				{
					code: 'pending_confirmation',
					message: 'Si el correo existe, recibirás un email de confirmación.',
				},
				{ status: 200 }
			);
		}

		// turnstile verification
		const turnstileToken =
			body && typeof body.turnstileToken === 'string'
				? body.turnstileToken.trim()
				: '';

		if (!turnstileToken) {
			return json(
				{
					code: 'missing_turnstile',
					message: 'Verificación de seguridad requerida.',
				},
				{ status: 400 }
			);
		}

		if (!env.TURNSTILE_SECRET_KEY) {
			console.error('❌ TURNSTILE_SECRET_KEY missing');
			return json(
				{ code: 'server_error', message: 'Error interno del servidor' },
				{ status: 500 }
			);
		}

		const ip =
			request.headers.get('CF-Connecting-IP') ||
			request.headers.get('x-forwarded-for') ||
			null;

		const formData = new URLSearchParams();
		formData.append('secret', env.TURNSTILE_SECRET_KEY);
		formData.append('response', turnstileToken);
		if (ip) {
			formData.append('remoteip', ip);
		}

		const turnstileRes = await fetch(
			'https://challenges.cloudflare.com/turnstile/v0/siteverify',
			{
				method: 'POST',
				body: formData,
			}
		);

		if (!turnstileRes.ok) {
			console.error('❌ Turnstile verify failed', turnstileRes.status);
			return json(
				{
					code: 'invalid_turnstile',
					message:
						'No se ha podido verificar la petición. Por favor, inténtalo de nuevo.',
				},
				{ status: 400 }
			);
		}

		const turnstileData = await turnstileRes.json().catch(() => null);

		if (!turnstileData || !turnstileData.success) {
			return json(
				{
					code: 'invalid_turnstile',
					message:
						'No se ha podido verificar la petición. Por favor, inténtalo de nuevo.',
				},
				{ status: 400 }
			);
		}

		let email = null;
		if (body && typeof body.email === 'string') {
			email = body.email.trim().toLowerCase();
		}

		if (!email || !isValidEmail(email)) {
			return json(
				{ code: 'invalid_email', message: 'Email inválido' },
				{ status: 400 }
			);
		}

		const now = new Date();
		const nowIso = now.toISOString();
		const RESEND_COOLDOWN_MINS = getResendCooldownMins(env);

		let sendEmail = false;
		let emailToken = null; // raw token to put in the email

		try {
			const rawToken = generateConfirmationToken();
			const tokenHash = await hashToken(rawToken);

			await env.newsletter_db
				.prepare(
					`INSERT INTO subscribers (
                    email,
                    status,
                    confirmation_token,
                    confirmation_sent_at
                    )
                VALUES (?, ?, ?, ?)`
				)
				.bind(email, 'pending', tokenHash, nowIso)
				.run();

			// insert worked -> new subscriber
			sendEmail = true;
			emailToken = rawToken;
		} catch (err) {
			const existing = await env.newsletter_db
				.prepare(
					`SELECT id, status, confirmation_token, confirmation_sent_at
                FROM subscribers
                WHERE email = ?`
				)
				.bind(email)
				.first();

			if (!existing) {
				console.error('❌ Newsletter DB insert error', err);
				return json(
					{ code: 'server_error', message: 'Error interno del servidor' },
					{ status: 500 }
				);
			}

			if (existing.status === 'confirmed') {
				// already confirmed -> no email, no changes
				sendEmail = false;
			} else {
				// pending
				let expired = true;

				if (existing.confirmation_sent_at) {
					const sentAtMs = Date.parse(existing.confirmation_sent_at);
					if (!Number.isNaN(sentAtMs)) {
						const diffMs = now.getTime() - sentAtMs;
						const limitMs = RESEND_COOLDOWN_MINS * 60 * 1000;
						expired = diffMs > limitMs;
					}
				}

				if (!expired) {
					// still valid -> do NOT resend
					sendEmail = false;
				} else {
					// expired -> new token (raw + hash)
					const newRawToken = generateConfirmationToken();
					const newTokenHash = await hashToken(newRawToken);

					await env.newsletter_db
						.prepare(
							`UPDATE subscribers
                        SET confirmation_token = ?,
                            confirmation_sent_at = ?
                        WHERE id = ?`
						)
						.bind(newTokenHash, nowIso, existing.id)
						.run();

					sendEmail = true;
					emailToken = newRawToken;
				}
			}
		}

		// send email if needed
		if (sendEmail) {
			const ok = await sendVerificationEmail(email, emailToken, env);

			if (!ok) {
				return json(
					{
						code: 'email_send_failed',
						message:
							'No se ha podido enviar el email de confirmación. Inténtalo de nuevo más tarde.',
					},
					{ status: 500 }
				);
			}
		}

		return json(
			{
				code: 'pending_confirmation',
				message: 'Si el correo existe, recibirás un email de confirmación.',
			},
			{ status: 200 }
		);
	} catch (err) {
		console.error('❌ Newsletter API error', err);
		return json(
			{ code: 'server_error', message: 'Error interno del servidor' },
			{ status: 500 }
		);
	}
}
