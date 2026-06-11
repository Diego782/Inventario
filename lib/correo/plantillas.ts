/**
 * Escapa caracteres HTML especiales para prevenir XSS en plantillas.
 */
export function escHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
}

// ── Layout base compartido ────────────────────────────────────────────────────

function layout(contenido: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Dego</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background-color:#09090b;border-radius:12px 12px 0 0;padding:32px 40px;text-align:center;">
              <table cellpadding="0" cellspacing="0" style="margin:0 auto;">
                <tr>
                  <td style="background-color:#ffffff;border-radius:8px;padding:8px 12px;display:inline-block;">
                    <span style="font-size:20px;font-weight:800;color:#09090b;letter-spacing:-0.5px;">Dego</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background-color:#ffffff;padding:40px;border-left:1px solid #e4e4e7;border-right:1px solid #e4e4e7;">
              ${contenido}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f9f9fb;border:1px solid #e4e4e7;border-top:none;border-radius:0 0 12px 12px;padding:24px 40px;text-align:center;">
              <p style="margin:0;font-size:12px;color:#71717a;line-height:1.6;">
                Este correo fue enviado por <strong>Dego</strong>.<br/>
                Si no solicitaste esto, puedes ignorar este mensaje.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function botonCTA(texto: string, enlace: string, color = "#09090b"): string {
  return `
    <table cellpadding="0" cellspacing="0" style="margin:32px auto;">
      <tr>
        <td style="border-radius:8px;background-color:${color};">
          <a href="${enlace}"
             style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;letter-spacing:0.2px;">
            ${texto}
          </a>
        </td>
      </tr>
    </table>`
}

function enlaceAlternativo(enlace: string): string {
  return `
    <p style="margin:24px 0 0;font-size:13px;color:#71717a;text-align:center;line-height:1.6;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:<br/>
      <a href="${enlace}" style="color:#09090b;word-break:break-all;">${enlace}</a>
    </p>`
}

// ── Plantilla de verificación de correo ──────────────────────────────────────

export function plantillaVerificacion(nombre: string, enlace: string) {
  const nombreEsc = escHtml(nombre)

  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px;">
      Verifica tu correo electrónico
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
      Hola <strong>${nombreEsc}</strong>, gracias por registrarte en Dego.
    </p>

    <div style="background-color:#f9f9fb;border:1px solid #e4e4e7;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
      <p style="margin:0;font-size:14px;color:#52525b;line-height:1.6;">
        Para activar tu cuenta y comenzar a usar Dego, confirma que este correo te pertenece haciendo clic en el botón de abajo.
      </p>
    </div>

    ${botonCTA("Verificar mi cuenta", enlace)}

    <div style="border-top:1px solid #e4e4e7;margin:24px 0;"></div>

    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      ⏱ Este enlace es válido por <strong>24 horas</strong>.
    </p>

    ${enlaceAlternativo(enlace)}
  `)

  return {
    asunto: "Verifica tu correo en Dego",
    texto: `Hola ${nombre}, confirma tu correo en Dego: ${enlace} (válido por 24 horas).`,
    html,
  }
}

// ── Plantilla de invitación a organización ────────────────────────────────────

export function plantillaInvitacion(org: string, rol: string, enlace: string) {
  const orgEsc = escHtml(org)
  const rolEsc = escHtml(rol)

  const html = layout(`
    <h1 style="margin:0 0 8px;font-size:24px;font-weight:700;color:#09090b;letter-spacing:-0.5px;">
      Te invitaron a unirte a un equipo
    </h1>
    <p style="margin:0 0 24px;font-size:15px;color:#52525b;line-height:1.6;">
      Has recibido una invitación para unirte a <strong>${orgEsc}</strong> en Dego.
    </p>

    <!-- Tarjeta de la organización -->
    <div style="background-color:#f9f9fb;border:1px solid #e4e4e7;border-radius:8px;padding:20px 24px;margin:0 0 24px;">
      <table cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td>
            <p style="margin:0 0 4px;font-size:11px;font-weight:600;color:#71717a;text-transform:uppercase;letter-spacing:0.8px;">Organización</p>
            <p style="margin:0;font-size:18px;font-weight:700;color:#09090b;">${orgEsc}</p>
          </td>
          <td align="right" style="vertical-align:top;">
            <span style="display:inline-block;background-color:#09090b;color:#ffffff;font-size:12px;font-weight:600;padding:4px 12px;border-radius:20px;">
              ${rolEsc}
            </span>
          </td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 8px;font-size:14px;color:#52525b;line-height:1.6;text-align:center;">
      Acepta la invitación para comenzar a colaborar con tu equipo.
    </p>

    ${botonCTA("Aceptar invitación", enlace)}

    <div style="border-top:1px solid #e4e4e7;margin:24px 0;"></div>

    <p style="margin:0;font-size:13px;color:#71717a;line-height:1.6;text-align:center;">
      ⏱ Esta invitación es válida por <strong>72 horas</strong>.
    </p>

    ${enlaceAlternativo(enlace)}
  `)

  return {
    asunto: `Te invitaron a unirte a ${org} en Dego`,
    texto: `Te invitaron a unirte a ${org} con el rol ${rol}. Acepta aquí: ${enlace}`,
    html,
  }
}
