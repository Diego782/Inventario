/**
 * lib/log.ts
 * Logger mínimo para InvenPro.
 * Envuelve console.* con prefijo [invenpro] y timestamp ISO.
 * No incluye datos sensibles (contraseñas, tokens, datos personales).
 */

type LogPayload = Record<string, unknown> | string

function formatear(nivel: string, payload: LogPayload): string {
  const ts = new Date().toISOString()
  const datos = typeof payload === "string" ? payload : JSON.stringify(payload)
  return `[invenpro] [${ts}] [${nivel}] ${datos}`
}

export const log = {
  info(payload: LogPayload): void {
    console.info(formatear("INFO", payload))
  },
  warn(payload: LogPayload): void {
    console.warn(formatear("WARN", payload))
  },
  error(payload: LogPayload): void {
    console.error(formatear("ERROR", payload))
  },
}
