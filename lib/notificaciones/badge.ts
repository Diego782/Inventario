// Feature: dashboard-metricas-notificaciones
// Formato del Badge_Conteo y aria-label del icono de campana de notificaciones.
// Funciones puras. Requisitos: R9.2, R9.3, R13.1, R13.2.

const LIMITE_BADGE = 99
const TEXTO_EXCESO = "99+"

/**
 * Formatea el conteo de notificaciones no leídas para el Badge_Conteo.
 * - `n === 0` → cadena vacía (el badge se oculta).
 * - `1 ≤ n ≤ 99` → representación decimal de `n`.
 * - `n > 99` → "99+".
 */
export function formatearBadge(n: number): string {
  if (n <= 0) return ""
  if (n > LIMITE_BADGE) return TEXTO_EXCESO
  return String(n)
}

/**
 * Construye el `aria-label` accesible del icono de campana, en español,
 * incluyendo siempre la cantidad de notificaciones no leídas.
 * - `0 ≤ n ≤ 99` → incluye el número exacto.
 * - `n > 99` → incluye "99+".
 */
export function ariaLabelCampana(n: number): string {
  const cantidad = n > LIMITE_BADGE ? TEXTO_EXCESO : String(Math.max(0, n))
  return `Notificaciones: ${cantidad} sin leer`
}
