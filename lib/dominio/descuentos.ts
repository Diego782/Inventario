/**
 * lib/dominio/descuentos.ts
 * Módulo puro (sin BD) para el cálculo de totales de venta con descuentos.
 *
 * Reglas de cálculo:
 *  - subtotal de línea = redondearBancario(precio_unitario × cantidad − descuento_producto)
 *    (permite 0, nunca negativo)
 *  - base imponible = Σ subtotales_linea − descuento_total
 *  - impuesto = redondearBancario(base × porcentajeImpuesto / 100)
 *    (cero si porcentajeImpuesto es 0 o no está configurado)
 *  - total = redondearBancario(base + impuesto)
 *
 * Validaciones (lanza DescuentoInvalidoError si):
 *  - algún descuento_producto o descuentoTotal es negativo          (Req 7.6)
 *  - algún descuento_producto excede el subtotal bruto de su línea  (Req 7.4)
 *  - descuentoTotal excede la suma de subtotales de línea           (Req 7.5)
 */

import { redondearBancario } from "@/lib/money"
import { DescuentoInvalidoError } from "@/lib/api/errores"

// Re-exportar para que los consumidores puedan importar desde este módulo.
export { DescuentoInvalidoError }

// ── Tipos ──────────────────────────────────────────────────────────────────

/** Una línea de venta con precio, cantidad y descuento opcional por producto. */
export type LineaVenta = {
  precio_unitario: number
  cantidad: number
  /** Monto a descontar de esta línea. Debe ser ≥ 0 y ≤ subtotal bruto. */
  descuento_producto?: number
}

/** Resultado del cálculo de totales de venta. */
export type ResultadoTotales = {
  /** Subtotal de cada línea ya con descuento de producto y redondeo bancario. */
  subtotalesLinea: number[]
  /** Suma de subtotalesLinea. */
  subtotal: number
  /** Descuento total aplicado sobre la suma de subtotales. */
  descuentoTotalAplicado: number
  /** subtotal − descuentoTotalAplicado. Base sobre la que se calcula el impuesto. */
  baseImponible: number
  /** Impuesto calculado sobre la base imponible con redondeo bancario. */
  impuesto: number
  /** Total final = baseImponible + impuesto, con redondeo bancario. */
  total: number
}

// ── Función principal ──────────────────────────────────────────────────────

/**
 * Calcula los totales de una venta aplicando descuentos por línea y sobre el total.
 *
 * @param lineas             - Líneas de venta con precio, cantidad y descuento opcional.
 * @param descuentoTotal     - Descuento aplicado sobre la suma de subtotales. Debe ser ≥ 0.
 * @param porcentajeImpuesto - Porcentaje de impuesto (0–100). Cero si no está configurado.
 *
 * @throws {DescuentoInvalidoError} Si algún descuento es negativo, un descuento_producto
 *   excede el subtotal bruto de su línea, o el descuentoTotal excede la suma de subtotales.
 *
 * Req 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */
export function calcularTotalesVenta(
  lineas: LineaVenta[],
  descuentoTotal: number,
  porcentajeImpuesto: number
): ResultadoTotales {
  // ── Validar descuentoTotal no negativo (Req 7.6) ────────────────────────
  if (descuentoTotal < 0) {
    throw new DescuentoInvalidoError(
      `El descuento total no puede ser negativo (recibido: ${descuentoTotal})`
    )
  }

  // ── Calcular subtotales por línea ────────────────────────────────────────
  const subtotalesLinea: number[] = []

  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    const descProd = linea.descuento_producto ?? 0

    // Validar descuento_producto no negativo (Req 7.6)
    if (descProd < 0) {
      throw new DescuentoInvalidoError(
        `El descuento de producto en la línea ${i + 1} no puede ser negativo (recibido: ${descProd})`
      )
    }

    // Subtotal bruto de la línea (sin redondeo) para validar el descuento
    const subtotalBruto = linea.precio_unitario * linea.cantidad

    // Validar que descuento_producto no exceda el subtotal bruto (Req 7.4)
    if (descProd > subtotalBruto + 1e-9) {
      throw new DescuentoInvalidoError(
        `El descuento de producto (${descProd}) en la línea ${i + 1} excede el subtotal de la línea (${subtotalBruto})`
      )
    }

    // subtotal de línea = redondearBancario(precio_unitario × cantidad − descuento_producto)
    // Permite 0 cuando descuento_producto === subtotal bruto (Req 7.1)
    const subtotalLinea = redondearBancario(subtotalBruto - descProd)
    subtotalesLinea.push(subtotalLinea)
  }

  // ── Suma de subtotales ───────────────────────────────────────────────────
  const subtotal = subtotalesLinea.reduce((acc, v) => acc + v, 0)

  // ── Validar descuentoTotal no exceda suma de subtotales (Req 7.5) ────────
  if (descuentoTotal > subtotal + 1e-9) {
    throw new DescuentoInvalidoError(
      `El descuento total (${descuentoTotal}) excede la suma de subtotales (${subtotal})`
    )
  }

  // ── Base imponible = Σ subtotales − descuento_total (Req 7.2, 7.3) ──────
  const baseImponible = subtotal - descuentoTotal

  // ── Impuesto sobre la base (cero si no hay impuesto configurado) ─────────
  const impuesto =
    porcentajeImpuesto > 0
      ? redondearBancario((baseImponible * porcentajeImpuesto) / 100)
      : 0

  // ── Total = redondearBancario(base + impuesto) (Req 7.7) ─────────────────
  const total = redondearBancario(baseImponible + impuesto)

  return {
    subtotalesLinea,
    subtotal,
    descuentoTotalAplicado: descuentoTotal,
    baseImponible,
    impuesto,
    total,
  }
}
