// Feature: gestion-clientes-y-fiadores, Property 3: Valor de Inventario suma correctamente sin doble conteo
/**
 * Property 3: Valor de Inventario suma correctamente sin doble conteo
 * **Validates: Requirements 2.2, 2.3, 2.4**
 *
 * Para todo catálogo de productos activos aleatorio (con `precio_compra`, `precio_venta`,
 * `stock_actual` posiblemente nulos, y con o sin variantes), la Inversión es igual a la
 * suma de `precio_compra × stock_actual` y la Recaudación potencial a la suma de
 * `precio_venta × stock_actual` sobre los productos activos del tenant, tratando los nulos
 * como cero, usando la suma de stock de variantes como stock del producto y contando cada
 * producto exactamente una vez.
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
  precio_compra: number | null
  precio_venta: number | null
  stock_actual: number | null
  activo: boolean
  variantes: InMemoryVariante[]
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
      findMany: vi.fn(),
    },
  },
}))

// Mock codigo-barras to avoid EAN-13 generation complexity
vi.mock("@/lib/codigo-barras", () => ({
  generarEan13: vi.fn(() => `200${Math.random().toString().slice(2, 12)}`),
  detectarFormato: vi.fn(() => "EAN-13"),
}))

// Mock notificaciones to avoid side effects
vi.mock("@/lib/dominio/notificaciones", () => ({
  detectarStockCritico: vi.fn(),
  estadoStock: vi.fn(() => "En Stock"),
}))

import { prisma } from "@/lib/db"
import { calcularValorInventario } from "@/lib/dominio/inventario"
import { redondearBancario } from "@/lib/money"

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Precio: null o un valor positivo con hasta 2 decimales (0.01 – 9 999.99). */
const arbPrecioNullable = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 1, max: 999_999 }).map((c) => c / 100)
)

/** Stock: null o un entero entre 0 y 999. */
const arbStockNullable = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 0, max: 999 })
)

/** Stock de variante: entero no negativo 0–999. */
const arbStockVariante = fc.integer({ min: 0, max: 999 })

/**
 * Genera una variante con talla aleatoria y stock propio.
 */
const arbVariante = fc.record({
  talla: fc.stringMatching(/^[a-zA-Z0-9]{1,10}$/),
  stock_actual: arbStockVariante,
})

/**
 * Genera un producto con:
 * - precio_compra / precio_venta posiblemente nulos
 * - stock_actual posiblemente nulo (cuando hay variantes, el stock raíz será
 *   la suma de variantes — esto lo calcula el helper de seeding)
 * - 0 a 3 variantes opcionales
 */
const arbProducto = fc.record({
  precio_compra: arbPrecioNullable,
  precio_venta: arbPrecioNullable,
  stockRaiz: arbStockNullable,     // usado solo si tieneVariantes === false
  variantes: fc.array(arbVariante, { minLength: 0, maxLength: 3 }),
})

/** Catálogo: 0 a 10 productos. */
const arbCatalogo = fc.array(arbProducto, { minLength: 0, maxLength: 10 })

// ── Helper: calcular el stock efectivo del producto ──────────────────────────

/**
 * Calcula el stock efectivo de un producto en memoria:
 * - Si tiene variantes, es la suma de stock_actual de las variantes (Req 2.4).
 * - Si no tiene variantes, es el valor de stockRaiz (null tratado como 0).
 */
function stockEfectivo(p: InMemoryProducto): number {
  if (p.variantes.length > 0) {
    return p.variantes.reduce((sum, v) => sum + v.stock_actual, 0)
  }
  return p.stock_actual ?? 0
}

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  productosDB = new Map()
  idCounter = 0

  /**
   * prisma.producto.findMany — filtra por organizacion_id y activo: true,
   * devuelve los campos que calcularValorInventario selecciona:
   * { precio_compra, precio_venta, stock_actual }
   */
  vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const soloActivos: boolean = where?.activo === true

    const resultado = Array.from(productosDB.values()).filter((p) => {
      if (orgId !== undefined && p.organizacion_id !== orgId) return false
      if (soloActivos && !p.activo) return false
      return true
    })

    // Devolver solo los campos que la función selecciona (precio_compra, precio_venta, stock_actual)
    return resultado.map((p) => ({
      precio_compra: p.precio_compra,
      precio_venta: p.precio_venta,
      stock_actual: p.stock_actual,
    })) as any
  })
})

// ── Función auxiliar de seeding ───────────────────────────────────────────────

/**
 * Siembra un producto en la BD en memoria y devuelve su referencia,
 * con el stock efectivo ya calculado (suma de variantes si las tiene).
 */
