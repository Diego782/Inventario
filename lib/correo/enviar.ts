/**
 * lib/correo/enviar.ts
 * Función principal de envío de correo con fallback a consola y timeout SMTP.
 * Requisitos: R6.3, R6.4, R6.5, R6.6
 */

import { configurado, crearTransporte } from "./transporte"
import { ErrorAppUrl, ErrorEnvioCorreo } from "./errores"

const TIMEOUT_MS = 15_000

export interface OpcionesCorreo {
  para: string
  asunto: string
  html: string
  texto: string
}

export interface ResultadoEnvio {
  entregado: boolean
  modo: "smtp" | "consola"
}

/**
 * Envía un correo electrónico.
 *
 * - Si `APP_URL` no está definida, lanza `ErrorAppUrl` (R6.6).
 * - Si SMTP no está configurado, registra en consola y devuelve modo `consola` (R6.3).
 * - Con SMTP, aplica timeout de 15s; ante error/timeout lanza `ErrorEnvioCorreo`
 *   sin filtrar credenciales (R6.4).
 */
export async function enviarCorreo(opciones: OpcionesCorreo): Promise<ResultadoEnvio> {
  const { para, asunto, html, texto } = opciones

  // R6.6: Validar APP_URL
  if (!process.env.APP_URL) {
    console.error("[correo] Variable APP_URL no configurada")
    throw new ErrorAppUrl()
  }

  // R6.3: Fallback a consola cuando SMTP no está configurado
  if (!configurado()) {
    console.log(`[correo][consola] Para: ${para}`)
    console.log(`[correo][consola] Asunto: ${asunto}`)
    console.log(`[correo][consola] Texto: ${texto}`)
    return { entregado: true, modo: "consola" }
  }

  // R6.4: Envío SMTP con timeout de 15s
  const transporte = crearTransporte()
  const from = process.env.SMTP_FROM ?? process.env.SMTP_USER

  const envio = transporte.sendMail({ from, to: para, subject: asunto, html, text: texto })
  const timeout = new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error("SMTP timeout (15s)")), TIMEOUT_MS)
  )

  try {
    await Promise.race([envio, timeout])
    return { entregado: true, modo: "smtp" }
  } catch (err: unknown) {
    throw new ErrorEnvioCorreo(err)
  }
}

/**
 * Construye un enlace público con token y acción (R6.5).
 * El token se incluye en texto plano en la URL.
 * Lanza `ErrorAppUrl` si `APP_URL` no está definida.
 */
export function construirEnlace(token: string, accion: "verificar" | "invitacion"): string {
  const appUrl = process.env.APP_URL
  if (!appUrl) {
    throw new ErrorAppUrl()
  }

  const base = appUrl.endsWith("/") ? appUrl.slice(0, -1) : appUrl
  return `${base}/?token=${encodeURIComponent(token)}&accion=${accion}`
}
