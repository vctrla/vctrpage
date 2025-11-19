export default {
	// minimal http handler so wrangler dev is happy
	async fetch(request, env, ctx) {
		// just so hitting / in dev doesn't crash
		return new Response('vctr-cleanup worker', {
			status: 200,
			headers: { 'content-type': 'text/plain' },
		});
	},

	// pending subscribers older than NEWSLETTER_TOKEN_TTL_HOURS get deleted
	async scheduled(event, env, ctx) {
		const rawTtl = parseInt(env.NEWSLETTER_TOKEN_TTL_HOURS ?? '24', 10);
		const ttlHours = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 24;

		// cutoff = now - TTL
		const cutoffMs = Date.now() - ttlHours * 60 * 60 * 1000;
		const cutoffIso = new Date(cutoffMs).toISOString();

		try {
			const stmt = env.newsletter_db.prepare(
				`DELETE FROM subscribers
                WHERE status = 'pending'
                AND confirmation_sent_at IS NOT NULL
                AND confirmation_sent_at < ?`
			);

			const result = await stmt.bind(cutoffIso).run();

			const meta = result?.meta || {};
			const deleted =
				meta.changes ?? meta.rows_affected ?? meta.rowsAffected ?? 'unknown';

			console.log('🧹 Newsletter cleanup done', {
				cutoffIso,
				ttlHours,
				deleted,
			});
		} catch (err) {
			console.error('❌ Newsletter cleanup failed', err);
		}
	},
};