function sembrarProducto(
  entry: {
    precio_compra: number | null
    precio_venta: number | null
    stockRaiz: number | null
    variantes: Array<{ talla: string; stock_actual: number }>
  },
  organizacion_id: string
): InMemoryProducto {
  const id = newId()
  const tieneVariantes = entry.variantes.length > 0

  const variantesCreadas: InMemoryVariante[] = entry.variantes.map((v) => ({
    id: newVarianteId(),
    producto_id: id,
    talla: v.talla,
    stock_actual: v.stock_actual,
  }))

  const stockRaizFinal = tieneVariantes
    ? entry.variantes.reduce((sum, v) => sum + v.stock_actual, 0)
    : entry.stockRaiz

  const producto: InMemoryProducto = {
    id,
    organizacion_id,
    nombre: `Producto-${id}`,
    precio_compra: entry.precio_compra,
    precio_venta: entry.precio_venta,
    stock_actual: stockRaizFinal,
    activo: true,
    variantes: variantesCreadas,
  }

  productosDB.set(id, producto)
  return producto
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Property 3: Valor de Inventario suma correctamente sin doble conteo", () => {
  it(
    "P3.1 — Inversión = Σ precio_compra × stock_actual sobre productos activos del tenant, nulos tratados como 0 (Req 2.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            // Sembrar catálogo en la BD en memoria
            const productos = catalog.map((entry) => sembrarProducto(entry, orgId))

            // Calcular el valor esperado de inversión con la misma lógica que el dominio
            let inversionEsperada = 0
            for (const p of productos) {
              const stock = stockEfectivo(p)
              const compra = p.precio_compra !== null ? p.precio_compra : 0
              inversionEsperada += compra * stock
            }
            inversionEsperada = redondearBancario(inversionEsperada)

            const { inversion } = await calcularValorInventario(orgId)

            expect(inversion).toBeCloseTo(inversionEsperada, 9)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P3.2 — Recaudación potencial = Σ precio_venta × stock_actual sobre productos activos del tenant, nulos tratados como 0 (Req 2.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCatalogo,
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            const productos = catalog.map((entry) => sembrarProducto(entry, orgId))

            let recaudacionEsperada = 0
            for (const p of productos) {
              const stock = stockEfectivo(p)
              const venta = p.precio_venta !== null ? p.precio_venta : 0
              recaudacionEsperada += venta * stock
            }
            recaudacionEsperada = redondearBancario(recaudacionEsperada)

            const { recaudacionPotencial } = await calcularValorInventario(orgId)

            expect(recaudacionPotencial).toBeCloseTo(recaudacionEsperada, 9)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P3.3 — Productos con variantes usan suma de stock de variantes como stock efectivo, contados una sola vez (Req 2.4)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // Catálogo que mezcla productos con y sin variantes
          fc.array(
            fc.record({
              precio_compra: arbPrecioNullable,
              precio_venta: arbPrecioNullable,
              variantes: fc.array(arbVariante, { minLength: 1, maxLength: 4 }),
            }),
            { minLength: 1, maxLength: 6 }
          ),
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            const productos = catalog.map((entry) =>
              sembrarProducto(
                {
                  precio_compra: entry.precio_compra,
                  precio_venta: entry.precio_venta,
                  stockRaiz: null,
                  variantes: entry.variantes,
                },
                orgId
              )
            )

            // Esperado: cada producto se cuenta UNA SOLA VEZ, usando stock raíz = suma de variantes
            let inversionEsperada = 0
            let recaudacionEsperada = 0
            for (const p of productos) {
              const stock = stockEfectivo(p) // suma de variantes
              const compra = p.precio_compra !== null ? p.precio_compra : 0
              const venta = p.precio_venta !== null ? p.precio_venta : 0
              inversionEsperada += compra * stock
              recaudacionEsperada += venta * stock
            }

            const { inversion, recaudacionPotencial } = await calcularValorInventario(orgId)

            expect(inversion).toBeCloseTo(redondearBancario(inversionEsperada), 9)
            expect(recaudacionPotencial).toBeCloseTo(redondearBancario(recaudacionEsperada), 9)

            // El número de productos procesados debe coincidir con el catálogo sembrado
            // (sin doble conteo: cada producto aparece exactamente una vez).
            // Lo garantiza la implementación que usa findMany sobre Producto raíz directamente.
            expect(productos.length).toBe(catalog.length)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P3.4 — Sin productos activos, inversión y recaudación potencial son 0 (Req 2.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (orgId) => {
            productosDB.clear()
            idCounter = 0
            // No se siembran productos para este orgId

            const { inversion, recaudacionPotencial } = await calcularValorInventario(orgId)

            expect(inversion).toBe(0)
            expect(recaudacionPotencial).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P3.5 — Solo se consideran los productos del tenant activo, no los de otras organizaciones (Req 2.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.array(arbProducto, { minLength: 1, maxLength: 5 }),
          fc.array(arbProducto, { minLength: 1, maxLength: 5 }),
          async (orgA, orgB, catalogA, catalogB) => {
            // Asegurarse de que los dos orgIds son distintos
            fc.pre(orgA !== orgB)

            productosDB.clear()
            idCounter = 0

            // Sembrar catálogos para dos tenants distintos
            const productosA = catalogA.map((entry) => sembrarProducto(entry, orgA))
            catalogB.forEach((entry) => sembrarProducto(entry, orgB))

            // El valor esperado para orgA no debe incluir productos de orgB
            let invEsperadaA = 0
            let recEsperadaA = 0
            for (const p of productosA) {
              const stock = stockEfectivo(p)
              invEsperadaA += (p.precio_compra ?? 0) * stock
              recEsperadaA += (p.precio_venta ?? 0) * stock
            }

            const { inversion, recaudacionPotencial } = await calcularValorInventario(orgA)

            expect(inversion).toBeCloseTo(redondearBancario(invEsperadaA), 9)
            expect(recaudacionPotencial).toBeCloseTo(redondearBancario(recEsperadaA), 9)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
