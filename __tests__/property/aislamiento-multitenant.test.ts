// Feature: usuarios-y-accesos, Property 12: Invariante de aislamiento multi-inquilino
/**
 * Property 12: Invariante de aislamiento multi-inquilino
 * **Validates: Requirements 13.1, 13.4, 13.5, 13.8**
 *
 * Para todo par de organizaciones distintas (org1, org2):
 * - Ninguna consulta de productos de org1 devuelve registros de org2.
 * - Toda escritura en org1 no afecta los datos de org2.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// --- In-memory state ---
interface InMemoryProducto {
  id: string
  sku: string
  codigo_barras: string
  nombre: string
  organizacion_id: string
  precio_compra: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  unidad: string
  talla: string | null
  activo: boolean
  categoria_id: string | null
  variantes: []
}

let productosDB: Map<string, InMemoryProducto>
let idCounter: number

function newId(): string {
  return `prod-${++idCounter}`
}

// Mock @/lib/db with in-memory state
vi.mock("@/lib/db", () => ({
  prisma: {
    producto: {
      create: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}))

// Mock codigo-barras to avoid EAN-13 generation complexity
vi.mock("@/lib/codigo-barras", () => ({
  generarEan13: vi.fn((_prefix: string) => `200${Math.random().toString().slice(2, 12)}`),
  detectarFormato: vi.fn(() => "EAN-13"),
}))

import { prisma } from "@/lib/db"
import { listarProductos, crearProducto } from "@/lib/dominio/inventario"

describe("Property 12: Invariante de aislamiento multi-inquilino", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productosDB = new Map()
    idCounter = 0

    // prisma.producto.create — inserts into in-memory DB
    vi.mocked(prisma.producto.create).mockImplementation(async ({ data }: any) => {
      const id = newId()
      const producto: InMemoryProducto = {
        id,
        sku: data.sku,
        codigo_barras: data.codigo_barras,
        nombre: data.nombre,
        organizacion_id: data.organizacion_id,
        precio_compra: data.precio_compra ?? 0,
        precio_venta: data.precio_venta,
        stock_actual: data.stock_actual ?? 0,
        stock_minimo: data.stock_minimo ?? 0,
        unidad: data.unidad ?? "unidad",
        talla: data.talla ?? null,
        activo: true,
        categoria_id: data.categoria?.connect?.id ?? null,
        variantes: [],
      }
      productosDB.set(id, producto)
      return producto as any
    })

    // prisma.producto.findMany — filters by organizacion_id
    vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where, take, skip }: any) => {
      const orgId = where?.organizacion_id
      const results = Array.from(productosDB.values()).filter(
        (p) => p.activo && (!orgId || p.organizacion_id === orgId)
      )
      const start = skip ?? 0
      const end = take !== undefined ? start + take : undefined
      return results.slice(start, end) as any
    })

    // prisma.producto.count — counts by organizacion_id
    vi.mocked(prisma.producto.count).mockImplementation(async ({ where }: any) => {
      const orgId = where?.organizacion_id
      return Array.from(productosDB.values()).filter(
        (p) => p.activo && (!orgId || p.organizacion_id === orgId)
      ).length
    })

    // prisma.producto.findFirst — used by generarCodigoUnico
    vi.mocked(prisma.producto.findFirst).mockImplementation(async ({ where }: any) => {
      for (const p of productosDB.values()) {
        if (
          where?.codigo_barras &&
          p.codigo_barras === where.codigo_barras &&
          p.organizacion_id === where.organizacion_id
        ) {
          return p as any
        }
      }
      return null
    })
  })

  it("P12.1 — listarProductos(org1) nunca devuelve productos de org2", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            orgId1: fc.uuid(),
            orgId2: fc.uuid(),
          })
          .filter(({ orgId1, orgId2 }) => orgId1 !== orgId2),
        fc.array(
          fc.record({
            nombre: fc.string({ minLength: 1, maxLength: 50 }),
            sku: fc.string({ minLength: 1, maxLength: 20 }),
            precio_venta: fc.float({ min: Math.fround(0.01), max: Math.fround(9999), noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        fc.array(
          fc.record({
            nombre: fc.string({ minLength: 1, maxLength: 50 }),
            sku: fc.string({ minLength: 1, maxLength: 20 }),
            precio_venta: fc.float({ min: Math.fround(0.01), max: Math.fround(9999), noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async ({ orgId1, orgId2 }, productosOrg1, productosOrg2) => {
          // Reset state for each run
          productosDB.clear()
          idCounter = 0

          // Seed products for org1
          for (const p of productosOrg1) {
            await crearProducto(
              { sku: `${p.sku}-o1`, nombre: p.nombre, precio_venta: p.precio_venta },
              orgId1
            )
          }

          // Seed products for org2
          for (const p of productosOrg2) {
            await crearProducto(
              { sku: `${p.sku}-o2`, nombre: p.nombre, precio_venta: p.precio_venta },
              orgId2
            )
          }

          // Query products for org1
          const { items } = await listarProductos({ organizacion_id: orgId1, take: 100 })

          // All returned products must belong to org1
          const allBelongToOrg1 = items.every((p: any) => p.organizacion_id === orgId1)
          expect(allBelongToOrg1).toBe(true)

          // No product from org2 should appear
          const noOrg2Products = items.every((p: any) => p.organizacion_id !== orgId2)
          expect(noOrg2Products).toBe(true)

          // Count must match only org1 products
          const { total } = await listarProductos({ organizacion_id: orgId1, take: 100 })
          expect(total).toBe(productosOrg1.length)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P12.2 — crearProducto(input, org1) crea el producto solo en el namespace de org1, sin afectar org2", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            orgId1: fc.uuid(),
            orgId2: fc.uuid(),
          })
          .filter(({ orgId1, orgId2 }) => orgId1 !== orgId2),
        fc.record({
          nombre: fc.string({ minLength: 1, maxLength: 50 }),
          sku: fc.string({ minLength: 1, maxLength: 20 }),
          precio_venta: fc.float({ min: Math.fround(0.01), max: Math.fround(9999), noNaN: true }),
        }),
        fc.array(
          fc.record({
            nombre: fc.string({ minLength: 1, maxLength: 50 }),
            sku: fc.string({ minLength: 1, maxLength: 20 }),
            precio_venta: fc.float({ min: Math.fround(0.01), max: Math.fround(9999), noNaN: true }),
          }),
          { minLength: 0, maxLength: 3 }
        ),
        async ({ orgId1, orgId2 }, nuevoProducto, productosOrg2Previos) => {
          // Reset state for each run
          productosDB.clear()
          idCounter = 0

          // Seed some products for org2 before the write
          for (const p of productosOrg2Previos) {
            await crearProducto(
              { sku: `${p.sku}-o2`, nombre: p.nombre, precio_venta: p.precio_venta },
              orgId2
            )
          }

          const org2CountBefore = (await listarProductos({ organizacion_id: orgId2, take: 100 })).total

          // Create a product in org1
          const created = await crearProducto(
            { sku: nuevoProducto.sku, nombre: nuevoProducto.nombre, precio_venta: nuevoProducto.precio_venta },
            orgId1
          )

          // The created product must belong to org1
          expect((created as any).organizacion_id).toBe(orgId1)

          // org2 count must remain unchanged
          const org2CountAfter = (await listarProductos({ organizacion_id: orgId2, take: 100 })).total
          expect(org2CountAfter).toBe(org2CountBefore)

          // The new product must NOT appear in org2's listing
          const { items: org2Items } = await listarProductos({ organizacion_id: orgId2, take: 100 })
          const newProductInOrg2 = org2Items.some((p: any) => p.id === (created as any).id)
          expect(newProductInOrg2).toBe(false)

          // The new product MUST appear in org1's listing
          const { items: org1Items } = await listarProductos({ organizacion_id: orgId1, take: 100 })
          const newProductInOrg1 = org1Items.some((p: any) => p.id === (created as any).id)
          expect(newProductInOrg1).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P12.3 — Consultas cruzadas: listarProductos(org2) nunca incluye productos creados en org1", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            orgId1: fc.uuid(),
            orgId2: fc.uuid(),
          })
          .filter(({ orgId1, orgId2 }) => orgId1 !== orgId2),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 5 }),
        async ({ orgId1, orgId2 }, countOrg1, countOrg2) => {
          // Reset state for each run
          productosDB.clear()
          idCounter = 0

          // Create products for org1
          for (let i = 0; i < countOrg1; i++) {
            await crearProducto(
              { sku: `sku-org1-${i}`, nombre: `Producto Org1 ${i}`, precio_venta: 10 + i },
              orgId1
            )
          }

          // Create products for org2
          for (let i = 0; i < countOrg2; i++) {
            await crearProducto(
              { sku: `sku-org2-${i}`, nombre: `Producto Org2 ${i}`, precio_venta: 20 + i },
              orgId2
            )
          }

          // Query org2 — must only see its own products
          const { items: itemsOrg2, total: totalOrg2 } = await listarProductos({
            organizacion_id: orgId2,
            take: 100,
          })

          expect(totalOrg2).toBe(countOrg2)
          expect(itemsOrg2).toHaveLength(countOrg2)

          const allOrg2 = itemsOrg2.every((p: any) => p.organizacion_id === orgId2)
          expect(allOrg2).toBe(true)

          const noOrg1InOrg2 = itemsOrg2.every((p: any) => p.organizacion_id !== orgId1)
          expect(noOrg1InOrg2).toBe(true)

          // Query org1 — must only see its own products
          const { items: itemsOrg1, total: totalOrg1 } = await listarProductos({
            organizacion_id: orgId1,
            take: 100,
          })

          expect(totalOrg1).toBe(countOrg1)
          expect(itemsOrg1).toHaveLength(countOrg1)

          const allOrg1 = itemsOrg1.every((p: any) => p.organizacion_id === orgId1)
          expect(allOrg1).toBe(true)

          const noOrg2InOrg1 = itemsOrg1.every((p: any) => p.organizacion_id !== orgId2)
          expect(noOrg2InOrg1).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })
})
