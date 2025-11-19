export function json(body, init = {}) {
	return new Response(JSON.stringify(body), {
		...init,
		headers: {
			'Content-Type': 'application/json; charset=utf-8',
			...(init.headers || {}),
		},
	});
}
