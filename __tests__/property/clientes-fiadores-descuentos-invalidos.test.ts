// Feature: gestion-clientes-y-fiadores, Property 17: Descuentos inválidos se rechazan
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  calcularTotalesVenta,
  DescuentoInvalidoError,
  type LineaVenta,
} from "@/lib/dominio/descuentos"

// ── Generadores auxiliares ────────────────────────────────────────────────

/** Precio unitario positivo con hasta 2 decimales (0.01 – 10_000). */
const arbPrecioUnitario = fc
  .integer({ min: 1, max: 1_000_000 })
  .map((n) => n / 100)

/** Cantidad entera entre 1 y 999. */
const arbCantidad = fc.integer({ min: 1, max: 999 })

/** Porcentaje de impuesto entre 0 y 30. */
const arbImpuesto = fc
  .integer({ min: 0, max: 3000 })
  .map((n) => n / 100)

/**
 * Genera una línea de venta con un descuento_producto *válido*:
 * 0 ≤ descuento_producto ≤ subtotal_bruto.
 */
const arbLineaValida: fc.Arbitrary<LineaVenta> = fc
  .tuple(arbPrecioUnitario, arbCantidad)
  .chain(([precio_unitario, cantidad]) => {
    const subtotalBruto = precio_unitario * cantidad
    // Descuento en centavos para evitar problemas de punto flotante
    return fc
      .integer({ min: 0, max: Math.floor(subtotalBruto * 100) })
      .map((centavos) => ({
        precio_unitario,
        cantidad,
        descuento_producto: centavos / 100,
      }))
  })

/** Un arreglo no vacío de líneas válidas. */
const arbLineasValidas = fc.array(arbLineaValida, {
  minLength: 1,
  maxLength: 20,
})

// ── Generadores de casos INVÁLIDOS ────────────────────────────────────────

/**
 * Caso 1 — descuento_producto negativo en al menos una línea.
 * Genera líneas válidas, elige una al azar y le asigna un descuento < 0.
 */
const arbLineasConDescuentoProductoNegativo = fc
  .tuple(
    arbLineasValidas,
    fc.integer({ min: 1, max: 10_000 }).map((n) => -(n / 100)) // negativo
  )
  .chain(([lineas, descNeg]) =>
    fc
      .integer({ min: 0, max: lineas.length - 1 })
      .map((idx) => {
        const copia = lineas.map((l) => ({ ...l }))
        copia[idx] = { ...copia[idx], descuento_producto: descNeg }
        return copia
      })
  )

/**
 * Caso 2 — descuento_producto excede el subtotal de su línea.
 * Para la línea elegida asigna descuento_producto = subtotal_bruto + epsilon.
 */
const arbLineasConDescuentoProductoExcesivo = fc
  .tuple(arbLineasValidas)
  .chain(([lineas]) =>
    fc
      .integer({ min: 0, max: lineas.length - 1 })
      .chain((idx) => {
        const linea = lineas[idx]
        const subtotalBruto = linea.precio_unitario * linea.cantidad
        // Exceso en centavos: 1 – 10_000 centavos sobre el subtotal
        return fc
          .integer({ min: 1, max: 10_000 })
          .map((excesoCentavos) => {
            const copia = lineas.map((l) => ({ ...l }))
            copia[idx] = {
              ...copia[idx],
              descuento_producto: subtotalBruto + excesoCentavos / 100,
            }
            return copia
          })
      })
  )

/**
 * Caso 3 — descuentoTotal negativo (las líneas son todas válidas).
 */
const arbDescuentoTotalNegativo = fc
  .tuple(
    arbLineasValidas,
    fc.integer({ min: 1, max: 10_000 }).map((n) => -(n / 100))
  )

/**
 * Caso 4 — descuentoTotal excede la suma de subtotales de línea.
 * La suma de subtotales se calcula y se pasa un descuentoTotal mayor.
 */
