import { decodeEmail, verifyWithSecrets } from '../_utils/unsub.js';
import { unsubHtml } from '../_utils/templates.js';

const DEFAULT_UNSUB_TTL_HOURS = 24 * 7; // 7 days

function getTtlHours(env) {
	const raw = env.NEWSLETTER_UNSUB_TTL_HOURS;
	const n = raw ? parseInt(raw, 10) : DEFAULT_UNSUB_TTL_HOURS;
	return Number.isFinite(n) && n > 0 ? n : DEFAULT_UNSUB_TTL_HOURS;
}

export async function onRequestGet(context) {
	const { request, env } = context;
	const { searchParams } = new URL(request.url);
	const e = searchParams.get('e');
	const ts = searchParams.get('ts');
	const s = searchParams.get('s');

	if (!e || !ts || !s) return unsubHtml('Solicitud inválida.', 400);

	const email = decodeEmail(e)?.trim().toLowerCase();
	if (!email) return unsubHtml('Solicitud inválida.', 400);

	// TTL check
	const ttlHours = getTtlHours(env);
	const ageMs = Date.now() - Number(ts);
	if (!Number.isFinite(ageMs) || ageMs < 0 || ageMs > ttlHours * 3600 * 1000) {
		return unsubHtml('El enlace para darse de baja ha expirado.', 400);
	}

	// signature check with active/previous secrets (for rotation)
	const hasActiveSecrets =
		!!env.NEWSLETTER_UNSUBSCRIBE_SECRET ||
		!!env.NEWSLETTER_UNSUBSCRIBE_SECRET_PREV;

	if (!hasActiveSecrets) {
		console.error('❌ Missing unsubscribe secrets');
		return unsubHtml('Error interno del servidor.', 500);
	}

	const secrets = [
		env.NEWSLETTER_UNSUBSCRIBE_SECRET,
		env.NEWSLETTER_UNSUBSCRIBE_SECRET_PREV,
	];
	const ok = await verifyWithSecrets(email, ts, s, secrets);
	if (!ok) return unsubHtml('Firma inválida.', 400);

	try {
		await env.newsletter_db
			.prepare(`DELETE FROM subscribers WHERE email = ?`)
			.bind(email)
			.run();

		return unsubHtml(
			`Si estabas suscrito, has sido dado de baja correctamente.`
		);
	} catch (err) {
		console.error('❌ Unsubscribe error', err);
		return unsubHtml('Error interno del servidor.', 500);
	}
}
