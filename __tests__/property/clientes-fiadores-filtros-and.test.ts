// Feature: gestion-clientes-y-fiadores, Property 5: Combinación de filtros del listado es conjunción AND
/**
 * Property 5: Combinación de filtros del listado es conjunción AND
 * **Validates: Requirements 3.4, 10.9**
 *
 * Para todo conjunto de filtros aplicados simultáneamente al listado de inventario
 * (talla, stock crítico, rango de stock y demás), cada producto del resultado satisface
 * todos y cada uno de los filtros aplicados.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryVariante {
  id: string
  producto_id: string
  talla: string
  stock_actual: number
}

interface InMemoryProducto {
  id: string
  organizacion_id: string
  nombre: string
  precio_compra: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  unidad: string
  talla: string | null
  activo: boolean
  categoria_id: string | null
  variantes: InMemoryVariante[]
  codigo_barras: string
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let productosDB: Map<string, InMemoryProducto>
let idCounter: number

function newId(): string {
  return `prod-${++idCounter}`
}

function newVarianteId(): string {
  return `var-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

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

vi.mock("@/lib/codigo-barras", () => ({
  generarEan13: vi.fn(() => `200${Math.random().toString().slice(2, 12)}`),
  detectarFormato: vi.fn(() => "EAN-13"),
}))

vi.mock("@/lib/dominio/notificaciones", () => ({
  detectarStockCritico: vi.fn(),
  estadoStock: vi.fn(() => "En Stock"),
}))

import { prisma } from "@/lib/db"
import { listarProductos, esCritico, normalizarTalla } from "@/lib/dominio/inventario"

// ── Pure helper predicates (mirror the domain logic) ─────────────────────────

/**
 * Checks if a product's talla (root or variant) matches a normalized talla filter value.
 */
function matcheaTalla(producto: InMemoryProducto, tallaNorm: string): boolean {
  const rootMatch = producto.talla !== null && producto.talla.trim().toLowerCase() === tallaNorm
  const variantMatch = producto.variantes.some(
    (v) => v.talla.trim().toLowerCase() === tallaNorm
  )
  return rootMatch || variantMatch
}

/**
 * Checks if a product satisfies the stock range filter (inclusive on both ends).
 */
function matcheaRangoStock(
  producto: InMemoryProducto,
  stock_min?: number,
  stock_max?: number
): boolean {
  if (stock_min !== undefined && producto.stock_actual < stock_min) return false
  if (stock_max !== undefined && producto.stock_actual > stock_max) return false
  return true
}

/**
 * Checks if a product satisfies ALL applied filters simultaneously (AND semantics).
 */
function satisfaceTodosFiltros(
  producto: InMemoryProducto,
  filtros: {
    tallaNorm?: string
    stock_min?: number
    stock_max?: number
    solo_critico?: boolean
  }
): boolean {
  if (filtros.tallaNorm !== undefined && !matcheaTalla(producto, filtros.tallaNorm)) {
    return false
  }
  if (!matcheaRangoStock(producto, filtros.stock_min, filtros.stock_max)) {
    return false
  }
  if (filtros.solo_critico && !esCritico(producto.stock_actual, producto.stock_minimo)) {
    return false
  }
  return true
}

// ── Mock setup helpers ────────────────────────────────────────────────────────

/**
 * Applies the AND filter logic to the in-memory DB, mirroring the domain:
 * - activo: true + organizacion_id filter
 * - talla: OR(root talla, variant talla), case-insensitive after trim
 * - stock range: gte / lte on stock_actual
 * - solo_critico: post-filter using esCritico()
 */
function aplicarFiltrosEnMemoria(
  orgId: string,
  filtros: {
    tallaNorm?: string
    stock_min?: number
    stock_max?: number
    solo_critico?: boolean
  }
): InMemoryProducto[] {
  let results = Array.from(productosDB.values()).filter(
    (p) => p.activo && p.organizacion_id === orgId
  )

  if (filtros.tallaNorm !== undefined) {
    results = results.filter((p) => matcheaTalla(p, filtros.tallaNorm!))
  }

  if (filtros.stock_min !== undefined) {
    results = results.filter((p) => p.stock_actual >= filtros.stock_min!)
  }
  if (filtros.stock_max !== undefined) {
    results = results.filter((p) => p.stock_actual <= filtros.stock_max!)
  }

  if (filtros.solo_critico) {
    results = results.filter((p) => esCritico(p.stock_actual, p.stock_minimo))
  }

  return results
}

