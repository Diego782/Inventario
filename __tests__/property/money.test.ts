// Feature: inventario-ventas-core, Property 6: Redondeo bancario (half-to-even)
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

describe("Property 6: Redondeo bancario (half-to-even)", () => {
  it("P6.1 — La diferencia entre el valor original y el redondeado es ≤ 0.005", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1e6, max: 1e6, noNaN: true }),
        (x) => {
          const r = redondearBancario(x)
          return Math.abs(x - r) <= 0.005 + 1e-9
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P6.2 — La función es idempotente: redondear(redondear(x)) === redondear(x)", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1e6, max: 1e6, noNaN: true }),
        (x) => {
          const r1 = redondearBancario(x)
          const r2 = redondearBancario(r1)
          return r1 === r2
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P6.3 — Casos half-to-even: redondea al par más cercano cuando el resto es exactamente 0.5", () => {
    // Casos con decimales=0 (enteros): half-to-even clásico
    expect(redondearBancario(0.5, 0)).toBe(0)   // 0 es par
    expect(redondearBancario(1.5, 0)).toBe(2)   // 2 es par
    expect(redondearBancario(2.5, 0)).toBe(2)   // 2 es par
    expect(redondearBancario(3.5, 0)).toBe(4)   // 4 es par
    expect(redondearBancario(4.5, 0)).toBe(4)   // 4 es par
    expect(redondearBancario(-0.5, 0)).toBe(0)  // 0 es par
    expect(redondearBancario(-1.5, 0)).toBe(-2) // -2 es par

    // Casos con decimales=2 (del design.md): 2.125 → 2.12, 2.135 → 2.14
    expect(redondearBancario(2.125)).toBe(2.12) // 2 es par
    expect(redondearBancario(2.135)).toBe(2.14) // 4 es par
  })

  it("P6.4 — El resultado siempre tiene como máximo 2 decimales", () => {
    fc.assert(
      fc.property(
        fc.float({ min: -1e4, max: 1e4, noNaN: true }),
        (x) => {
          const r = redondearBancario(x)
          const decimalesResultado = (r.toString().split(".")[1] ?? "").length
          return decimalesResultado <= 2
        }
      ),
      { numRuns: 100 }
    )
  })
})
