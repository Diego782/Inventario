// Feature: gestion-clientes-y-fiadores, Property 18: Ausencia de descuentos es retrocompatible
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"
import { calcularTotalesVenta, type LineaVenta } from "@/lib/dominio/descuentos"

/**
 * Property 18: Ausencia de descuentos es retrocompatible
 *
 * Para todo conjunto de líneas de venta, cuando Descuento_Producto y Descuento_Total
 * están ausentes o son cero, el total calculado es igual a
 * redondearBancario(Σ (precio_unitario × cantidad) + impuesto),
 * idéntico al cálculo previo a esta funcionalidad.
 *
 * Validates: Requirements 7.8
 */

// ── Generadores ────────────────────────────────────────────────────────────

/** Precio unitario: 0.01 – 10.000,00 con hasta 2 decimales */
const arbPrecio = fc
  .integer({ min: 1, max: 1_000_000 })
  .map((n) => n / 100)

/** Cantidad: 1 – 999 */
const arbCantidad = fc.integer({ min: 1, max: 999 })

/** Porcentaje de impuesto: 0, 5, 8, 10, 15, 16, 19, 21 (valores realistas) */
const arbImpuesto = fc.oneof(
  fc.constant(0),
  fc.constantFrom(5, 8, 10, 15, 16, 19, 21)
)

/**
 * Genera una línea SIN descuento_producto (campo ausente).
 * Representa el caso previo a la funcionalidad de descuentos.
 */
const arbLineaSinDescuento: fc.Arbitrary<LineaVenta> = fc.record({
  precio_unitario: arbPrecio,
  cantidad: arbCantidad,
})

/**
 * Genera una línea con descuento_producto explícitamente en cero.
 */
const arbLineaDescuentoCero: fc.Arbitrary<LineaVenta> = fc.record({
  precio_unitario: arbPrecio,
  cantidad: arbCantidad,
  descuento_producto: fc.constant(0),
})

/**
 * Mezcla líneas sin descuento y líneas con descuento_producto = 0,
 * para cubrir ambas variantes del enunciado ("ausentes o cero").
 */
const arbLineaRetrocompat: fc.Arbitrary<LineaVenta> = fc.oneof(
  arbLineaSinDescuento,
  arbLineaDescuentoCero
)

/** Lista de líneas (1–30 elementos) */
const arbLineas = fc.array(arbLineaRetrocompat, { minLength: 1, maxLength: 30 })

// ── Tests PBT ──────────────────────────────────────────────────────────────

describe("Property 18: Ausencia de descuentos es retrocompatible", () => {
  /**
   * Calcula el total esperado usando la misma lógica que el sistema:
   * subtotal de cada línea = redondearBancario(precio × cantidad),
   * base = Σ subtotales, impuesto = redondearBancario(base × pct/100),
   * total = redondearBancario(base + impuesto).
   *
   * Nota: el redondeo bancario se aplica por línea antes de sumar (según Req 7.7
   * y design.md), por lo que la suma Σ redondearBancario(precio × cantidad) puede
   * diferir de redondearBancario(Σ precio × cantidad) en casos con grandes montos.
   */
  function calcularTotalEsperado(
    lineas: LineaVenta[],
    porcentajeImpuesto: number
  ): number {
    const subtotalesLinea = lineas.map((l) =>
      redondearBancario(l.precio_unitario * l.cantidad)
    )
    const subtotal = subtotalesLinea.reduce((acc, v) => acc + v, 0)
    const impuesto =
      porcentajeImpuesto > 0
        ? redondearBancario((subtotal * porcentajeImpuesto) / 100)
        : 0
    return redondearBancario(subtotal + impuesto)
  }

  it(
    "P18.1 — Sin descuentos (campo ausente), el total coincide con redondearBancario(Σ precio×cantidad + impuesto)",
    () => {
      fc.assert(
        fc.property(
          fc.array(arbLineaSinDescuento, { minLength: 1, maxLength: 30 }),
          arbImpuesto,
          (lineas, porcentajeImpuesto) => {
            const resultado = calcularTotalesVenta(lineas, 0, porcentajeImpuesto)
            const totalEsperado = calcularTotalEsperado(lineas, porcentajeImpuesto)

            // La diferencia debe ser cero (igualdad exacta de números redondeados)
            return Math.abs(resultado.total - totalEsperado) < 1e-9
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P18.2 — Con descuento_producto = 0 explícito, el total coincide con redondearBancario(Σ precio×cantidad + impuesto)",
    () => {
      fc.assert(
        fc.property(
          fc.array(arbLineaDescuentoCero, { minLength: 1, maxLength: 30 }),
          arbImpuesto,
          (lineas, porcentajeImpuesto) => {
            const resultado = calcularTotalesVenta(lineas, 0, porcentajeImpuesto)
            const totalEsperado = calcularTotalEsperado(lineas, porcentajeImpuesto)

            return Math.abs(resultado.total - totalEsperado) < 1e-9
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P18.3 — Mezcla de líneas sin descuento y con descuento_producto = 0: el total es retrocompatible",
    () => {
      fc.assert(
        fc.property(
          arbLineas,
          arbImpuesto,
          (lineas, porcentajeImpuesto) => {
            const resultado = calcularTotalesVenta(lineas, 0, porcentajeImpuesto)
            const totalEsperado = calcularTotalEsperado(lineas, porcentajeImpuesto)

            return Math.abs(resultado.total - totalEsperado) < 1e-9
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P18.4 — Sin descuentos, descuentoTotalAplicado es 0 y baseImponible === subtotal",
    () => {
      fc.assert(
        fc.property(
          arbLineas,
          arbImpuesto,
          (lineas, porcentajeImpuesto) => {
            const resultado = calcularTotalesVenta(lineas, 0, porcentajeImpuesto)

            return (
              resultado.descuentoTotalAplicado === 0 &&
              Math.abs(resultado.baseImponible - resultado.subtotal) < 1e-9
            )
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P18.5 — Sin descuentos y sin impuesto, total === Σ redondearBancario(precio×cantidad)",
    () => {
      fc.assert(
        fc.property(
          arbLineas,
          (lineas) => {
            const resultado = calcularTotalesVenta(lineas, 0, 0)

            // Per-line banker's rounding then sum (matches implementation's formula)
            const totalEsperado = redondearBancario(
              lineas.reduce(
                (acc, l) => acc + redondearBancario(l.precio_unitario * l.cantidad),
                0
              )
            )

            return Math.abs(resultado.total - totalEsperado) < 1e-9
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
