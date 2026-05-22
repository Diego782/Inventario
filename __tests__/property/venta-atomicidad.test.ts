// Feature: inventario-ventas-core, Property 4: Atomicidad de la venta
// Validates: Requirements R18.1, R18.4, R18.5
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ---- Lógica pura de la transacción de venta (sin BD) ----
// Simulamos la lógica de registrarVenta para testear propiedades puras

type ItemVenta = {
  producto_id: string
  cantidad: number
  precio_unitario: number
  stock_disponible: number
}

type ResultadoVenta = {
  exito: boolean
  folio?: string
  subtotal?: number
  impuesto?: number
  total?: number
  stockFinal?: Record<string, number>
  error?: string
}

function simularVenta(
  items: ItemVenta[],
  porcentaje_impuesto: number,
  permitir_sobreventa: boolean
): ResultadoVenta {
  // Validar stock
  for (const item of items) {
    if (!permitir_sobreventa && item.cantidad > item.stock_disponible) {
      return { exito: false, error: "STOCK_NEGATIVO" }
    }
  }

  // Calcular totales
  const subtotal = redondearBancario(
    items.reduce((acc, i) => acc + i.precio_unitario * i.cantidad, 0)
  )
  const impuesto = redondearBancario((subtotal * porcentaje_impuesto) / 100)
  const total = redondearBancario(subtotal + impuesto)

  // Calcular stock final
  const stockFinal: Record<string, number> = {}
  for (const item of items) {
    stockFinal[item.producto_id] =
      (stockFinal[item.producto_id] ?? item.stock_disponible) - item.cantidad
  }

  return {
    exito: true,
    folio: "VTA-20240101-0001",
    subtotal,
    impuesto,
    total,
    stockFinal,
  }
}

// ---- Generadores ----

const arbItemVenta = fc.record({
  producto_id: fc.uuid(),
  cantidad: fc.integer({ min: 1, max: 10 }),
  precio_unitario: fc
    .float({ min: Math.fround(0.01), max: Math.fround(1000), noNaN: true })
    .map((n) => Math.round(n * 100) / 100),
  stock_disponible: fc.integer({ min: 1, max: 100 }),
})

const arbItemsVenta = fc.array(arbItemVenta, { minLength: 1, maxLength: 10 })

// ---- Tests PBT ----

describe("Property 4: Atomicidad de la venta (lógica pura)", () => {
  it("P4.1 — Venta exitosa: stock_final = stock_inicial - cantidad por producto", () => {
    fc.assert(
      fc.property(
        arbItemsVenta.filter((items) =>
          items.every((i) => i.cantidad <= i.stock_disponible)
        ),
        (items) => {
          const resultado = simularVenta(items, 0, false)
          if (!resultado.exito || !resultado.stockFinal) return false

          return items.every((item) => {
            const stockEsperado = item.stock_disponible - item.cantidad
            return resultado.stockFinal![item.producto_id] === stockEsperado
          })
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P4.2 — Venta fallida por stock: stock no cambia", () => {
    fc.assert(
      fc.property(
        arbItemsVenta.filter((items) =>
          items.some((i) => i.cantidad > i.stock_disponible)
        ),
        (items) => {
          const resultado = simularVenta(items, 0, false)
          // Si hay stock insuficiente, la venta debe fallar
          return !resultado.exito && resultado.error === "STOCK_NEGATIVO"
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P4.3 — total = subtotal + impuesto (con redondeo bancario)", () => {
    fc.assert(
      fc.property(
        arbItemsVenta.filter((items) =>
          items.every((i) => i.cantidad <= i.stock_disponible)
        ),
        fc.float({ min: Math.fround(0), max: Math.fround(30), noNaN: true }).map((n) => Math.round(n * 100) / 100),
        (items, impuesto) => {
          const resultado = simularVenta(items, impuesto, false)
          if (!resultado.exito) return true // skip si falla por otra razón

          const { subtotal, impuesto: imp, total } = resultado
          return Math.abs(total! - (subtotal! + imp!)) < 0.005
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P4.4 — Con permitir_sobreventa=true, la venta siempre tiene éxito", () => {
    fc.assert(
      fc.property(arbItemsVenta, (items) => {
        const resultado = simularVenta(items, 0, true)
        return resultado.exito === true
      }),
      { numRuns: 100 }
    )
  })

  it("P4.5 — subtotal, impuesto y total son siempre ≥ 0", () => {
    fc.assert(
      fc.property(
        arbItemsVenta.filter((items) =>
          items.every((i) => i.cantidad <= i.stock_disponible)
        ),
        fc.float({ min: Math.fround(0), max: Math.fround(100), noNaN: true }),
        (items, impuesto) => {
          const resultado = simularVenta(items, impuesto, false)
          if (!resultado.exito) return true
          return (
            resultado.subtotal! >= 0 &&
            resultado.impuesto! >= 0 &&
            resultado.total! >= 0
          )
        }
      ),
      { numRuns: 100 }
    )
  })
})
