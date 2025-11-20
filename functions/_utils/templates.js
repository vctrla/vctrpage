export function verificationEmailHtml({ confirmUrl }) {
	return `
  <div style="font-family: system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif; line-height:1.5; color:#111;">
    <p>Para confirmar tu suscripción, haz clic en el siguiente botón:</p>
    <p>
      <a href="${confirmUrl}" style="font-size:16px;background:#111;color:#fff;padding:8px 12px;border-radius:6px;text-decoration:none;display:inline-block">
        Confirmar suscripción
      </a>
    </p>
    <p>O utiliza el siguiente enlace:</p>
    <p><a href="${confirmUrl}">${confirmUrl}</a></p>
    <p>Gracias por suscribirte.</p>
     <a
			style="
            	font-family: Georgia, 'Times New Roman', Times, serif;
				display: inline-block;
				font-variant: small-caps;
				font-weight: 400;
				font-size: 32px;
				color: black;
				appearance: none;
				-webkit-appearance: none;
				text-decoration: none;
				cursor: pointer;
			"
			href="https://vctr.page"
			aria-label="Víctor"
		>
			Víctor
		</a>
  </div>
  `.trim();
}

export function confirmHtml(content, status = 200) {
	return new Response(
		`<!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Confirmación de suscripción</title>
      <style>
			body {
				font-family: Georgia, 'Times New Roman', Times, serif;
				padding: 2rem;
				text-align: center;
				color: black;
			}
		</style>
    </head>
    <body><p>${content}</p>
    <a
			style="
				display: inline-block;
				margin-top: 20px;
				font-variant: small-caps;
				font-weight: 400;
				font-size: 32px;
				color: black;
				appearance: none;
				-webkit-appearance: none;
				text-decoration: none;
				cursor: pointer;
			"
			href="https://vctr.page"
			aria-label="Víctor"
		>
			Víctor
		</a>
    </body>
    </html>`,
		{
			status,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Referrer-Policy': 'no-referrer',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
			},
		}
	);
}

export function unsubHtml(content, status = 200) {
	return new Response(
		`<!doctype html><html lang="es">
            <head>
                <meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
                <title>Darse de baja</title>
                <style>body{font-family: Georgia, 'Times New Roman', Times, serif;padding:2rem;text-align:center}h1{color:#ef4444}</style>
            </head>
            <body><p>${content}</p>
            <a
			style="
				display: inline-block;
				margin-top: 20px;
				font-variant: small-caps;
				font-weight: 400;
				font-size: 32px;
				color: black;
				appearance: none;
				-webkit-appearance: none;
				text-decoration: none;
				cursor: pointer;
			"
			href="https://vctr.page"
			aria-label="Víctor"
            >
                Víctor
            </a>
            </body>
        </html>`,
		{
			status,
			headers: {
				'Content-Type': 'text/html; charset=utf-8',
				'Referrer-Policy': 'no-referrer',
				'X-Content-Type-Options': 'nosniff',
				'X-Frame-Options': 'DENY',
			},
		}
	);
}
