// Feature: dashboard-metricas-notificaciones, Property 1: Presets de rango bien formados
// **Validates: Requirements 1.1, 1.2**
import { describe, it } from "vitest"
import * as fc from "fast-check"
import { formatInTimeZone } from "date-fns-tz"
import { presetARango } from "@/lib/dashboard/rango"

/**
 * Property 1: Presets de rango bien formados
 *
 * Para toda fecha `hoy` y todo `preset ∈ {hoy, esta_semana, este_mes, mes_anterior}`,
 * `presetARango(preset, hoy, tz)` produce un `{ desde, hasta }` (YYYY-MM-DD, inclusivo)
 * tal que:
 *  - `desde ≤ hasta`
 *  - ninguna fecha es posterior a `hoy`
 *  - se cumple la regla específica del preset:
 *      hoy          → desde = hasta = hoy
 *      esta_semana  → desde = lunes de la semana de hoy, hasta = hoy
 *      este_mes     → desde = día 1 del mes de hoy, hasta = hoy
 *      mes_anterior → desde = día 1 y hasta = último día del mes calendario previo
 */

const TZ = "America/Mexico_City"

const arbHoy = fc
  .date({
    min: new Date("2020-01-01T00:00:00.000Z"),
    max: new Date("2035-12-31T23:59:59.999Z"),
  })
  .filter((d) => isFinite(d.getTime()))
const arbPreset = fc.constantFrom(
  "hoy",
  "esta_semana",
  "este_mes",
  "mes_anterior"
) as fc.Arbitrary<"hoy" | "esta_semana" | "este_mes" | "mes_anterior">

// --- Helpers de cálculo esperado sobre fechas civiles (independientes del impl) ---

function iso(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0")
  const dd = String(d).padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

// Fecha civil (YYYY-MM-DD) de `hoy` en la zona horaria configurada.
function civilHoy(hoy: Date): { y: number; m: number; d: number; iso: string } {
  const s = formatInTimeZone(hoy, TZ, "yyyy-MM-dd")
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d, iso: s }
}

// Lunes de la semana de la fecha civil dada (semana que empieza en lunes).
function lunesDeLaSemana(y: number, m: number, d: number): string {
  const base = new Date(Date.UTC(y, m - 1, d))
  const dow = base.getUTCDay() // 0=domingo .. 6=sábado
  const diasARestar = (dow + 6) % 7 // lunes → 0, domingo → 6
  const lunes = new Date(Date.UTC(y, m - 1, d - diasARestar))
  return iso(lunes.getUTCFullYear(), lunes.getUTCMonth() + 1, lunes.getUTCDate())
}

describe("Property 1: Presets de rango bien formados", () => {
  it("presetARango produce rangos bien formados e inclusivos según cada preset", () => {
    fc.assert(
      fc.property(arbHoy, arbPreset, (hoy, preset) => {
        const { y, m, d, iso: hoyIso } = civilHoy(hoy)
        const rango = presetARango(preset, hoy, TZ)

        // Invariantes generales.
        if (rango.desde > rango.hasta) return false
        if (rango.desde > hoyIso) return false
        if (rango.hasta > hoyIso) return false

        // Regla específica de cada preset.
        switch (preset) {
          case "hoy":
            return rango.desde === hoyIso && rango.hasta === hoyIso
          case "esta_semana":
            return (
              rango.desde === lunesDeLaSemana(y, m, d) && rango.hasta === hoyIso
            )
          case "este_mes":
            return rango.desde === iso(y, m, 1) && rango.hasta === hoyIso
          case "mes_anterior": {
            const primerDiaPrev = new Date(Date.UTC(y, m - 2, 1))
            const ultimoDiaPrev = new Date(Date.UTC(y, m - 1, 0))
            const desdeEsperado = iso(
              primerDiaPrev.getUTCFullYear(),
              primerDiaPrev.getUTCMonth() + 1,
              primerDiaPrev.getUTCDate()
            )
            const hastaEsperado = iso(
              ultimoDiaPrev.getUTCFullYear(),
              ultimoDiaPrev.getUTCMonth() + 1,
              ultimoDiaPrev.getUTCDate()
            )
            return (
              rango.desde === desdeEsperado && rango.hasta === hastaEsperado
            )
          }
          default:
            return false
        }
      }),
      { numRuns: 100 }
    )
  })
})
