// Feature: dashboard-metricas-notificaciones, Property 4: Variación porcentual y nulabilidad
// Validates: Requirements 2.12, 4.6
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { variacionPorcentual } from "@/lib/dashboard/series"

// Montos finitos con 2 decimales (no negativos), como en design.md
const arbMonto = fc
  .float({ min: 0, max: 1e9, noNaN: true })
  .map((n) => Math.round(n * 100) / 100)

// Números finitos arbitrarios (incluye negativos) para reforzar la generalidad
const arbFinito = fc
  .float({ min: -1e9, max: 1e9, noNaN: true })
  .map((n) => Math.round(n * 100) / 100)

describe("Property 4: Variación porcentual y nulabilidad", () => {
  it("P4.1 — variacionPorcentual(actual, anterior) es null si y sólo si anterior === 0", () => {
    fc.assert(
      fc.property(
        arbFinito,
        // anterior: a veces exactamente 0, a veces cualquier monto finito
        fc.oneof(fc.constant(0), arbFinito),
        (actual, anterior) => {
          const resultado = variacionPorcentual(actual, anterior)
          // Bicondicional: null ⟺ anterior === 0
          return (resultado === null) === (anterior === 0)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P4.2 — Para anterior !== 0, el valor es exactamente (actual − anterior) / anterior × 100", () => {
    fc.assert(
      fc.property(
        arbFinito,
        arbFinito.filter((n) => n !== 0),
        (actual, anterior) => {
          const esperado = ((actual - anterior) / anterior) * 100
          return variacionPorcentual(actual, anterior) === esperado
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P4.3 — Con anterior === 0 el resultado siempre es null (incluye actual === 0)", () => {
    fc.assert(
      fc.property(arbMonto, (actual) => {
        return variacionPorcentual(actual, 0) === null
      }),
      { numRuns: 100 }
    )
  })

  it("P4.4 — Casos ejemplares del cálculo de variación", () => {
    expect(variacionPorcentual(150, 100)).toBe(50)
    expect(variacionPorcentual(50, 100)).toBe(-50)
    expect(variacionPorcentual(100, 100)).toBe(0)
    expect(variacionPorcentual(0, 100)).toBe(-100)
    expect(variacionPorcentual(100, 0)).toBeNull()
    expect(variacionPorcentual(0, 0)).toBeNull()
  })
})
