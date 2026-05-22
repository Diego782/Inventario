// Feature: inventario-ventas-core, Property 5: Invariante de stock no negativo
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { calcularEstadoStock } from "@/lib/api/serializadores"

/**
 * Validates: Requirements R12.3, R15.1, R15.2
 *
 * Property 5: Invariante de stock no negativo (lógica pura)
 *
 * Estos tests verifican las propiedades de la función `calcularEstadoStock`
 * que determina el estado del stock de un producto. La lógica pura es
 * testeable sin necesidad de BD.
 */
describe("Property 5: Invariante de stock no negativo (lógica pura)", () => {
  it("P5.1 — calcularEstadoStock nunca retorna un estado inválido", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 1000 }),
        (stock_actual, stock_minimo) => {
          const estado = calcularEstadoStock(stock_actual, stock_minimo)
          return ["En Stock", "Bajo Stock", "Crítico"].includes(estado)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P5.2 — stock_actual = 0 siempre es Crítico", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 1000 }),
        (stock_minimo) => {
          return calcularEstadoStock(0, stock_minimo) === "Crítico"
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P5.3 — stock_actual > stock_minimo siempre es En Stock", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.integer({ min: 0, max: 9999 }),
        (stock_actual, stock_minimo) => {
          // Solo cuando stock_actual > stock_minimo
          if (stock_actual <= stock_minimo) return true // skip
          return calcularEstadoStock(stock_actual, stock_minimo) === "En Stock"
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P5.4 — Umbrales de estado son mutuamente excluyentes y exhaustivos", () => {
    // Para cualquier combinación válida, exactamente un estado aplica
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10000 }),
        fc.integer({ min: 0, max: 1000 }),
        (stock_actual, stock_minimo) => {
          const estado = calcularEstadoStock(stock_actual, stock_minimo)
          const esCritico = stock_actual === 0 || stock_actual <= stock_minimo * 0.3
          const esBajoStock = !esCritico && stock_actual <= stock_minimo
          const esEnStock = !esCritico && !esBajoStock

          if (esCritico) return estado === "Crítico"
          if (esBajoStock) return estado === "Bajo Stock"
          if (esEnStock) return estado === "En Stock"
          return false
        }
      ),
      { numRuns: 100 }
    )
  })
})
