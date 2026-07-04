// Feature: gestion-clientes-y-fiadores, Property 16: Cálculo de totales de venta con descuentos
/**
 * Validates: Requirements 7.1, 7.2, 7.3, 7.7
 *
 * Para entradas válidas (descuentos no negativos, Descuento_Producto ≤ subtotal bruto de su
 * línea, Descuento_Total ≤ suma de subtotales):
 *   - Cada subtotal de línea es redondearBancario(precio_unitario × cantidad − descuento_producto)
 *     (puede ser 0 cuando el descuento iguala al subtotal bruto).
 *   - El total es redondearBancario((Σ subtotales_linea − descuento_total) + impuesto).
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { calcularTotalesVenta, type LineaVenta } from "@/lib/dominio/descuentos"
import { redondearBancario } from "@/lib/money"

// ── Generadores ────────────────────────────────────────────────────────────

/** Genera un precio unitario positivo con hasta 2 decimales (0.01 – 10 000). */
const arbPrecio = fc
  .integer({ min: 1, max: 1_000_000 }) // en centavos → divide entre 100
  .map((c) => c / 100)

/** Genera una cantidad entera entre 1 y 1 000. */
const arbCantidad = fc.integer({ min: 1, max: 1_000 })

/**
 * Genera una línea de venta con un descuento de producto válido:
 *   0 ≤ descuento_producto ≤ subtotal_bruto (precio × cantidad).
 */
const arbLinea: fc.Arbitrary<LineaVenta> = fc
  .tuple(arbPrecio, arbCantidad)
  .chain(([precio_unitario, cantidad]) => {
    const subtotalBruto = precio_unitario * cantidad
    // Descuento en centavos para mantenerse en el rango entero limpio.
    const maxDescCentavos = Math.floor(subtotalBruto * 100)
    return fc
      .integer({ min: 0, max: maxDescCentavos })
      .map((descCentavos) => ({
        precio_unitario,
        cantidad,
        descuento_producto: descCentavos / 100,
      }))
  })

/** Genera un arreglo de 1 a 10 líneas válidas. */
const arbLineas = fc.array(arbLinea, { minLength: 1, maxLength: 10 })

/** Genera un porcentaje de impuesto: 0, 8, 10, 13, 16, 21 % (valores típicos). */
const arbImpuesto = fc.oneof(
  fc.constant(0),
  fc.constantFrom(8, 10, 13, 16, 21)
)

/**
 * Generador compuesto que produce (lineas, descuentoTotal, porcentajeImpuesto)
 * con descuentoTotal ∈ [0, suma de subtotales de línea].
 */
const arbEntradaValida = arbLineas.chain((lineas) => {
  // Calcula los subtotales de línea redondeados para determinar el límite del descuentoTotal.
  const subtotalesLinea = lineas.map((l) =>
    redondearBancario(l.precio_unitario * l.cantidad - (l.descuento_producto ?? 0))
  )
  const sumaSubtotales = subtotalesLinea.reduce((a, b) => a + b, 0)
  const maxDescTotalCentavos = Math.floor(sumaSubtotales * 100)

  return fc.tuple(
    fc.constant(lineas),
    fc.integer({ min: 0, max: Math.max(0, maxDescTotalCentavos) }).map((c) => c / 100),
    arbImpuesto
  )
})

// ── Tests PBT ─────────────────────────────────────────────────────────────

describe("Property 16: Cálculo de totales de venta con descuentos", () => {
  it(
    "P16.1 — Cada subtotal de línea es redondearBancario(precio × cantidad − descuento_producto), pudiendo ser 0",
    () => {
      fc.assert(
        fc.property(arbEntradaValida, ([lineas, descuentoTotal, porcentajeImpuesto]) => {
          const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)

          for (let i = 0; i < lineas.length; i++) {
            const { precio_unitario, cantidad, descuento_producto = 0 } = lineas[i]
            const esperado = redondearBancario(precio_unitario * cantidad - descuento_producto)
            expect(resultado.subtotalesLinea[i]).toBeCloseTo(esperado, 9)
            // El subtotal de línea debe ser ≥ 0 (Req 7.1).
            expect(resultado.subtotalesLinea[i]).toBeGreaterThanOrEqual(0)
          }
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P16.2 — El total es redondearBancario((Σ subtotales_linea − descuento_total) + impuesto)",
    () => {
      fc.assert(
        fc.property(arbEntradaValida, ([lineas, descuentoTotal, porcentajeImpuesto]) => {
          const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)

          // Reconstruir el total esperado usando la misma fórmula del diseño.
          const sumaSubtotales = resultado.subtotalesLinea.reduce((a, b) => a + b, 0)
          const baseImponible = sumaSubtotales - descuentoTotal
          const impuestoEsperado =
            porcentajeImpuesto > 0
              ? redondearBancario((baseImponible * porcentajeImpuesto) / 100)
              : 0
          const totalEsperado = redondearBancario(baseImponible + impuestoEsperado)

          expect(resultado.total).toBeCloseTo(totalEsperado, 9)
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P16.3 — La base imponible es Σ subtotales_linea − descuento_total (Req 7.2, 7.3)",
    () => {
      fc.assert(
        fc.property(arbEntradaValida, ([lineas, descuentoTotal, porcentajeImpuesto]) => {
          const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)

          const sumaEsperada = resultado.subtotalesLinea.reduce((a, b) => a + b, 0)
          expect(resultado.subtotal).toBeCloseTo(sumaEsperada, 9)
          expect(resultado.baseImponible).toBeCloseTo(sumaEsperada - descuentoTotal, 9)
          expect(resultado.descuentoTotalAplicado).toBeCloseTo(descuentoTotal, 9)
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P16.4 — El total tiene como máximo 2 decimales (redondeo bancario aplicado, Req 7.7)",
    () => {
      fc.assert(
        fc.property(arbEntradaValida, ([lineas, descuentoTotal, porcentajeImpuesto]) => {
          const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)

          const decimalesTotal = (resultado.total.toString().split(".")[1] ?? "").length
          expect(decimalesTotal).toBeLessThanOrEqual(2)

          for (const sub of resultado.subtotalesLinea) {
            const decimalesSub = (sub.toString().split(".")[1] ?? "").length
            expect(decimalesSub).toBeLessThanOrEqual(2)
          }
        }),
        { numRuns: 100 }
      )
    }
  )
})
