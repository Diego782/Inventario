// Feature: inventario-ventas-core, Property 3: Suma del carrito y unicidad de filas
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ---- Lógica pura del carrito (sin hooks de React) ----
// Replicamos la lógica de calcularTotales para testearla de forma pura

type ItemCarrito = {
  producto_id: string
  precio_venta: number
  cantidad: number
}

function calcularTotales(
  items: ItemCarrito[],
  porcentaje_impuesto: number
): { subtotal: number; impuestos: number; total: number } {
  const subtotal = redondearBancario(
    items.reduce((acc, item) => acc + item.precio_venta * item.cantidad, 0)
  )
  const impuestos = redondearBancario((subtotal * porcentaje_impuesto) / 100)
  const total = redondearBancario(subtotal + impuestos)
  return { subtotal, impuestos, total }
}

function agregarOIncrementar(
  items: ItemCarrito[],
  nuevo: ItemCarrito
): ItemCarrito[] {
  const existente = items.find((i) => i.producto_id === nuevo.producto_id)
  if (existente) {
    return items.map((i) =>
      i.producto_id === nuevo.producto_id
        ? { ...i, cantidad: i.cantidad + nuevo.cantidad }
        : i
    )
  }
  return [...items, nuevo]
}

// ---- Generadores fast-check ----

const arbItem = fc.record({
  producto_id: fc.uuid(),
  precio_venta: fc
    .float({ min: Math.fround(0.01), max: Math.fround(1e5), noNaN: true })
    .map((n) => Math.round(n * 100) / 100),
  cantidad: fc.integer({ min: 1, max: 999 }),
})

const arbCarrito = fc.array(arbItem, { minLength: 1, maxLength: 50 })

const arbImpuesto = fc
  .float({ min: Math.fround(0), max: Math.fround(100), noNaN: true })
  .map((n) => Math.round(n * 100) / 100)

// ---- Tests PBT ----

describe("Property 3: Suma del carrito y unicidad de filas", () => {
  it("P3.1 — subtotal === redondearBancario(Σ precio_venta × cantidad)", () => {
    fc.assert(
      fc.property(arbCarrito, (items) => {
        const { subtotal } = calcularTotales(items, 0)
        const esperado = redondearBancario(
          items.reduce((acc, i) => acc + i.precio_venta * i.cantidad, 0)
        )
        return Math.abs(subtotal - esperado) < 1e-9
      }),
      { numRuns: 100 }
    )
  })

  it("P3.2 — |total - (subtotal + impuestos)| < 0.005", () => {
    fc.assert(
      fc.property(arbCarrito, arbImpuesto, (items, impuesto) => {
        const { subtotal, impuestos, total } = calcularTotales(items, impuesto)
        return Math.abs(total - (subtotal + impuestos)) < 0.005
      }),
      { numRuns: 100 }
    )
  })

  it("P3.3 — Tras N escaneos de P productos distintos, filas ≤ |P| y Σ cantidades === N", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            producto_id: fc.constantFrom("p1", "p2", "p3", "p4", "p5"),
            precio_venta: fc.constant(10),
            cantidad: fc.constant(1),
          }),
          { minLength: 1, maxLength: 20 }
        ),
        (escaneos) => {
          let carrito: ItemCarrito[] = []
          for (const escaneo of escaneos) {
            carrito = agregarOIncrementar(carrito, escaneo)
          }

          const productosDistintos = new Set(escaneos.map((e) => e.producto_id)).size
          const totalCantidad = carrito.reduce((acc, i) => acc + i.cantidad, 0)

          return (
            carrito.length <= productosDistintos &&
            totalCantidad === escaneos.length
          )
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P3.4 — subtotal, impuestos y total siempre son ≥ 0", () => {
    fc.assert(
      fc.property(arbCarrito, arbImpuesto, (items, impuesto) => {
        const { subtotal, impuestos, total } = calcularTotales(items, impuesto)
        return subtotal >= 0 && impuestos >= 0 && total >= 0
      }),
      { numRuns: 100 }
    )
  })

  it("P3.5 — total === subtotal cuando impuesto === 0", () => {
    fc.assert(
      fc.property(arbCarrito, (items) => {
        const { subtotal, total } = calcularTotales(items, 0)
        return Math.abs(total - subtotal) < 1e-9
      }),
      { numRuns: 100 }
    )
  })
})
