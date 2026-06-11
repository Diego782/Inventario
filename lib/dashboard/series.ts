// lib/dashboard/series.ts
// Utilidades puras de cliente para series temporales y variación porcentual del Dashboard.
// Sin side effects. Candidatas a property-based testing (ver design.md § Utilidades puras de cliente).

import { formatInTimeZone } from "date-fns-tz"

// Rango de fechas civiles, inclusivo. YYYY-MM-DD (ver hooks/use-rango-fechas.ts).
export type RangoFechas = { desde: string; hasta: string }

/**
 * Variación porcentual entre el periodo actual y el anterior.
 *
 * @returns `null` si y sólo si `anterior === 0` (R2.12); en otro caso, exactamente
 *          `(actual − anterior) / anterior × 100` (sin redondeo).
 */
export function variacionPorcentual(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return ((actual - anterior) / anterior) * 100
}

/**
 * Agrupa puntos crudos en un punto por cada día civil del rango (inclusivo), en la
 * zona horaria `tz`. Los días sin datos quedan con `valor: 0`. El resultado está
 * ordenado cronológicamente por `fecha` (YYYY-MM-DD).
 *
 * Cada `creado_en` (timestamp ISO) se asigna a su día civil en `tz` mediante
 * `date-fns-tz`. Sin side effects.
 */
export function agruparPorDia(
  puntos: Array<{ creado_en: string; valor: number }>,
  rango: RangoFechas,
  tz: string
): Array<{ fecha: string; valor: number }> {
  // Acumula los valores por día civil (en tz) a partir de los puntos crudos.
  const acumulado = new Map<string, number>()
  for (const punto of puntos) {
    const fecha = formatInTimeZone(new Date(punto.creado_en), tz, "yyyy-MM-dd")
    acumulado.set(fecha, (acumulado.get(fecha) ?? 0) + punto.valor)
  }

  // Genera un punto por cada día del rango [desde, hasta], rellenando ceros.
  const resultado: Array<{ fecha: string; valor: number }> = []
  for (const fecha of diasDelRango(rango)) {
    resultado.push({ fecha, valor: acumulado.get(fecha) ?? 0 })
  }
  return resultado
}

/**
 * Enumera las fechas civiles (YYYY-MM-DD) del rango inclusivo [desde, hasta].
 * Opera sobre fechas civiles puras (mediodía UTC) para evitar artefactos de DST.
 */
function diasDelRango(rango: RangoFechas): string[] {
  const fechas: string[] = []
  const inicio = aMediodiaUTC(rango.desde)
  const fin = aMediodiaUTC(rango.hasta)
  for (let t = inicio; t <= fin; t += 24 * 60 * 60 * 1000) {
    fechas.push(new Date(t).toISOString().slice(0, 10))
  }
  return fechas
}

/** Convierte "YYYY-MM-DD" al instante de mediodía UTC de ese día civil. */
function aMediodiaUTC(fecha: string): number {
  const [anio, mes, dia] = fecha.split("-").map(Number)
  return Date.UTC(anio, mes - 1, dia, 12, 0, 0, 0)
}
