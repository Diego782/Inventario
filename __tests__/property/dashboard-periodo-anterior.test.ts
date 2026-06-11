// Feature: dashboard-metricas-notificaciones, Property 3: Periodo anterior de igual duración y contiguo
// **Validates: Requirements 2.11**
import { describe, it } from "vitest"
import * as fc from "fast-check"
import { periodoAnterior } from "@/lib/dashboard/rango"

// --- Helpers puros de fecha civil (YYYY-MM-DD) sobre el calendario UTC ---

const MS_POR_DIA = 24 * 60 * 60 * 1000

/** Convierte "YYYY-MM-DD" a un instante UTC a medianoche. */
function aUtc(fecha: string): number {
  const [a, m, d] = fecha.split("-").map(Number)
  return Date.UTC(a, m - 1, d)
}

/** Formatea un instante UTC (medianoche) como "YYYY-MM-DD". */
function aFecha(ms: number): string {
  const dt = new Date(ms)
  const a = dt.getUTCFullYear().toString().padStart(4, "0")
  const m = (dt.getUTCMonth() + 1).toString().padStart(2, "0")
  const d = dt.getUTCDate().toString().padStart(2, "0")
  return `${a}-${m}-${d}`
}

/** Duración inclusiva en días de un rango {desde, hasta} (ambos inclusive). */
function duracionInclusiva(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_POR_DIA) + 1
}

/**
 * Genera un rango válido { desde, hasta } con desde <= hasta.
 * Parte de una fecha base y le suma una duración inclusiva en días.
 */
const arbRangoValido = fc
  .record({
    base: fc.date({
      min: new Date(Date.UTC(2000, 0, 1)),
      max: new Date(Date.UTC(2100, 11, 31)),
      noInvalidDate: true,
    }),
    duracionDias: fc.integer({ min: 1, max: 366 }),
  })
  .map(({ base, duracionDias }) => {
    const desdeMs = Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate()
    )
    const hastaMs = desdeMs + (duracionDias - 1) * MS_POR_DIA
    return { desde: aFecha(desdeMs), hasta: aFecha(hastaMs) }
  })

describe("Property 3: Periodo anterior de igual duración y contiguo", () => {
  it("P3.1 — periodoAnterior tiene igual duración inclusiva en días que el rango actual", () => {
    fc.assert(
      fc.property(arbRangoValido, ({ desde, hasta }) => {
        const anterior = periodoAnterior(desde, hasta)
        return (
          duracionInclusiva(anterior.desde, anterior.hasta) ===
          duracionInclusiva(desde, hasta)
        )
      }),
      { numRuns: 100 }
    )
  })

  it("P3.2 — periodoAnterior.hasta es exactamente el día anterior a desde", () => {
    fc.assert(
      fc.property(arbRangoValido, ({ desde, hasta }) => {
        const anterior = periodoAnterior(desde, hasta)
        return aUtc(anterior.hasta) === aUtc(desde) - MS_POR_DIA
      }),
      { numRuns: 100 }
    )
  })

  it("P3.3 — periodoAnterior no se solapa con el rango actual (hasta < desde)", () => {
    fc.assert(
      fc.property(arbRangoValido, ({ desde, hasta }) => {
        const anterior = periodoAnterior(desde, hasta)
        return (
          anterior.hasta < desde &&
          aUtc(anterior.desde) <= aUtc(anterior.hasta)
        )
      }),
      { numRuns: 100 }
    )
  })
})
