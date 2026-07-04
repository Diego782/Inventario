// Feature: gestion-clientes-y-fiadores, Property 24: Filtro por rango de stock e igualdad de estado crítico
/**
 * Property 24: Filtro por rango de stock e igualdad de estado crítico
 * **Validates: Requirements 10.1, 10.3, 10.4, 10.5**
 *
 * Para todo catálogo y rango de stock, el resultado del filtro de rango contiene
 * exactamente los productos del tenant cuyo `stock_actual` está dentro del rango
 * (inclusivo, con mínimo y/o máximo opcionales); y el resultado del filtro
 * "solo stock crítico" contiene exactamente los productos del tenant cuyo
 * Estado_Stock es "Crítico" según la definición del glosario
 * (stock_actual = 0 OR stock_actual <= stock_minimo × 0.3).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryProducto {
  id: string
  organizacion_id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
  precio_compra: number
  precio_venta: number
  activo: boolean
  variantes: Array<{ id: string; talla: string; stock_actual: number }>
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let productosDB: Map<string, InMemoryProducto>
let idCounter: number

function newId(): string {
  return `prod-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    producto: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

vi.mock("@/lib/codigo-barras", () => ({
  generarEan13: vi.fn(() => `200${Math.random().toString().slice(2, 12)}`),
  detectarFormato: vi.fn(() => "EAN-13"),
}))

vi.mock("@/lib/dominio/notificaciones", () => ({
  detectarStockCritico: vi.fn(),
  estadoStock: vi.fn(() => "En Stock"),
}))

import { prisma } from "@/lib/db"
import { listarProductos } from "@/lib/dominio/inventario"

// ── Domain helper (mirrors glosario definition) ─────────────────────────────

/**
 * Mirrors `esCritico` from inventario.ts and the Estado_Stock glosario definition:
 * Crítico when stock_actual = 0 OR stock_actual <= stock_minimo × 0.3.
 */
function esCritico(stock_actual: number, stock_minimo: number): boolean {
  return stock_actual === 0 || stock_actual <= stock_minimo * 0.3
}

// ── Generators ───────────────────────────────────────────────────────────────

/** stock_actual: entero 0–1000 */
const arbStockActual = fc.integer({ min: 0, max: 1000 })

/** stock_minimo: entero 0–500 */
const arbStockMinimo = fc.integer({ min: 0, max: 500 })

/** Genera un producto en memoria */
const arbProducto = fc.record({
  stock_actual: arbStockActual,
  stock_minimo: arbStockMinimo,
})

/** Catálogo: 0–12 productos */
const arbCatalogo = fc.array(arbProducto, { minLength: 0, maxLength: 12 })

/**
 * Genera un rango de stock [min?, max?] donde:
 * - ambos son opcionales independientemente
 * - cuando ambos están presentes, min <= max (Req 10.3)
 * - valores en [0, 999]
 */
const arbRangoStock = fc.tuple(
  fc.option(fc.integer({ min: 0, max: 999 }), { nil: undefined }),
  fc.option(fc.integer({ min: 0, max: 999 }), { nil: undefined })
).filter(([min, max]) => {
  // If both present, ensure min <= max (valid range)
  if (min !== undefined && max !== undefined) return min <= max
  return true
})

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  productosDB = new Map()
  idCounter = 0

  /**
   * prisma.producto.findMany — replicates the listarProductos query logic:
   * - filters by organizacion_id and activo: true
   * - applies stock_actual range (gte/lte) when present
   * - for solo_critico the domain does a post-filter in memory; we return all
   *   matching products so the domain layer can post-filter itself
   */
  vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where, take, skip }: any) => {
    const orgId: string | undefined = where?.organizacion_id

    let results = Array.from(productosDB.values()).filter(
      (p) => p.activo && (orgId === undefined || p.organizacion_id === orgId)
    )

    // Apply stock_actual range filter
    if (where?.stock_actual) {
      const { gte, lte } = where.stock_actual
      if (gte !== undefined) results = results.filter((p) => p.stock_actual >= gte)
      if (lte !== undefined) results = results.filter((p) => p.stock_actual <= lte)
    }

    // Pagination (only applied when take is present — solo_critico path skips pagination)
    const start = skip ?? 0
    const end = take !== undefined ? start + take : undefined
    const paginated = end !== undefined ? results.slice(start, end) : results

    return paginated as any
  })

  /**
   * prisma.producto.count — mirrors findMany without pagination
   */
  vi.mocked(prisma.producto.count).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id

    let results = Array.from(productosDB.values()).filter(
      (p) => p.activo && (orgId === undefined || p.organizacion_id === orgId)
    )

    if (where?.stock_actual) {
      const { gte, lte } = where.stock_actual
      if (gte !== undefined) results = results.filter((p) => p.stock_actual >= gte)
      if (lte !== undefined) results = results.filter((p) => p.stock_actual <= lte)
    }

    return results.length
  })
})

// ── Helper: seed catalog ──────────────────────────────────────────────────────

