// Feature: dashboard-metricas-notificaciones, Property 10: Tiempo relativo en español por bandas
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { tiempoRelativoEs } from "@/lib/notificaciones/tiempo"

/**
 * Property 10: Tiempo relativo en español por bandas
 * Validates: Requirements 9.5
 *
 * Para todo par (desde, ahora) con desde <= ahora, `tiempoRelativoEs(desde, ahora)`
 * devuelve la cadena en español correspondiente a la banda del delta transcurrido:
 *   - delta < 60 s            => "Hace un momento"
 *   - 1..59 min  (N min)      => "Hace N min"
 *   - 1..23 h    (N h)        => "Hace N h"
 *   - 1..6 d     (N d)        => "Hace N d"
 *   - >= 7 días               => la fecha de `desde` en formato dd/mm/aaaa
 */

const SEG = 1000
const MIN = 60 * SEG
const HORA = 60 * MIN
const DIA = 24 * HORA

// `ahora` arbitrario dentro de un rango razonable (evita fechas extremas y NaN de shrinking).
const arbAhora = fc
  .date({
    min: new Date("2001-01-01T00:00:00.000Z"),
    max: new Date("2099-12-31T23:59:59.999Z"),
  })
  .filter((d) => isFinite(d.getTime()))

const pad2 = (n: number): string => String(n).padStart(2, "0")

// Fecha esperada en formato dd/mm/aaaa según los componentes locales de `desde`.
function fechaEsperada(desde: Date): string {
  return `${pad2(desde.getDate())}/${pad2(desde.getMonth() + 1)}/${desde.getFullYear()}`
}

describe("Property 10: Tiempo relativo en español por bandas", () => {
  it("P10.1 — delta < 60 s => 'Hace un momento'", () => {
    fc.assert(
      fc.property(arbAhora, fc.integer({ min: 0, max: 59 * SEG }), (ahora, deltaMs) => {
        const desde = new Date(ahora.getTime() - deltaMs)
        return tiempoRelativoEs(desde, ahora) === "Hace un momento"
      }),
      { numRuns: 100 }
    )
  })

  it("P10.2 — 1..59 min => 'Hace N min'", () => {
    fc.assert(
      fc.property(
        arbAhora,
        fc.integer({ min: 1, max: 59 }), // N minutos
        fc.integer({ min: 0, max: 59 }), // segundos extra dentro del mismo minuto
        (ahora, n, extraSeg) => {
          const deltaMs = n * MIN + extraSeg * SEG
          const desde = new Date(ahora.getTime() - deltaMs)
          return tiempoRelativoEs(desde, ahora) === `Hace ${n} min`
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P10.3 — 1..23 h => 'Hace N h'", () => {
    fc.assert(
      fc.property(
        arbAhora,
        fc.integer({ min: 1, max: 23 }), // N horas
        fc.integer({ min: 0, max: HORA - 1 }), // resto dentro de la misma hora
        (ahora, n, restoMs) => {
          const deltaMs = n * HORA + restoMs
          const desde = new Date(ahora.getTime() - deltaMs)
          return tiempoRelativoEs(desde, ahora) === `Hace ${n} h`
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P10.4 — 1..6 d => 'Hace N d'", () => {
    fc.assert(
      fc.property(
        arbAhora,
        fc.integer({ min: 1, max: 6 }), // N días
        fc.integer({ min: 0, max: DIA - 1 }), // resto dentro del mismo día
        (ahora, n, restoMs) => {
          const deltaMs = n * DIA + restoMs
          const desde = new Date(ahora.getTime() - deltaMs)
          return tiempoRelativoEs(desde, ahora) === `Hace ${n} d`
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P10.5 — >= 7 días => fecha en formato dd/mm/aaaa", () => {
    fc.assert(
      fc.property(
        arbAhora,
        fc.integer({ min: 7, max: 4000 }), // días transcurridos (>= 7)
        fc.integer({ min: 0, max: DIA - 1 }), // resto dentro del día
        (ahora, dias, restoMs) => {
          const deltaMs = dias * DIA + restoMs
          const desde = new Date(ahora.getTime() - deltaMs)
          const resultado = tiempoRelativoEs(desde, ahora)
          expect(resultado).toMatch(/^\d{2}\/\d{2}\/\d{4}$/)
          return resultado === fechaEsperada(desde)
        }
      ),
      { numRuns: 100 }
    )
  })
})
