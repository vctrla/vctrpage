const te = new TextEncoder();
const td = new TextDecoder();

function toBase64Url(bytes) {
	let str = btoa(String.fromCharCode(...bytes));
	return str.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function fromBase64Url(b64url) {
	const pad = '='.repeat((4 - (b64url.length % 4)) % 4);
	const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/') + pad;
	const bin = atob(b64);
	const arr = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
	return arr;
}

async function hmacSha256(keyBytes, msgBytes) {
	const key = await crypto.subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'HMAC', hash: 'SHA-256' },
		false,
		['sign']
	);
	return new Uint8Array(await crypto.subtle.sign('HMAC', key, msgBytes));
}

export function encodeEmail(email) {
	return toBase64Url(te.encode(email));
}
export function decodeEmail(eParam) {
	try {
		return td.decode(fromBase64Url(eParam));
	} catch {
		return null;
	}
}

// build canonical string we sign/verify
function payload(email, ts) {
	return `unsubscribe|${email}|${ts}`; // include purpose + timestamp
}

export async function signEmailWithTs(email, ts, secret) {
	const sigBytes = await hmacSha256(
		te.encode(secret),
		te.encode(payload(email, ts))
	);
	return toBase64Url(sigBytes);
}

export async function verifyWithSecrets(email, ts, sig, secrets) {
	const compare = async (secret) => {
		const expected = await signEmailWithTs(email, ts, secret);
		if (expected.length !== sig.length) return false;
		// constant-time-ish compare
		let ok = 0;
		for (let i = 0; i < expected.length; i++)
			ok |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
		return ok === 0;
	};
	for (const s of secrets) {
		if (s && (await compare(s))) return true;
	}
	return false;
}
