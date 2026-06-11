// Feature: dashboard-metricas-notificaciones — tiempo relativo en español (R9.5)

const SEG = 1000
const MIN = 60 * SEG
const HORA = 60 * MIN
const DIA = 24 * HORA

const pad2 = (n: number): string => String(n).padStart(2, "0")

/**
 * Devuelve la diferencia entre `desde` y `ahora` expresada en español por bandas (R9.5):
 *   - < 60 s            => "Hace un momento"
 *   - 1..59 min         => "Hace N min"
 *   - 1..23 h           => "Hace N h"
 *   - 1..6 d            => "Hace N d"
 *   - >= 7 días         => fecha de `desde` en formato dd/mm/aaaa (componentes locales)
 *
 * Función pura: no lee el reloj ni muta sus argumentos.
 * Si alguno de los argumentos no es una fecha válida (NaN), devuelve "Hace un momento".
 */
export function tiempoRelativoEs(desde: Date, ahora: Date): string {
  const ahoraMs = ahora.getTime()
  const desdeMs = desde.getTime()

  // Guard: si alguna fecha es inválida (NaN), retornar un valor seguro.
  if (!isFinite(ahoraMs) || !isFinite(desdeMs)) {
    return "Hace un momento"
  }

  const deltaMs = ahoraMs - desdeMs

  if (deltaMs < MIN) {
    return "Hace un momento"
  }

  if (deltaMs < HORA) {
    const minutos = Math.floor(deltaMs / MIN)
    return `Hace ${minutos} min`
  }

  if (deltaMs < DIA) {
    const horas = Math.floor(deltaMs / HORA)
    return `Hace ${horas} h`
  }

  if (deltaMs < 7 * DIA) {
    const dias = Math.floor(deltaMs / DIA)
    return `Hace ${dias} d`
  }

  return `${pad2(desde.getDate())}/${pad2(desde.getMonth() + 1)}/${desde.getFullYear()}`
}
