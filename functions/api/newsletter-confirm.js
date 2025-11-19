import { hashToken } from '../_utils/tokens.js';
import { confirmHtml } from '../_utils/templates.js';

export async function onRequestGet(context) {
	const { request, env } = context;
	const url = new URL(request.url);
	const token = url.searchParams.get('token');

	if (!token) {
		return confirmHtml('Token inválido o ausente.', 400);
	}

	try {
		const tokenHash = await hashToken(token);

		const subscriber = await env.newsletter_db
			.prepare(
				`SELECT id, status, confirmation_sent_at
            FROM subscribers
            WHERE confirmation_token = ?`
			)
			.bind(tokenHash)
			.first();

		if (!subscriber) {
			return confirmHtml('Enlace de confirmación inválido o expirado.', 400);
		}

		if (subscriber.status !== 'pending') {
			return confirmHtml('Este enlace de confirmación ya no es válido.', 400);
		}

		const ttl = parseInt(env.NEWSLETTER_TOKEN_TTL_HOURS ?? '24', 10);
		const ttlHours = Number.isFinite(ttl) && ttl > 0 ? ttl : 24;
		const sentAtMs = Date.parse(subscriber.confirmation_sent_at);
		if (!Number.isFinite(sentAtMs)) {
			return confirmHtml('Enlace de confirmación inválido o expirado.', 400);
		}

		const ageHours = (Date.now() - sentAtMs) / (1000 * 60 * 60);
		if (ageHours > ttlHours) {
			return confirmHtml(
				'Este enlace ha expirado. Solicita una nueva suscripción.',
				400
			);
		}

		// mark confirmed
		await env.newsletter_db
			.prepare(
				`UPDATE subscribers
            SET status='confirmed',
                confirmation_token=NULL
            WHERE id=?`
			)
			.bind(subscriber.id)
			.run();

		console.log(
			`✅ Subscriber ${subscriber.id} confirmed newsletter subscription.`
		);

		return confirmHtml('Gracias por unirte a la newsletter.');
	} catch (err) {
		console.error('❌ Newsletter confirm error', err);
		return confirmHtml('Error interno del servidor.', 500);
	}
}
