/**
 * lib/log.ts
 * Logger mínimo para Dego.
 * Envuelve console.* con prefijo [dego] y timestamp ISO.
 * No incluye datos sensibles (contraseñas, tokens, datos personales).
 */

import { MARCA } from "@/lib/marca"

type LogPayload = Record<string, unknown> | string

function formatear(nivel: string, payload: LogPayload): string {
  const ts = new Date().toISOString()
  const datos = typeof payload === "string" ? payload : JSON.stringify(payload)
  return `${MARCA.prefijoLog} [${ts}] [${nivel}] ${datos}`
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