// ── beforeEach: wire the mocks ────────────────────────────────────────────────

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
      codigo_barras: data.codigo_barras ?? `ean-${id}`,
      nombre: data.nombre,
      organizacion_id: data.organizacion_id,
      precio_compra: Number(data.precio_compra ?? 0),
      precio_venta: Number(data.precio_venta ?? 0),
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
   * prisma.producto.findMany — replicates listarProductos filter logic:
   * 1. activo + organizacion_id base filter
   * 2. AND clauses (talla OR, stock range)
   * 3. solo_critico is handled as a post-filter in the domain itself; here
   *    we replicate the underlying findMany without that post-filter (the domain
   *    does the post-filter in memory after calling findMany).
   */
  vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where, take, skip }: any) => {
    let results = Array.from(productosDB.values()).filter(
      (p) => p.activo === true && p.organizacion_id === where?.organizacion_id
    )

    // AND clauses — replicate talla OR filter
    const andClauses: any[] = where?.AND ?? []
    for (const clause of andClauses) {
      if (clause.OR) {
        const tallaClause = clause.OR[0]?.talla
        if (tallaClause?.equals !== undefined) {
          const tallaNorm = tallaClause.equals as string
          results = results.filter((p) =>
            (p.talla !== null && p.talla.trim().toLowerCase() === tallaNorm) ||
            p.variantes.some((v) => v.talla.trim().toLowerCase() === tallaNorm)
          )
        }
      }
    }

    // Stock range filter (where.stock_actual.gte / .lte)
    if (where?.stock_actual?.gte !== undefined) {
      results = results.filter((p) => p.stock_actual >= where.stock_actual.gte)
    }
    if (where?.stock_actual?.lte !== undefined) {
      results = results.filter((p) => p.stock_actual <= where.stock_actual.lte)
    }

    // Include variantes in the response
    const paged = results.slice(skip ?? 0, take !== undefined ? (skip ?? 0) + take : undefined)
    return paged.map((p) => ({ ...p, variantes: p.variantes })) as any
  })

  // prisma.producto.count — mirrors findMany without pagination
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
          results = results.filter((p) =>
            (p.talla !== null && p.talla.trim().toLowerCase() === tallaNorm) ||
            p.variantes.some((v) => v.talla.trim().toLowerCase() === tallaNorm)
          )
        }
      }
    }

    if (where?.stock_actual?.gte !== undefined) {
      results = results.filter((p) => p.stock_actual >= where.stock_actual.gte)
    }
    if (where?.stock_actual?.lte !== undefined) {
      results = results.filter((p) => p.stock_actual <= where.stock_actual.lte)
    }

    return results.length
  })
})

// ── Generators ────────────────────────────────────────────────────────────────

/** A talla label: 1–8 alphanumeric characters. */
const arbTallaLabel = fc.stringMatching(/^[a-zA-Z0-9]{1,8}$/)

/** A product entry for seeding. */
const arbProductoEntry = fc.record({
  rootTalla: fc.option(arbTallaLabel, { nil: null }),
  variantTallas: fc.array(arbTallaLabel, { minLength: 0, maxLength: 2 }),
  stock_actual: fc.integer({ min: 0, max: 200 }),
  stock_minimo: fc.integer({ min: 0, max: 100 }),
})

/** Catalog: 1–10 products. */
const arbCatalogo = fc.array(arbProductoEntry, { minLength: 1, maxLength: 10 })

/** Optional stock range (both optional, ensuring min <= max when both present). */
const arbRangoStock = fc.tuple(
  fc.option(fc.integer({ min: 0, max: 150 }), { nil: undefined }),
  fc.option(fc.integer({ min: 50, max: 200 }), { nil: undefined })
)

/** A combined filter set: talla (optional), stock range, solo_critico (optional). */
const arbFiltros = fc.record({
  tallaRaw: fc.option(
    arbTallaLabel.map((s) => `  ${s}  `), // with surrounding spaces to test normalization
    { nil: undefined }
  ),
  stock_min: fc.option(fc.integer({ min: 0, max: 100 }), { nil: undefined }),
  stock_max: fc.option(fc.integer({ min: 100, max: 200 }), { nil: undefined }),
  solo_critico: fc.option(fc.boolean(), { nil: undefined }),
})