const arbDescuentoTotalExcesivo = arbLineasValidas.chain((lineas) => {
  // Calcula la suma de subtotalesLinea de las líneas válidas
  // (redondeo bancario por línea, igual que hace la función)
  const sumaSubtotales = lineas.reduce((acc, l) => {
    const subtotalBruto = l.precio_unitario * l.cantidad
    const descProd = l.descuento_producto ?? 0
    // redondeo bancario manual aproximado (suficiente para generar el exceso)
    const subtotalLinea = Math.round((subtotalBruto - descProd) * 100) / 100
    return acc + subtotalLinea
  }, 0)

  // Exceso: al menos 1 centavo sobre la suma de subtotales
  return fc
    .integer({ min: 1, max: 10_000 })
    .map((excesoCentavos) => ({
      lineas,
      descuentoTotal: sumaSubtotales + excesoCentavos / 100,
    }))
})

// ── Tests de Property 17 ──────────────────────────────────────────────────

describe("Property 17: Descuentos inválidos se rechazan", () => {
  it(
    "P17.1 — descuento_producto negativo lanza DescuentoInvalidoError sin aplicar descuentos",
    () => {
      fc.assert(
        fc.property(
          arbLineasConDescuentoProductoNegativo,
          arbImpuesto,
          (lineas, impuesto) => {
            expect(() =>
              calcularTotalesVenta(lineas, 0, impuesto)
            ).toThrow(DescuentoInvalidoError)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P17.2 — descuento_producto excede el subtotal de su línea lanza DescuentoInvalidoError",
    () => {
      fc.assert(
        fc.property(
          arbLineasConDescuentoProductoExcesivo,
          arbImpuesto,
          (lineas, impuesto) => {
            expect(() =>
              calcularTotalesVenta(lineas, 0, impuesto)
            ).toThrow(DescuentoInvalidoError)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P17.3 — descuentoTotal negativo lanza DescuentoInvalidoError",
    () => {
      fc.assert(
        fc.property(
          arbDescuentoTotalNegativo,
          arbImpuesto,
          ([lineas, descuentoTotal], impuesto) => {
            expect(() =>
              calcularTotalesVenta(lineas, descuentoTotal, impuesto)
            ).toThrow(DescuentoInvalidoError)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P17.4 — descuentoTotal excede la suma de subtotales lanza DescuentoInvalidoError",
    () => {
      fc.assert(
        fc.property(
          arbDescuentoTotalExcesivo,
          arbImpuesto,
          ({ lineas, descuentoTotal }, impuesto) => {
            expect(() =>
              calcularTotalesVenta(lineas, descuentoTotal, impuesto)
            ).toThrow(DescuentoInvalidoError)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P17.5 — en cualquier caso inválido, la función no devuelve un resultado parcial",
    () => {
      // Combina los cuatro tipos de casos inválidos en un único generador
      const arbCasoInvalido = fc.oneof(
        // Caso A: descuento_producto negativo
        arbLineasConDescuentoProductoNegativo.map((lineas) => ({
          lineas,
          descuentoTotal: 0,
        })),
        // Caso B: descuento_producto excesivo
        arbLineasConDescuentoProductoExcesivo.map((lineas) => ({
          lineas,
          descuentoTotal: 0,
        })),
        // Caso C: descuentoTotal negativo
        arbDescuentoTotalNegativo.map(([lineas, descuentoTotal]) => ({
          lineas,
          descuentoTotal,
        })),
        // Caso D: descuentoTotal excesivo
        arbDescuentoTotalExcesivo
      )

      fc.assert(
        fc.property(arbCasoInvalido, arbImpuesto, ({ lineas, descuentoTotal }, impuesto) => {
          let resultado: unknown
          let lanzado: unknown

          try {
            resultado = calcularTotalesVenta(lineas, descuentoTotal, impuesto)
          } catch (e) {
            lanzado = e
          }

          // Debe lanzar (nunca devolver)
          expect(lanzado).toBeInstanceOf(DescuentoInvalidoError)
          expect(resultado).toBeUndefined()
        }),
        { numRuns: 100 }
      )
    }
  )
})
