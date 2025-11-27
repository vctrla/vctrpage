const newsletterArrowSvg = `
  <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
`;

export function embedNewsletter(ctaText, turnstileSiteKey) {
	const ctaPlaceholder = 'tu@email.com';

	return `
<section class="newsletter-inline" aria-label="Newsletter">
    <div class="newsletter-wrapper">
        <h2 class="newsletter-cta">${ctaText}</h2>
        <form class="newsletter-form" action="#" method="post">
            <div class="newsletter-field">
                <div class="newsletter-row">
                    <input
                        id="newsletter-email"
                        name="email"
                        type="email"
                        placeholder="${ctaPlaceholder}"
                        class="newsletter-input"
                        autocomplete="email"
                        required
                    />
                    <input
                        type="text"
                        name="website"
                        autocomplete="off"
                        tabindex="-1"
                        aria-hidden="true"
                        style="position:absolute;left:-9999px;top:auto;width:1px;height:1px;overflow:hidden;"
                    />
                    <button class="newsletter-go" type="submit" aria-label="Subscribe">
                        ${newsletterArrowSvg}
                    </button>
                </div>
                <p class="newsletter-message" aria-live="polite"></p>
                <div
                    class="cf-turnstile"
                    id="newsletter-turnstile"
                    data-sitekey="${turnstileSiteKey}"
                    data-theme="light"
                    data-size="flexible"
                    data-appearance="interaction-only"
                    data-language="es"
                    data-callback="onNewsletterTurnstileSuccess"
                    data-expired-callback="onNewsletterTurnstileExpired"
                    data-timeout-callback="onNewsletterTurnstileTimeout"
                    data-error-callback="onNewsletterTurnstileError"
                ></div>
            </div>
        </form>
    </div>
</section>
`;
}
