export function generateConfirmationToken() {
	// prefer crypto.randomUUID when available
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.randomUUID === 'function'
	) {
		return crypto.randomUUID().replace(/-/g, '');
	}

	// fallback: secure random bytes -> hex
	if (
		typeof crypto !== 'undefined' &&
		typeof crypto.getRandomValues === 'function'
	) {
		console.warn(
			'⚠️ crypto.randomUUID not available, using fallback for token generation'
		);
		const length = 32; // 32 bytes = 256 bits
		const bytes = new Uint8Array(length);
		crypto.getRandomValues(bytes);
		return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
	}

	// if we reach here -> we don't have secure RNG -> fail hard
	throw new Error('Secure random generator not available');
}

export async function hashToken(token) {
	const encoder = new TextEncoder();
	const data = encoder.encode(token);

	if (!crypto?.subtle?.digest) {
		throw new Error('crypto.subtle.digest is not available');
	}

	const digest = await crypto.subtle.digest('SHA-256', data);
	const bytes = new Uint8Array(digest);
	return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}