function sembrarCatalogo(
  catalog: Array<{ stock_actual: number; stock_minimo: number }>,
  orgId: string
): InMemoryProducto[] {
  return catalog.map((entry) => {
    const id = newId()
    const producto: InMemoryProducto = {
      id,
      organizacion_id: orgId,
      nombre: `Producto-${id}`,
      stock_actual: entry.stock_actual,
      stock_minimo: entry.stock_minimo,
      precio_compra: 10,
      precio_venta: 20,
      activo: true,
      variantes: [],
    }
    productosDB.set(id, producto)
    return producto
  })
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Property 24: Filtro por rango de stock e igualdad de estado crítico", () => {
  it(
    "P24.1 — Rango con mínimo y máximo: resultado contiene exactamente los productos con stock_actual en [min, max] (Req 10.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          // Both min and max present, min <= max
          fc.integer({ min: 0, max: 800 }),
          fc.integer({ min: 0, max: 200 }).map((offset) => offset), // will be added to min
          async (orgId, catalog, stockMin, offset) => {
            const stockMax = stockMin + offset
            productosDB.clear()
            idCounter = 0

            const productos = sembrarCatalogo(catalog, orgId)

            // Expected: products with stock_actual in [stockMin, stockMax]
            const expectedIds = new Set(
              productos
                .filter((p) => p.stock_actual >= stockMin && p.stock_actual <= stockMax)
                .map((p) => p.id)
            )

            const { items } = await listarProductos({
              organizacion_id: orgId,
              stock_min: stockMin,
              stock_max: stockMax,
              take: 1000,
            })

            const returnedIds = new Set(items.map((p: any) => p.id))

            expect(returnedIds).toEqual(expectedIds)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P24.2 — Rango solo con mínimo: resultado contiene exactamente los productos con stock_actual >= min (Req 10.4)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          fc.integer({ min: 0, max: 999 }),
          async (orgId, catalog, stockMin) => {
            productosDB.clear()
            idCounter = 0

            const productos = sembrarCatalogo(catalog, orgId)

            const expectedIds = new Set(
              productos
                .filter((p) => p.stock_actual >= stockMin)
                .map((p) => p.id)
            )

            const { items } = await listarProductos({
              organizacion_id: orgId,
              stock_min: stockMin,
              take: 1000,
            })

            const returnedIds = new Set(items.map((p: any) => p.id))

            expect(returnedIds).toEqual(expectedIds)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P24.3 — Rango solo con máximo: resultado contiene exactamente los productos con stock_actual <= max (Req 10.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          fc.integer({ min: 0, max: 999 }),
          async (orgId, catalog, stockMax) => {
            productosDB.clear()
            idCounter = 0

            const productos = sembrarCatalogo(catalog, orgId)

            const expectedIds = new Set(
              productos
                .filter((p) => p.stock_actual <= stockMax)
                .map((p) => p.id)
            )

            const { items } = await listarProductos({
              organizacion_id: orgId,
              stock_max: stockMax,
              take: 1000,
            })

            const returnedIds = new Set(items.map((p: any) => p.id))

            expect(returnedIds).toEqual(expectedIds)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P24.4 — Solo stock crítico: resultado contiene exactamente los productos con Estado_Stock = 'Crítico' (Req 10.1)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            const productos = sembrarCatalogo(catalog, orgId)

            // Expected: only products where esCritico(stock_actual, stock_minimo) is true
            const expectedIds = new Set(
              productos
                .filter((p) => esCritico(p.stock_actual, p.stock_minimo))
                .map((p) => p.id)
            )

            const { items } = await listarProductos({
              organizacion_id: orgId,
              solo_critico: true,
              take: 1000,
            })

            const returnedIds = new Set(items.map((p: any) => p.id))

            expect(returnedIds).toEqual(expectedIds)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P24.5 — Filtros con rango arbitrario [min?, max?] devuelven el conjunto exacto (Req 10.3, 10.4, 10.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          arbRangoStock,
          async (orgId, catalog, [stockMin, stockMax]) => {
            productosDB.clear()
            idCounter = 0

            const productos = sembrarCatalogo(catalog, orgId)

            // Expected based on whichever bounds are present
            const expectedIds = new Set(
              productos
                .filter((p) => {
                  const aboveMin = stockMin === undefined || p.stock_actual >= stockMin
                  const belowMax = stockMax === undefined || p.stock_actual <= stockMax
                  return aboveMin && belowMax
                })
                .map((p) => p.id)
            )

            const { items } = await listarProductos({
              organizacion_id: orgId,
              ...(stockMin !== undefined ? { stock_min: stockMin } : {}),
              ...(stockMax !== undefined ? { stock_max: stockMax } : {}),
              take: 1000,
            })

            const returnedIds = new Set(items.map((p: any) => p.id))

            expect(returnedIds).toEqual(expectedIds)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P24.6 — Productos de otros tenants nunca aparecen en el resultado de rango de stock (Req 10.10)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(arbProducto, { minLength: 1, maxLength: 6 }),
          fc.array(arbProducto, { minLength: 1, maxLength: 6 }),
          fc.integer({ min: 0, max: 500 }),
          async (orgA, orgB, catalogA, catalogB, stockMin) => {
            fc.pre(orgA !== orgB)
            productosDB.clear()
            idCounter = 0

            sembrarCatalogo(catalogA, orgA)
            sembrarCatalogo(catalogB, orgB)

            const { items } = await listarProductos({
              organizacion_id: orgA,
              stock_min: stockMin,
              take: 1000,
            })

            // All returned products must belong to orgA
            const allBelongToOrgA = items.every((p: any) => p.organizacion_id === orgA)
            expect(allBelongToOrgA).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P24.7 — Productos de otros tenants nunca aparecen en el resultado de solo_critico (Req 10.10)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(arbProducto, { minLength: 1, maxLength: 6 }),
          fc.array(arbProducto, { minLength: 1, maxLength: 6 }),
          async (orgA, orgB, catalogA, catalogB) => {
            fc.pre(orgA !== orgB)
            productosDB.clear()
            idCounter = 0

            sembrarCatalogo(catalogA, orgA)
            sembrarCatalogo(catalogB, orgB)

            const { items } = await listarProductos({
              organizacion_id: orgA,
              solo_critico: true,
              take: 1000,
            })

            // All returned products must belong to orgA
            const allBelongToOrgA = items.every((p: any) => p.organizacion_id === orgA)
            expect(allBelongToOrgA).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
