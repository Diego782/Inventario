// Feature: inventario-ventas-core, Property 8: Validación de cantidad de etiquetas
// Validates: Requirements R10.4
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { z } from "zod"

// Schema de validación de cantidad de etiquetas (mismo que usa imprimir-etiqueta-dialog)
const cantidadEtiquetasSchema = z.number().int().min(1).max(100)

describe("Property 8: Validación de cantidad de etiquetas", () => {
  it("P8.1 — Para todo n ∈ [1, 100], el schema acepta el valor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 100 }),
        (n) => {
          const result = cantidadEtiquetasSchema.safeParse(n)
          return result.success === true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P8.2 — Para todo n < 1, el schema rechaza el valor", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 0 }),
        (n) => {
          const result = cantidadEtiquetasSchema.safeParse(n)
          return result.success === false
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P8.3 — Para todo n > 100, el schema rechaza el valor", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 101 }),
        (n) => {
          const result = cantidadEtiquetasSchema.safeParse(n)
          return result.success === false
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P8.4 — Para valores no enteros, el schema rechaza", () => {
    fc.assert(
      fc.property(
        fc.float({ min: Math.fround(1.1), max: Math.fround(99.9), noNaN: true })
          .filter(n => !Number.isInteger(n)),
        (n) => {
          const result = cantidadEtiquetasSchema.safeParse(n)
          return result.success === false
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P8.5 — Los límites exactos 1 y 100 son válidos", () => {
    expect(cantidadEtiquetasSchema.safeParse(1).success).toBe(true)
    expect(cantidadEtiquetasSchema.safeParse(100).success).toBe(true)
    expect(cantidadEtiquetasSchema.safeParse(0).success).toBe(false)
    expect(cantidadEtiquetasSchema.safeParse(101).success).toBe(false)
  })
})
