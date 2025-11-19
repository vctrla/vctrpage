// *
// **
// ***
// ****
// ***** svgs

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

const newsletterArrowSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
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
const TURNSTILE_SITE_KEY = __TURNSTILE_KEY__;
let newsletterPopover = null;
let newsletterOpen = false;
let newsletterSubmitting = false;
let newsletterState = 'idle';
let newsletterErrorTimeoutId = null;
let newsletterTurnstileToken = null;
let newsletterTurnstileWidgetId = null;

// *
// **
// ***
// ****
// ***** scrolling behavior

const preventScroll = (e) => {
	e.preventDefault();
};

function lockScrollAndNeutralizeCursors() {
	document.documentElement.classList.add('popover-open');
	document.body.classList.add('popover-open');

	window.addEventListener('wheel', preventScroll, { passive: false });
	window.addEventListener('touchmove', preventScroll, { passive: false });
}

function unlockScrollAndCursors() {
	document.documentElement.classList.remove('popover-open');
	document.body.classList.remove('popover-open');

	window.removeEventListener('wheel', preventScroll, { passive: false });
	window.removeEventListener('touchmove', preventScroll, { passive: false });
}

// *
// **
// ***
// ****
// ***** turnstile widget

function initNewsletterTurnstileWidget(pop, attempt = 0) {
	// avoid infinite retry
	if (attempt > 20) return;

	// turnstile script not ready yet -> retry shortly
	if (!window.turnstile || typeof window.turnstile.render !== 'function') {
		setTimeout(() => initNewsletterTurnstileWidget(pop, attempt + 1), 100);
		return;
	}

	const container = pop.querySelector('.newsletter-turnstile');
	if (!container) return;

	// avoid rendering twice
	if (newsletterTurnstileWidgetId !== null) return;

	newsletterTurnstileWidgetId = turnstile.render(container, {
		sitekey: TURNSTILE_SITE_KEY,
		theme: 'light',
		size: 'compact',
		appearance: 'interaction-only',
		language: 'es',

		callback: function (token) {
			// on success -> store token to send with the form
			newsletterTurnstileToken = token;
		},

		'expired-callback': function () {
			// token no longer valid
			newsletterTurnstileToken = null;
		},

		'timeout-callback': function () {
			// interactive challenge timed out
			newsletterTurnstileToken = null;
			setNewsletterState('error');
		},

		'error-callback': function (errorCode) {
			console.error('Turnstile error:', errorCode);
			newsletterTurnstileToken = null;
			setNewsletterState('error');
		},
	});
}

// *
// **
// ***
// ****
// ***** newsletter dom

function createNewsletterPopover() {
	const pop = document.createElement('div');
	pop.className = 'newsletter-popover';
	pop.setAttribute('role', 'dialog');
	pop.setAttribute('aria-modal', 'false');
	pop.innerHTML = `
        <form class="newsletter-form" action="#" method="post">
            <div class="newsletter-field">
                <input type="email" placeholder="tu@email.com" class="newsletter-input" required />
                <input type="text" name="website" autocomplete="off" tabindex="-1" aria-hidden="true" style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;" />
                <div class="newsletter-turnstile" id="newsletter-turnstile"></div>
                <p class="newsletter-message" aria-live="polite"></p>
            </div>
            <button class="newsletter-go" type="submit" aria-label="Subscribe">
                ${newsletterArrowSvg}
            </button>
        </form>
`;

	// prevent clicks inside from closing popover
	pop.addEventListener('click', (e) => {
		e.stopPropagation();
	});

	const form = pop.querySelector('.newsletter-form');
	if (form) {
		form.addEventListener('submit', handleNewsletterSubmit);
	}

	// handle button click when in success state
	const submitButton = pop.querySelector('.newsletter-go');
	if (submitButton) {
		submitButton.addEventListener('click', (e) => {
			if (newsletterState === 'success') {
				e.preventDefault();
				const triggerBtn = document.querySelector('.newsletter-btn');
				closeNewsletterPopover(triggerBtn);
			}
		});
	}

	pop.style.top = '-9999px';
	pop.style.left = '-9999px';
	pop.style.visibility = 'hidden';
	document.body.appendChild(pop);

	initNewsletterTurnstileWidget(pop);

	newsletterPopover = pop;
	setNewsletterState('idle');

	return pop;
}

function positionPopoverToButton(btn, pop) {
	// edge-to-edge: no vertical gap
	const gap = 0;
	const rect = btn.getBoundingClientRect();

	pop.style.visibility = 'hidden';
	pop.style.display = 'block';

	const popWidth = pop.offsetWidth;

	const left = window.scrollX + rect.right - popWidth; // right edges align
	const top = window.scrollY + rect.bottom + gap; // bottom of button == top of popover

	pop.style.left = `${left}px`;
	pop.style.top = `${top}px`;
	pop.style.visibility = 'visible';
}

function openNewsletterPopover(btn) {
	if (!newsletterPopover) newsletterPopover = createNewsletterPopover();
	positionPopoverToButton(btn, newsletterPopover);
	newsletterOpen = true;
	btn.setAttribute('aria-expanded', 'true');
	btn.classList.add('is-open');
	lockScrollAndNeutralizeCursors(); // <— no scroll + default cursors

	const input = newsletterPopover.querySelector('.newsletter-input');
	if (input) input.focus();
}

