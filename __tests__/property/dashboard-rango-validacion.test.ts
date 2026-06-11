// Feature: dashboard-metricas-notificaciones, Property 2: Aceptación/rechazo de rango personalizado
// **Validates: Requirements 1.6, 1.7, 1.8, 2.2, 3.2**
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { validarRangoPersonalizado } from "@/lib/dashboard/rango"

// --- Predicado de referencia (contrato esperado, independiente de la implementación) ---

const PATRON_ISO = /^\d{4}-\d{2}-\d{2}$/

// `Date` parseado en UTC a partir de una fecha civil YYYY-MM-DD.
function aUtc(fecha: string): number {
  const [y, m, d] = fecha.split("-").map((n) => Number(n))
  return Date.UTC(y, m - 1, d)
}

// Fecha civil (YYYY-MM-DD, UTC) de un `Date`.
function fechaCivil(d: Date): string {
  return d.toISOString().slice(0, 10)
}

const MS_DIA = 24 * 60 * 60 * 1000

// Duración inclusiva en días entre dos fechas civiles válidas.
function duracionInclusiva(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA) + 1
}

// Verdadero si la fecha civil es una fecha de calendario real (descarta 2025-02-30, 2025-13-01...).
function esFechaRealIso(fecha: string): boolean {
  if (!PATRON_ISO.test(fecha)) return false
  const [y, m, d] = fecha.split("-").map((n) => Number(n))
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

// El contrato: ok si y sólo si ambas definidas, formato/fecha válidos, desde<=hasta,
// ninguna futura respecto a hoy, y duración inclusiva <= 366.
function deberiaAceptar(
  desde: string | null,
  hasta: string | null,
  hoy: Date
): boolean {
  if (desde === null || hasta === null) return false
  if (!esFechaRealIso(desde) || !esFechaRealIso(hasta)) return false
  if (desde > hasta) return false
  const hoyStr = fechaCivil(hoy)
  if (desde > hoyStr || hasta > hoyStr) return false
  if (duracionInclusiva(desde, hasta) > 366) return false
  return true
}

// --- Generadores ---

const arbHoy = fc
  .date({ min: new Date("2020-01-01"), max: new Date("2030-12-31") })
  .filter((d) => isFinite(d.getTime()))

const arbFechaStr = fc
  .date({ min: new Date("2018-01-01"), max: new Date("2032-12-31") })
  .map((d) => d.toISOString().slice(0, 10))

// Cadenas que NO casan YYYY-MM-DD o que no son fechas reales.
const arbFechaInvalida = fc.constantFrom(
  "",
  "abc",
  "2025/04/10",
  "2025-13-01",
  "2025-02-30",
  "10-04-2025",
  "2025-4-1",
  "20250410"
)

// Cada extremo puede ser null, una fecha válida o una cadena inválida.
const arbExtremo = fc.oneof(
  { weight: 1, arbitrary: fc.constant<string | null>(null) },
  { weight: 4, arbitrary: arbFechaStr },
  { weight: 2, arbitrary: arbFechaInvalida as fc.Arbitrary<string | null> }
)

describe("Property 2: Aceptación/rechazo de rango personalizado", () => {
  it("P2.1 — ok:true si y sólo si el rango cumple todas las condiciones; en otro caso ok:false con mensaje en español", () => {
    fc.assert(
      fc.property(arbExtremo, arbExtremo, arbHoy, (desde, hasta, hoy) => {
        const esperado = deberiaAceptar(desde, hasta, hoy)
        const resultado = validarRangoPersonalizado(desde, hasta, hoy)

        expect(resultado.ok).toBe(esperado)

        if (resultado.ok) {
          // Cuando acepta, devuelve el rango con las mismas fechas.
          expect(resultado.rango).toEqual({ desde, hasta })
        } else {
          // Cuando rechaza, expone un mensaje no vacío en español.
          expect(typeof resultado.mensaje).toBe("string")
          expect(resultado.mensaje.trim().length).toBeGreaterThan(0)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("P2.2 — rangos válidos cercanos al límite de 366 días se aceptan y a 367 se rechazan", () => {
    // desde fijo; hasta a exactamente 366 días inclusivos (válido) y 367 (inválido).
    const hoy = new Date("2025-12-31")
    const aceptado = validarRangoPersonalizado("2024-01-01", "2024-12-31", hoy) // 366 días (bisiesto)
    expect(aceptado.ok).toBe(true)

    const rechazado = validarRangoPersonalizado("2024-01-01", "2025-01-01", hoy) // 367 días
    expect(rechazado.ok).toBe(false)
    if (!rechazado.ok) {
      expect(rechazado.mensaje.trim().length).toBeGreaterThan(0)
    }
  })

  it("P2.3 — inicio posterior al fin se rechaza con el mensaje específico de R1.7", () => {
    const resultado = validarRangoPersonalizado("2025-04-20", "2025-04-02", new Date("2025-12-31"))
    expect(resultado.ok).toBe(false)
    if (!resultado.ok) {
      expect(resultado.mensaje).toBe(
        "La fecha de inicio debe ser anterior o igual a la fecha de fin"
      )
    }
  })
})
