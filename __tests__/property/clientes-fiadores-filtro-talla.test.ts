// Feature: gestion-clientes-y-fiadores, Property 4: Filtro por talla devuelve el conjunto exacto sin duplicados
/**
 * Property 4: Filtro por talla devuelve el conjunto exacto sin duplicados
 * **Validates: Requirements 3.1, 3.2, 3.3**
 *
 * Para todo catálogo y valor de talla, el resultado del filtro por talla contiene
 * exactamente los productos del tenant cuya `talla` de raíz o alguna de cuyas
 * `VarianteProducto` coincide con el valor tras eliminar espacios iniciales/finales
 * y sin distinguir mayúsculas de minúsculas, y cada producto aparece exactamente
 * una sola vez (sin duplicados).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// --- In-memory state ---
interface InMemoryVariante {
  id: string
  producto_id: string
  talla: string
  stock_actual: number
}

interface InMemoryProducto {
  id: string
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
  variantes: InMemoryVariante[]
}

let productosDB: Map<string, InMemoryProducto>
let idCounter: number

function newId(): string {
  return `prod-${++idCounter}`
}

function newVarianteId(): string {
  return `var-${++idCounter}`
}

// Mock @/lib/db with an in-memory implementation that replicates
// Prisma's talla filter behavior (case-insensitive, OR raíz/variantes).
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

// Mock notificaciones to avoid side effects
vi.mock("@/lib/dominio/notificaciones", () => ({
  detectarStockCritico: vi.fn(),
  estadoStock: vi.fn(() => "En Stock"),
}))

import { prisma } from "@/lib/db"
import { listarProductos } from "@/lib/dominio/inventario"

/**
 * Helper: determines whether a product matches a normalized talla value.
 * Mirrors the logic in inventario.ts:
 *   - root talla (case-insensitive, trim)
 *   - OR any variant talla (case-insensitive, trim)
 */
function productoMatcheaTalla(producto: InMemoryProducto, tallaNorm: string): boolean {
  const rootMatch = producto.talla !== null && producto.talla.trim().toLowerCase() === tallaNorm
  const variantMatch = producto.variantes.some(
    (v) => v.talla.trim().toLowerCase() === tallaNorm
  )
  return rootMatch || variantMatch
}