function closeNewsletterPopover(btn) {
	if (!newsletterPopover || !newsletterOpen) return;

	if (newsletterErrorTimeoutId) {
		clearTimeout(newsletterErrorTimeoutId);
		newsletterErrorTimeoutId = null;
	}

	// hide and reset positioning
	newsletterPopover.style.visibility = 'hidden';
	newsletterPopover.style.top = '-9999px';
	newsletterPopover.style.left = '-9999px';
	newsletterOpen = false;

	// reset form content
	const form = newsletterPopover.querySelector('.newsletter-form');
	if (form) form.reset();

	// reset icons / messages / disabled state
	setNewsletterState('idle');

	// reset turnstile
	newsletterTurnstileToken = null;
	if (window.turnstile && newsletterTurnstileWidgetId !== null) {
		try {
			turnstile.reset(newsletterTurnstileWidgetId);
		} catch (err) {
			console.warn('Could not reset Turnstile widget', err);
		}
	}

	// remove focus and restore accessibility / styling
	if (btn) {
		btn.setAttribute('aria-expanded', 'false');
		btn.classList.remove('is-open');
		// btn.focus();
	}

	// Restore scroll and cursor state
	unlockScrollAndCursors();
}

// *
// **
// ***
// ****
// ***** newsletter submission

function getNewsletterElements() {
	if (!newsletterPopover) return {};
	const input = newsletterPopover.querySelector('.newsletter-input');
	const button = newsletterPopover.querySelector('.newsletter-go');
	const message = newsletterPopover.querySelector('.newsletter-message');

	return { input, button, message };
}

function setNewsletterState(state) {
	if (state !== 'error' && newsletterErrorTimeoutId) {
		clearTimeout(newsletterErrorTimeoutId);
		newsletterErrorTimeoutId = null;
	}

	newsletterState = state;

	if (newsletterPopover) {
		newsletterPopover.setAttribute('data-state', state);
	}

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
			button.disabled = false;
			button.innerHTML = newsletterCheckSvg;
			if (message) {
				message.textContent = 'Por favor, revisa tu bandeja de entrada';
				message.classList.add('newsletter-success');
			}
			break;

		case 'error':
			newsletterSubmitting = false;
			input.disabled = false;
			button.disabled = false;
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
				if (!newsletterOpen) return;
				const { input: currentInput } = getNewsletterElements();
				if (currentInput) currentInput.value = '';
				setNewsletterState('idle');
			}, 3000);
			break;
	}
}

async function submitNewsletter(email) {
	const controller = new AbortController();
	const timeoutMs = 10000;

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

	if (newsletterSubmitting || newsletterState !== 'idle') return;

	const { input } = getNewsletterElements();
	if (!input) return;

	if (!input.checkValidity()) {
		if (input.reportValidity) input.reportValidity();
		return;
	}

	if (!newsletterTurnstileToken) {
		const { message } = getNewsletterElements();
		if (message) {
			message.textContent = 'Por favor, completa la verificación.';
			message.classList.add('newsletter-error');
		}
		return;
	}

	setNewsletterState('loading');

	try {
		const res = await submitNewsletter(input.value);

		if (!res.ok) {
			// special handling for timeout / network errors
			if (res.status === 408 || res.data?.code === 'timeout') {
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

document.addEventListener(
	'click',
	(e) => {
		if (!newsletterOpen) return;

		const inPopover = newsletterPopover && newsletterPopover.contains(e.target);
		const onButton = e.target.closest('.newsletter-btn');

		// if click outside both popover and button -> close it, don't navigate
		if (!inPopover && !onButton) {
			e.preventDefault();
			e.stopPropagation();
			if (newsletterState === 'loading') {
				// loading -> block navigation, keep popover open
				return;
			}
			const btn = document.querySelector('.newsletter-btn');
			closeNewsletterPopover(btn);
		}
	},
	true
); // capture phase to intercept before links handle the click

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

	if (e.target.closest('.newsletter-btn')) {
		const btn = e.target.closest('.newsletter-btn');

		// if we are loading, do nothing (keep popover locked open)
		if (newsletterOpen && newsletterState === 'loading') {
			e.preventDefault();
			return;
		}

		btn.setAttribute('aria-haspopup', 'dialog');
		btn.setAttribute('aria-expanded', newsletterOpen ? 'false' : 'true');

		if (newsletterOpen) {
			closeNewsletterPopover(btn);
		} else {
			// prevent the outside-click handler from immediately closing it
			e.stopPropagation();
			openNewsletterPopover(btn);
		}
		return;
	}

	// outside click closes the popover (kept for completeness; actual prevention handled in capture)
	if (newsletterOpen) {
		const isInside = newsletterPopover && newsletterPopover.contains(e.target);
		if (!isInside) {
			const btn = document.querySelector('.newsletter-btn');
			closeNewsletterPopover(btn);
		}
	}
});

// close on Escape
document.addEventListener('keydown', (e) => {
	if (e.key === 'Escape' && newsletterOpen) {
		if (newsletterState === 'loading') {
			// ignore escape while loading
			e.preventDefault();
			return;
		}
		const btn = document.querySelector('.newsletter-btn');
		closeNewsletterPopover(btn);
	}
});

// reposition on resize/scroll (keeps it glued to the button)
['resize', 'scroll'].forEach((evt) => {
	window.addEventListener(
		evt,
		() => {
			if (!newsletterOpen || !newsletterPopover) return;
			const btn = document.querySelector('.newsletter-btn');
			if (btn) positionPopoverToButton(btn, newsletterPopover);
		},
		{ passive: true }
	);
});
