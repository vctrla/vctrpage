// *
// **
// ***
// ****
// ***** svgs

const newsletterArrowSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
`;

const spinnerSvg = `
<svg width="40" height="24" viewBox="0 0 40 24" xmlns="http://www.w3.org/2000/svg">
  <style>
    .spinner_S1WN {animation: spinner_MGfb .8s linear infinite; animation-delay: -.8s}
    .spinner_Km9P {animation-delay: -.65s}
    .spinner_JApP {animation-delay: -.5s}
    @keyframes spinner_MGfb {93.75%,100%{opacity:.2}}
  </style>
  <circle class="spinner_S1WN" fill="white" cx="6" cy="12" r="4"/>
  <circle class="spinner_S1WN spinner_Km9P" fill="white" cx="18" cy="12" r="4"/>
  <circle class="spinner_S1WN spinner_JApP" fill="white" cx="30" cy="12" r="4"/>
</svg>
`;

const newsletterCheckSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M20 6L9 17l-5-5"/>
  </svg>
`;

const newsletterErrorSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M18 6L6 18M6 6l12 12"/>
  </svg>
`;

// *
// **
// ***
// ****
// ***** global vars

const NEWSLETTER_ENDPOINT = __ENDPOINT__ + '/api/newsletter';
let newsletterSubmitting = false;
let newsletterState = 'idle';
let newsletterErrorTimeoutId = null;
let newsletterTurnstileToken = null;

// *
// **
// ***
// ****
// ***** helpers

function getNewsletterElements() {
	const form = document.querySelector('.newsletter-form');
	if (!form) return {};

	const input = form.querySelector('.newsletter-input');
	const button = form.querySelector('.newsletter-go');
	const message = form.querySelector('.newsletter-message');
	const website = form.querySelector('input[name="website"]');

	return { form, input, button, message, website };
}

function resetNewsletterTurnstile() {
	if (window.turnstile) {
		try {
			// implicit mode: selector is fine
			turnstile.reset('#newsletter-turnstile');
		} catch (err) {
			console.warn('Turnstile reset failed', err);
		}
	}
}

// *
// **
// ***
// ****
// ***** window callbacks

window.onNewsletterTurnstileSuccess = function (token) {
	newsletterTurnstileToken = token;
};

window.onNewsletterTurnstileExpired = function () {
	newsletterTurnstileToken = null;
	resetNewsletterTurnstile();
};

window.onNewsletterTurnstileTimeout = function () {
	newsletterTurnstileToken = null;
	resetNewsletterTurnstile();
	setNewsletterState('error');
};

window.onNewsletterTurnstileError = function (errorCode) {
	console.error('Turnstile error:', errorCode);
	newsletterTurnstileToken = null;
	resetNewsletterTurnstile();
	setNewsletterState('error');
};

// *
// **
// ***
// ****
// ***** newsletter submission

function setNewsletterState(state) {
	if (state !== 'error' && newsletterErrorTimeoutId) {
		clearTimeout(newsletterErrorTimeoutId);
		newsletterErrorTimeoutId = null;
	}

	newsletterState = state;

	const { input, button, message } = getNewsletterElements();
	if (!input || !button) return;

	if (message) {
		message.classList.remove('newsletter-success', 'newsletter-error');
		message.textContent = '';
	}

	switch (state) {
		case 'idle':
			newsletterSubmitting = false;
			input.disabled = false;
			button.disabled = false;
			button.innerHTML = newsletterArrowSvg;
			break;

		case 'loading':
			newsletterSubmitting = true;
			input.disabled = true;
			button.disabled = true;
			button.innerHTML = spinnerSvg;
			break;

		case 'success':
			newsletterSubmitting = false;
			input.disabled = true;
			button.disabled = true;
			button.innerHTML = newsletterCheckSvg;
			if (message) {
				message.textContent = 'Por favor, revisa tu bandeja de entrada';
				message.classList.add('newsletter-success');
			}
			const widget = document.getElementById('newsletter-turnstile');
			if (widget) widget.style.display = 'none';
			newsletterTurnstileToken = null;
			break;

		case 'error':
			newsletterSubmitting = false;
			input.disabled = false;
			button.disabled = true;
			button.innerHTML = newsletterErrorSvg;
			if (message) {
				message.textContent = 'Ha ocurrido un error';
				message.classList.add('newsletter-error');
			}

			// clear previous timeout just in case
			if (newsletterErrorTimeoutId) {
				clearTimeout(newsletterErrorTimeoutId);
				newsletterErrorTimeoutId = null;
			}

			newsletterErrorTimeoutId = setTimeout(() => {
				newsletterErrorTimeoutId = null;
				const { input: currentInput, website } = getNewsletterElements();
				if (currentInput) currentInput.value = '';
				if (website) website.value = '';
				setNewsletterState('idle');
			}, 2000);
			break;
	}
}

async function submitNewsletter(email, websiteValue) {
	const controller = new AbortController();
	const timeoutMs = 20000;

	const timeoutId = setTimeout(() => {
		controller.abort();
	}, timeoutMs);

	try {
		const res = await fetch(NEWSLETTER_ENDPOINT, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: JSON.stringify({
				email,
				website: websiteValue,
				turnstileToken: newsletterTurnstileToken || null,
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		let data = null;
		try {
			data = await res.json();
		} catch (_) {
			// ignore JSON parse errors -> treat as generic error
		}

		return {
			ok: res.ok,
			status: res.status,
			data,
		};
	} catch (err) {
		clearTimeout(timeoutId);

		if (err.name === 'AbortError') {
			return {
				ok: false,
				status: 408,
				data: { code: 'timeout', message: 'Request timed out' },
			};
		}

		console.error('❌ Newsletter submission failed', err);
		return {
			ok: false,
			status: 0,
			data: { code: 'network_error', message: 'Network error' },
		};
	}
}

async function handleNewsletterSubmit(e) {
	e.preventDefault();

	if (newsletterSubmitting || newsletterState !== 'idle') {
		return;
	}

	const { input, website, message } = getNewsletterElements();
	if (!input) return;

	const websiteValue = website ? website.value : '';

	if (!input.checkValidity()) {
		if (input.reportValidity) input.reportValidity();
		return;
	}

	if (!newsletterTurnstileToken) {
		if (message) {
			message.textContent = 'Por favor, completa la verificación.';
			message.classList.add('newsletter-error');
		}
		return;
	}

	setNewsletterState('loading');

	try {
		const res = await submitNewsletter(input.value, websiteValue);

		if (!res.ok) {
			// special handling for timeout / network errors
			if (res.status === 408 || res.data?.code === 'timeout') {
				setNewsletterState('error');
				return;
			}

			if (res.data?.code === 'invalid_turnstile') {
				resetNewsletterTurnstile();
				setNewsletterState('error');
				return;
			}

			// invalid email from backend
			if (res.status === 400 && res.data?.code === 'invalid_email') {
				setNewsletterState('error');
				const { message } = getNewsletterElements();
				if (message && res.data?.message) {
					message.textContent = res.data.message;
				}
				return;
			}

			setNewsletterState('error');
			return;
		}

		setNewsletterState('success');
	} catch (err) {
		console.error('❌ Newsletter submission failed', err);
		setNewsletterState('error');
	}
}

// *
// **
// ***
// ****
// ***** event listeners

document.addEventListener('click', async (e) => {
	if (e.target.matches('.load-more-link')) {
		e.preventDefault();

		const btn = e.target;
		const originalText = btn.textContent;
		btn.classList.add('loading');
		btn.innerHTML = spinnerSvg;

		try {
			const url = btn.href;
			const res = await fetch(url);

			const text = await res.text();
			const doc = new DOMParser().parseFromString(text, 'text/html');

			const newItems = doc.querySelectorAll('.landing-list .landing-item');
			const list = document.querySelector('.landing-list');
			newItems.forEach((item) => list.appendChild(item));

			const newBtn = doc.querySelector('.load-more');
			const oldBtn = document.querySelector('.load-more');

			if (newBtn) {
				oldBtn.replaceWith(newBtn);
			} else if (oldBtn) {
				oldBtn.remove();
			}
		} catch (err) {
			console.error('❌ Error loading more articles', err);
			btn.classList.remove('loading');
			btn.textContent = originalText;
		}
	}

	// site-logo scroll to top when already on "/"
	if (e.target.matches('.site-logo')) {
		if (window.location.pathname === '/') {
			e.preventDefault();
			// already on homepage -> scroll instead of reload
			window.scrollTo({ top: 0, behavior: 'smooth' });
		}
	}
});

document.addEventListener('DOMContentLoaded', () => {
	const { form } = getNewsletterElements();
	if (form) {
		form.addEventListener('submit', handleNewsletterSubmit);
	}
});