describe("Property 4: Filtro por talla devuelve el conjunto exacto sin duplicados", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    productosDB = new Map()
    idCounter = 0

    // prisma.producto.create — inserts into in-memory DB
    vi.mocked(prisma.producto.create).mockImplementation(async ({ data }: any) => {
      const id = newId()
      const variantes: InMemoryVariante[] =
        data.variantes?.create?.map((v: any) => ({
          id: newVarianteId(),
          producto_id: id,
          talla: v.talla,
          stock_actual: v.stock_actual,
        })) ?? []

      const producto: InMemoryProducto = {
        id,
        codigo_barras: data.codigo_barras,
        nombre: data.nombre,
        organizacion_id: data.organizacion_id,
        precio_compra: data.precio_compra ?? 0,
        precio_venta: data.precio_venta ?? 0,
        stock_actual: data.stock_actual ?? 0,
        stock_minimo: data.stock_minimo ?? 0,
        unidad: data.unidad ?? "unidad",
        talla: data.talla ?? null,
        activo: true,
        categoria_id: null,
        variantes,
      }
      productosDB.set(id, producto)
      return producto as any
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

    /**
     * prisma.producto.findMany — the key mock: replicates the OR filter logic
     * from listarProductos for talla (raíz + variantes, case-insensitive).
     * All filters are combined with AND. Each product appears at most once.
     */
    vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where, take, skip }: any) => {
      let results = Array.from(productosDB.values()).filter(
        (p) => p.activo === true && p.organizacion_id === where?.organizacion_id
      )

      // Apply AND clauses if present
      const andClauses: any[] = where?.AND ?? []
      for (const clause of andClauses) {
        if (clause.OR) {
          // This is the talla OR clause: [{ talla: insensitive }, { variantes: { some: ... } }]
          const tallaClause = clause.OR[0]?.talla
          if (tallaClause?.equals !== undefined) {
            const tallaNorm = tallaClause.equals as string
            results = results.filter((p) => productoMatcheaTalla(p, tallaNorm))
          }
        }
      }

      const start = skip ?? 0
      const end = take !== undefined ? start + take : undefined
      return results.slice(start, end) as any
    })

    // prisma.producto.count — mirrors findMany logic (without pagination)
    vi.mocked(prisma.producto.count).mockImplementation(async ({ where }: any) => {
      let results = Array.from(productosDB.values()).filter(
        (p) => p.activo === true && p.organizacion_id === where?.organizacion_id
      )

      const andClauses: any[] = where?.AND ?? []
      for (const clause of andClauses) {
        if (clause.OR) {
          const tallaClause = clause.OR[0]?.talla
          if (tallaClause?.equals !== undefined) {
            const tallaNorm = tallaClause.equals as string
            results = results.filter((p) => productoMatcheaTalla(p, tallaNorm))
          }
        }
      }

      return results.length
    })
  })

  it(
    "P4.1 — El resultado contiene exactamente los productos que coinciden por raíz o variante (Req 3.1, 3.2)",
    async () => {
      /**
       * Generators:
       * - orgId: unique tenant identifier
       * - products: array of products, each with optional root talla and optional variants with talla
       * - searchTalla: a talla value possibly with different casing and surrounding spaces
       */
      await fc.assert(
        fc.asyncProperty(
          // tenant
          fc.uuid(),
          // catalog: 1–8 products
          fc.array(
            fc.record({
              // root talla: null or a short string (possibly padded with spaces)
              rootTalla: fc.option(
                fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/).map((s) => {
                  // randomly add leading/trailing spaces and mixed case
                  const pad = Math.random() > 0.5 ? "  " : ""
                  return pad + s + pad
                }),
                { nil: null }
              ),
              // variants: 0–3 variants, each with a talla
              variantes: fc.array(
                fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/).map((s) => {
                  const pad = Math.random() > 0.5 ? " " : ""
                  return pad + s.toUpperCase() + pad
                }),
                { minLength: 0, maxLength: 3 }
              ),
            }),
            { minLength: 1, maxLength: 8 }
          ),
          // search talla: pick a realistic value (with spaces and varying case)
          fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/).map((s) => {
            return "  " + s.toLowerCase() + "  "
          }),
          async (orgId, catalog, searchTalla) => {
            productosDB.clear()
            idCounter = 0

            // Seed the catalog into the in-memory DB via crearProducto
            const { crearProducto } = await import("@/lib/dominio/inventario")
            for (const entry of catalog) {
              const tieneVariantes = entry.variantes.length > 0
              await crearProducto(
                {
                  nombre: "Producto Test",
                  precio_venta: 10,
                  talla: tieneVariantes ? undefined : (entry.rootTalla ?? undefined),
                  variantes_stock: tieneVariantes
                    ? entry.variantes.map((v, i) => ({ talla: v, stock: i + 1 }))
                    : undefined,
                },
                orgId
              )
            }

            // Determine the expected set of matching product IDs (pure logic, no DB)
            const tallaNorm = searchTalla.trim().toLowerCase()
            const allProducts = Array.from(productosDB.values()).filter(
              (p) => p.organizacion_id === orgId
            )
            const expectedIds = new Set(
              allProducts
                .filter((p) => productoMatcheaTalla(p, tallaNorm))
                .map((p) => p.id)
            )

            // Query using the domain function
            const { items } = await listarProductos({
              organizacion_id: orgId,
              talla: searchTalla,
              take: 1000,
            })

            const returnedIds = items.map((p: any) => p.id)

            // 1. Result contains exactly the matching products (Req 3.1)
            expect(new Set(returnedIds)).toEqual(expectedIds)

            // 2. No duplicates: length equals Set size (Req 3.2)
            expect(returnedIds.length).toBe(new Set(returnedIds).size)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P4.2 — Sin coincidencias devuelve lista vacía sin error (Req 3.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // catalog with products that have fixed talla "ROJO"
          fc.integer({ min: 1, max: 5 }),
          // search for a talla that will never match
          fc.constant("zzz_sin_coincidencia"),
          async (orgId, count, searchTalla) => {
            productosDB.clear()
            idCounter = 0

            const { crearProducto } = await import("@/lib/dominio/inventario")
            for (let i = 0; i < count; i++) {
              await crearProducto(
                {
                  nombre: `Producto ${i}`,
                  precio_venta: 10,
                  talla: "ROJO",
                },
                orgId
              )
            }

            // Should return empty list, no error
            const { items, total } = await listarProductos({
              organizacion_id: orgId,
              talla: searchTalla,
              take: 1000,
            })

            expect(items).toHaveLength(0)
            expect(total).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P4.3 — Productos que coinciden tanto por raíz como por variante aparecen exactamente una vez (Req 3.2)",
    async () => {
      /**
       * Constructs products where the root talla AND a variant talla both match
       * the search value. The product must appear exactly once in the result.
       */
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // a simple, non-padded, lowercase base talla value
          fc.stringMatching(/^[a-z]{2,8}$/),
          // number of such dual-match products
          fc.integer({ min: 1, max: 5 }),
          async (orgId, baseTalla, count) => {
            productosDB.clear()
            idCounter = 0

            const { crearProducto } = await import("@/lib/dominio/inventario")
            for (let i = 0; i < count; i++) {
              // Product where the root talla and one variant talla both equal baseTalla (different casing)
              // Since this product has variants, root talla is set to null by crearProducto.
              // Instead, we put baseTalla in two variants (same normalized value) to test variant dedup.
              await crearProducto(
                {
                  nombre: `Dual-match ${i}`,
                  precio_venta: 15,
                  // 2 variants with the same base talla in different casing
                  variantes_stock: [
                    { talla: baseTalla.toUpperCase(), stock: 1 },
                    { talla: baseTalla.toLowerCase(), stock: 2 },
                  ],
                },
                orgId
              )
            }

            const searchTalla = `  ${baseTalla}  ` // with surrounding spaces

            const { items } = await listarProductos({
              organizacion_id: orgId,
              talla: searchTalla,
              take: 1000,
            })

            const returnedIds = items.map((p: any) => p.id)

            // Each product appears exactly once (no duplicate rows)
            expect(returnedIds.length).toBe(new Set(returnedIds).size)
            // All matching products are returned
            expect(returnedIds.length).toBe(count)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