// ── Helper: seed a product into in-memory DB ─────────────────────────────────

function sembrarProducto(
  entry: {
    rootTalla: string | null
    variantTallas: string[]
    stock_actual: number
    stock_minimo: number
  },
  orgId: string
): InMemoryProducto {
  const id = newId()
  const tieneVariantes = entry.variantTallas.length > 0

  const variantes: InMemoryVariante[] = entry.variantTallas.map((t, i) => ({
    id: newVarianteId(),
    producto_id: id,
    talla: t,
    stock_actual: Math.max(0, Math.floor(entry.stock_actual / (entry.variantTallas.length || 1))),
  }))

  const producto: InMemoryProducto = {
    id,
    codigo_barras: `ean-${id}`,
    nombre: `Producto-${id}`,
    organizacion_id: orgId,
    precio_compra: 10,
    precio_venta: 20,
    stock_actual: entry.stock_actual,
    stock_minimo: entry.stock_minimo,
    unidad: "unidad",
    talla: tieneVariantes ? null : entry.rootTalla,
    activo: true,
    categoria_id: null,
    variantes,
  }

  productosDB.set(id, producto)
  return producto
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Property 5: Combinación de filtros del listado es conjunción AND", () => {
  it(
    "P5.1 — Cada producto del resultado satisface TODOS los filtros aplicados simultáneamente (Req 3.4, 10.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          arbFiltros,
          async (orgId, catalog, filtros) => {
            productosDB.clear()
            idCounter = 0

            // Seed the catalog
            catalog.forEach((entry) => sembrarProducto(entry, orgId))

            // Normalize talla for comparison
            let tallaNorm: string | undefined
            if (filtros.tallaRaw !== undefined) {
              tallaNorm = filtros.tallaRaw.trim().toLowerCase()
            }

            // Resolve stock range: ensure min <= max when both are set
            let stock_min = filtros.stock_min
            let stock_max = filtros.stock_max
            if (stock_min !== undefined && stock_max !== undefined && stock_min > stock_max) {
              // Swap to ensure valid range
              ;[stock_min, stock_max] = [stock_max, stock_min]
            }

            const solo_critico = filtros.solo_critico === true ? true : undefined

            // Build the params for listarProductos
            const params: Parameters<typeof listarProductos>[0] = {
              organizacion_id: orgId,
              take: 1000,
            }
            if (filtros.tallaRaw !== undefined) params.talla = filtros.tallaRaw
            if (stock_min !== undefined) params.stock_min = stock_min
            if (stock_max !== undefined) params.stock_max = stock_max
            if (solo_critico !== undefined) params.solo_critico = solo_critico

            // Call the domain function
            const { items } = await listarProductos(params)

            // Assert: EVERY returned product must satisfy ALL applied filters
            for (const item of items) {
              const p = productosDB.get((item as any).id)
              if (!p) continue

              if (tallaNorm !== undefined) {
                // Req 3.4 — talla filter combined with other filters (AND)
                expect(
                  matcheaTalla(p, tallaNorm),
                  `Producto ${p.id} returned but does NOT match talla filter "${tallaNorm}"`
                ).toBe(true)
              }

              if (stock_min !== undefined) {
                // Req 10.9 — stock range combined (AND)
                expect(
                  p.stock_actual >= stock_min,
                  `Producto ${p.id} (stock=${p.stock_actual}) returned but violates stock_min=${stock_min}`
                ).toBe(true)
              }

              if (stock_max !== undefined) {
                expect(
                  p.stock_actual <= stock_max,
                  `Producto ${p.id} (stock=${p.stock_actual}) returned but violates stock_max=${stock_max}`
                ).toBe(true)
              }

              if (solo_critico) {
                // Req 10.9 — solo_critico combined with other filters (AND)
                expect(
                  esCritico(p.stock_actual, p.stock_minimo),
                  `Producto ${p.id} (stock=${p.stock_actual}, minimo=${p.stock_minimo}) returned but is NOT crítico`
                ).toBe(true)
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P5.2 — Ningún producto que falla al menos un filtro aparece en el resultado (completeness, Req 3.4, 10.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          arbFiltros,
          async (orgId, catalog, filtros) => {
            productosDB.clear()
            idCounter = 0

            catalog.forEach((entry) => sembrarProducto(entry, orgId))

            let tallaNorm: string | undefined
            if (filtros.tallaRaw !== undefined) {
              tallaNorm = filtros.tallaRaw.trim().toLowerCase()
            }

            let stock_min = filtros.stock_min
            let stock_max = filtros.stock_max
            if (stock_min !== undefined && stock_max !== undefined && stock_min > stock_max) {
              ;[stock_min, stock_max] = [stock_max, stock_min]
            }

            const solo_critico = filtros.solo_critico === true ? true : undefined

            const params: Parameters<typeof listarProductos>[0] = {
              organizacion_id: orgId,
              take: 1000,
            }
            if (filtros.tallaRaw !== undefined) params.talla = filtros.tallaRaw
            if (stock_min !== undefined) params.stock_min = stock_min
            if (stock_max !== undefined) params.stock_max = stock_max
            if (solo_critico !== undefined) params.solo_critico = solo_critico

            const { items } = await listarProductos(params)
            const returnedIds = new Set(items.map((p: any) => p.id))

            // Every product in the DB that satisfies ALL filters must appear in the result
            const aplicados = { tallaNorm, stock_min, stock_max, solo_critico }
            const esperados = aplicarFiltrosEnMemoria(orgId, aplicados)

            for (const expected of esperados) {
              expect(
                returnedIds.has(expected.id),
                `Producto ${expected.id} satisfies all filters but is MISSING from result`
              ).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P5.3 — Con talla y rango de stock combinados: solo se devuelven productos que cumplen ambos (Req 3.4)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // Catalog with explicit talla values (mix of matching and non-matching)
          fc.array(
            fc.record({
              rootTalla: fc.oneof(fc.constant("M"), fc.constant("L"), fc.constant("XL"), fc.constant("S")),
              stock_actual: fc.integer({ min: 0, max: 100 }),
              stock_minimo: fc.integer({ min: 0, max: 50 }),
            }),
            { minLength: 2, maxLength: 10 }
          ),
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            catalog.forEach((entry) =>
              sembrarProducto(
                { rootTalla: entry.rootTalla, variantTallas: [], stock_actual: entry.stock_actual, stock_minimo: entry.stock_minimo },
                orgId
              )
            )

            // Apply talla="M" and stock_min=10 simultaneously
            const { items } = await listarProductos({
              organizacion_id: orgId,
              talla: "M",
              stock_min: 10,
              take: 1000,
            })

            for (const item of items) {
              const p = productosDB.get((item as any).id)
              if (!p) continue

              // Must match talla
              expect(
                matcheaTalla(p, "m"),
                `Producto ${p.id} does not match talla "m"`
              ).toBe(true)

              // Must satisfy stock_min=10
              expect(
                p.stock_actual >= 10,
                `Producto ${p.id} (stock=${p.stock_actual}) violates stock_min=10`
              ).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P5.4 — solo_critico combinado con rango de stock: resultado es intersección de ambos criterios (Req 10.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              stock_actual: fc.integer({ min: 0, max: 50 }),
              stock_minimo: fc.integer({ min: 0, max: 40 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            catalog.forEach((entry) =>
              sembrarProducto(
                { rootTalla: null, variantTallas: [], stock_actual: entry.stock_actual, stock_minimo: entry.stock_minimo },
                orgId
              )
            )

            // Apply solo_critico + stock_max=30
            const { items } = await listarProductos({
              organizacion_id: orgId,
              solo_critico: true,
              stock_max: 30,
              take: 1000,
            })

            for (const item of items) {
              const p = productosDB.get((item as any).id)
              if (!p) continue

              // Must be crítico
              expect(
                esCritico(p.stock_actual, p.stock_minimo),
                `Producto ${p.id} (stock=${p.stock_actual}, minimo=${p.stock_minimo}) is NOT crítico`
              ).toBe(true)

              // Must satisfy stock_max=30
              expect(
                p.stock_actual <= 30,
                `Producto ${p.id} (stock=${p.stock_actual}) violates stock_max=30`
              ).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
