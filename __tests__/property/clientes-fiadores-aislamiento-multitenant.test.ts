// Feature: gestion-clientes-y-fiadores, Property 1: Aislamiento multi-tenant de las agregaciones
/**
 * Property 1: Aislamiento multi-tenant de las agregaciones
 * **Validates: Requirements 1.1, 1.2, 1.3, 1.5, 1.6, 2.5, 3.5, 4.5, 4.7, 5.12, 8.10, 9.7, 10.10**
 *
 * Para toda colección de organizaciones con datos de negocio aleatorios, el resultado
 * de cualquier agregación de una organización activa (métricas del dashboard, rankings,
 * Valor de Inventario, listado de clientes, listado de fiadores, totales de deuda) depende
 * únicamente de los registros cuyo `organizacion_id` coincide con esa organización,
 * y no cambia al añadir o quitar registros de otras organizaciones.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryProducto {
  id: string
  organizacion_id: string
  nombre: string
  precio_compra: number | null
  precio_venta: number | null
  stock_actual: number
  stock_minimo: number
  activo: boolean
  talla: string | null
  variantes: Array<{ id: string; producto_id: string; talla: string; stock_actual: number }>
}

interface InMemoryVenta {
  id: string
  organizacion_id: string
  folio: string
  total: number
  metodo_pago: string
  estado: string
  cliente_id: string | null
  creado_en: Date
}

interface InMemoryVentaItem {
  id: string
  organizacion_id: string
  venta_id: string
  producto_id: string
  cantidad: number
  precio_unitario: number
  subtotal_linea: number
}

interface InMemoryMovimientoStock {
  id: string
  organizacion_id: string
  producto_id: string
  tipo: string
  cantidad: number
  stock_resultante: number
  creado_en: Date
}

interface InMemoryCliente {
  id: string
  organizacion_id: string
  cedula: string
  nombre: string
  telefono: string
  correo: string | null
  direccion: string | null
  creado_en: Date
  actualizado_en: Date
}

interface InMemoryMovimientoDeuda {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: "cargo" | "abono"
  monto: number
  venta_id: string | null
  plazo_deuda: Date | null
  fecha: Date
  creado_en: Date
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let productosDB: Map<string, InMemoryProducto>
let ventasDB: Map<string, InMemoryVenta>
let ventaItemsDB: Map<string, InMemoryVentaItem>
let movimientosStockDB: Map<string, InMemoryMovimientoStock>
let clientesDB: Map<string, InMemoryCliente>
let movimientosDeudaDB: Map<string, InMemoryMovimientoDeuda>
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

function resetDB(): void {
  productosDB = new Map()
  ventasDB = new Map()
  ventaItemsDB = new Map()
  movimientosStockDB = new Map()
  clientesDB = new Map()
  movimientosDeudaDB = new Map()
  idCounter = 0
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    producto: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      count: vi.fn(),
    },
    venta: {
      findMany: vi.fn(),
    },
    ventaItem: {
      findMany: vi.fn(),
    },
    movimientoStock: {
      findMany: vi.fn(),
    },
    cliente: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    movimientoDeuda: {
      findMany: vi.fn(),
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
import { calcularValorInventario, listarProductos } from "@/lib/dominio/inventario"
import { listarClientes } from "@/lib/dominio/clientes"
import { listarFiadores, totalesDeuda } from "@/lib/dominio/deuda"
import { agregarMetricas, limitesUtc } from "@/lib/dominio/metricas"
import { calcularRankings } from "@/lib/dominio/rankings"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  resetDB()

  // prisma.producto.findMany — filtra por organizacion_id, activo
  vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const soloActivos: boolean | undefined = where?.activo

    let results = Array.from(productosDB.values())
    if (orgId !== undefined) results = results.filter((p) => p.organizacion_id === orgId)
    if (soloActivos === true) results = results.filter((p) => p.activo)

    return results.map((p) => ({
      id: p.id,
      organizacion_id: p.organizacion_id,
      nombre: p.nombre,
      precio_compra: p.precio_compra,
      precio_venta: p.precio_venta,
      stock_actual: p.stock_actual,
      stock_minimo: p.stock_minimo,
      activo: p.activo,
      talla: p.talla,
      variantes: p.variantes,
    })) as any
  })

  // prisma.producto.findFirst — busca por codigo_barras y organizacion_id
  vi.mocked(prisma.producto.findFirst).mockImplementation(async ({ where }: any) => {
    for (const p of productosDB.values()) {
      if (where?.organizacion_id && p.organizacion_id !== where.organizacion_id) continue
      if (where?.id && p.id !== where.id) continue
      return p as any
    }
    return null
  })

  // prisma.producto.count — filtra por organizacion_id
  vi.mocked((prisma.producto as any).count).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    let results = Array.from(productosDB.values())
    if (orgId !== undefined) results = results.filter((p) => p.organizacion_id === orgId)
    if (where?.activo === true) results = results.filter((p) => p.activo)
    return results.length
  })
  // prisma.venta.findMany — filtra por organizacion_id, estado, creado_en range
  vi.mocked(prisma.venta.findMany).mockImplementation(async ({ where, select }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const estado: string | undefined = where?.estado
    const enRango: { gte?: Date; lte?: Date } | undefined = where?.creado_en

    let results = Array.from(ventasDB.values())
    if (orgId) results = results.filter((v) => v.organizacion_id === orgId)
    if (estado) results = results.filter((v) => v.estado === estado)
    if (enRango?.gte) results = results.filter((v) => v.creado_en >= enRango.gte!)
    if (enRango?.lte) results = results.filter((v) => v.creado_en <= enRango.lte!)

    // If select asks for metodo_pago / cliente_id, include them
    return results.map((v) => ({
      id: v.id,
      total: v.total,
      creado_en: v.creado_en,
      metodo_pago: v.metodo_pago,
      cliente_id: v.cliente_id,
    })) as any
  })

  // prisma.ventaItem.findMany — filtra por organizacion_id + venta estado/rango
  vi.mocked(prisma.ventaItem.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const ventaWhere = where?.venta

    let items = Array.from(ventaItemsDB.values())
    if (orgId) items = items.filter((i) => i.organizacion_id === orgId)

    if (ventaWhere) {
      const ventaEstado: string | undefined = ventaWhere.estado
      const enRango: { gte?: Date; lte?: Date } | undefined = ventaWhere.creado_en

      items = items.filter((i) => {
        const venta = ventasDB.get(i.venta_id)
        if (!venta) return false
        if (ventaEstado && venta.estado !== ventaEstado) return false
        if (enRango?.gte && venta.creado_en < enRango.gte) return false
        if (enRango?.lte && venta.creado_en > enRango.lte) return false
        return true
      })
    }

    return items.map((i) => {
      const producto = productosDB.get(i.producto_id)
      const venta = ventasDB.get(i.venta_id)
      return {
        produto_id: i.producto_id,
        producto_id: i.producto_id,
        cantidad: i.cantidad,
        precio_unitario: i.precio_unitario,
        subtotal_linea: i.subtotal_linea,
        producto: { nombre: producto?.nombre ?? "", precio_compra: producto?.precio_compra ?? 0 },
        venta: { creado_en: venta?.creado_en ?? new Date() },
      }
    }) as any
  })

  // prisma.movimientoStock.findMany — filtra por organizacion_id, tipo, creado_en, cantidad
  vi.mocked(prisma.movimientoStock.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const tipo: string | undefined = where?.tipo
    const enRango: { gte?: Date; lte?: Date } | undefined = where?.creado_en
    const cantidadFilter: { lt?: number } | undefined = where?.cantidad

    let results = Array.from(movimientosStockDB.values())
    if (orgId) results = results.filter((m) => m.organizacion_id === orgId)
    if (tipo) results = results.filter((m) => m.tipo === tipo)
    if (enRango?.gte) results = results.filter((m) => m.creado_en >= enRango.gte!)
    if (enRango?.lte) results = results.filter((m) => m.creado_en <= enRango.lte!)
    if (cantidadFilter?.lt !== undefined) {
      results = results.filter((m) => m.cantidad < cantidadFilter.lt!)
    }

    return results.map((m) => {
      const producto = productosDB.get(m.producto_id)!
      return {
        producto_id: m.producto_id,
        cantidad: m.cantidad,
        tipo: m.tipo,
        creado_en: m.creado_en,
        producto: { nombre: producto?.nombre ?? "", precio_venta: producto?.precio_venta ?? 0 },
      }
    }) as any
  })

  // prisma.cliente.findMany — filtra por organizacion_id, opcionalmente con movimientos
  vi.mocked(prisma.cliente.findMany).mockImplementation(async ({ where, include }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    let results = Array.from(clientesDB.values())
    if (orgId) results = results.filter((c) => c.organizacion_id === orgId)

    if (include?.movimientos_deuda) {
      const movWhere = include.movimientos_deuda?.where ?? {}
      return results.map((c) => {
        const movs = Array.from(movimientosDeudaDB.values()).filter((m) => {
          if (m.cliente_id !== c.id) return false
          if (movWhere.organizacion_id && m.organizacion_id !== movWhere.organizacion_id) return false
          return true
        })
        return {
          ...c,
          movimientos_deuda: movs.map((m) => ({ tipo: m.tipo, monto: m.monto })),
        }
      }) as any
    }

    return results as any
  })

  // prisma.cliente.count — filtra por organizacion_id
  vi.mocked(prisma.cliente.count).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    return Array.from(clientesDB.values()).filter(
      (c) => orgId === undefined || c.organizacion_id === orgId
    ).length
  })

  // prisma.movimientoDeuda.findMany — filtra por organizacion_id y/o cliente_id
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const clienteIdIn: string[] | undefined = where?.cliente_id?.in
    const clienteId: string | undefined =
      typeof where?.cliente_id === "string" ? where.cliente_id : undefined

    let results = Array.from(movimientosDeudaDB.values())
    if (orgId) results = results.filter((m) => m.organizacion_id === orgId)
    if (clienteIdIn) results = results.filter((m) => clienteIdIn.includes(m.cliente_id))
    if (clienteId) results = results.filter((m) => m.cliente_id === clienteId)

    return results.map((m) => ({
      id: m.id,
      organizacion_id: m.organizacion_id,
      cliente_id: m.cliente_id,
      tipo: m.tipo,
      monto: m.monto,
      venta_id: m.venta_id,
      fecha: m.fecha,
    })) as any
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

/** Fecha fija en el rango de prueba para métricas (2025-06-15, zona MX). */
const FECHA_EN_RANGO = new Date("2025-06-15T12:00:00.000Z")
const DESDE_RANGO = "2025-06-01"
const HASTA_RANGO = "2025-06-30"
const TZ = "America/Mexico_City"

function sembrarProducto(orgId: string, opts?: {
  precio_compra?: number | null
  precio_venta?: number
  stock_actual?: number
  activo?: boolean
}): InMemoryProducto {
  const id = newId("prod")
  const p: InMemoryProducto = {
    id,
    organizacion_id: orgId,
    nombre: `Producto-${id}`,
    precio_compra: opts?.precio_compra ?? 10,
    precio_venta: opts?.precio_venta ?? 20,
    stock_actual: opts?.stock_actual ?? 5,
    stock_minimo: 2,
    activo: opts?.activo ?? true,
    talla: null,
    variantes: [],
  }
  productosDB.set(id, p)
  return p
}

function sembrarVenta(orgId: string, opts?: {
  total?: number
  estado?: string
  metodo_pago?: string
  cliente_id?: string | null
}): InMemoryVenta {
  const id = newId("venta")
  const v: InMemoryVenta = {
    id,
    organizacion_id: orgId,
    folio: `F-${id}`,
    total: opts?.total ?? 100,
    metodo_pago: opts?.metodo_pago ?? "efectivo",
    estado: opts?.estado ?? "completada",
    cliente_id: opts?.cliente_id ?? null,
    creado_en: FECHA_EN_RANGO,
  }
  ventasDB.set(id, v)
  return v
}

function sembrarVentaItem(
  orgId: string,
  ventaId: string,
  productoId: string,
  opts?: { cantidad?: number; precio_unitario?: number }
): InMemoryVentaItem {
  const id = newId("item")
  const cantidad = opts?.cantidad ?? 1
  const precio = opts?.precio_unitario ?? 20
  const item: InMemoryVentaItem = {
    id,
    organizacion_id: orgId,
    venta_id: ventaId,
    producto_id: productoId,
    cantidad,
    precio_unitario: precio,
    subtotal_linea: redondearBancario(precio * cantidad),
  }
  ventaItemsDB.set(id, item)
  return item
}

function sembrarMovimientoStock(orgId: string, productoId: string, opts?: {
  tipo?: string
  cantidad?: number
}): InMemoryMovimientoStock {
  const id = newId("mstock")
  const m: InMemoryMovimientoStock = {
    id,
    organizacion_id: orgId,
    producto_id: productoId,
    tipo: opts?.tipo ?? "devolucion",
    cantidad: opts?.cantidad ?? 1,
    stock_resultante: 0,
    creado_en: FECHA_EN_RANGO,
  }
  movimientosStockDB.set(id, m)
  return m
}

function sembrarCliente(orgId: string, sufijo?: string): InMemoryCliente {
  const id = newId("cli")
  const c: InMemoryCliente = {
    id,
    organizacion_id: orgId,
    cedula: `CED${id.slice(-6)}${sufijo ?? ""}`.slice(0, 20),
    nombre: `Cliente-${id}`,
    telefono: "1234567",
    correo: null,
    direccion: null,
    creado_en: new Date(),
    actualizado_en: new Date(),
  }
  clientesDB.set(id, c)
  return c
}

function sembrarMovimientoDeuda(
  orgId: string,
  clienteId: string,
  tipo: "cargo" | "abono",
  monto: number
): InMemoryMovimientoDeuda {
  const id = newId("mov")
  const m: InMemoryMovimientoDeuda = {
    id,
    organizacion_id: orgId,
    cliente_id: clienteId,
    tipo,
    monto,
    venta_id: null,
    plazo_deuda: null,
    fecha: new Date(),
    creado_en: new Date(),
  }
  movimientosDeudaDB.set(id, m)
  return m
}

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Par de UUIDs distintos para orgA y orgB. */
const arbDosOrgs = fc
  .record({ orgA: fc.uuid(), orgB: fc.uuid() })
  .filter(({ orgA, orgB }) => orgA !== orgB)

/** Cantidad de entidades: 0 a 5. */
const arbCantidad = fc.integer({ min: 0, max: 5 })

/** Cantidad de entidades: 1 a 5 (para asegurar al menos algún dato). */
const arbCantidadMin1 = fc.integer({ min: 1, max: 5 })

/** Monto monetario positivo con hasta 2 decimales. */
const arbMonto = fc
  .integer({ min: 1, max: 99999 })
  .map((n) => Math.round(n) / 100)

// ── Helper: sembrar un conjunto de datos básico para un tenant ───────────────

interface DatosOrg {
  productos: InMemoryProducto[]
  ventas: InMemoryVenta[]
  clientes: InMemoryCliente[]
}

function sembrarDatosOrg(orgId: string, nProductos: number, nVentas: number, nClientes: number): DatosOrg {
  const productos: InMemoryProducto[] = []
  for (let i = 0; i < nProductos; i++) {
    productos.push(sembrarProducto(orgId, { stock_actual: i + 1, precio_compra: 10, precio_venta: 20 }))
  }

  const ventas: InMemoryVenta[] = []
  for (let i = 0; i < nVentas; i++) {
    const v = sembrarVenta(orgId, { total: 50 + i, estado: "completada" })
    ventas.push(v)
    if (productos.length > 0) {
      sembrarVentaItem(orgId, v.id, productos[i % productos.length].id, { cantidad: 1, precio_unitario: 20 })
      // Añadir movimiento de stock de salida para rankings
      sembrarMovimientoStock(orgId, productos[i % productos.length].id, { tipo: "venta", cantidad: -1 })
    }
    // Devolucion para métricas
    if (productos.length > 0) {
      sembrarMovimientoStock(orgId, productos[i % productos.length].id, { tipo: "devolucion", cantidad: 1 })
    }
  }

  const clientes: InMemoryCliente[] = []
  for (let i = 0; i < nClientes; i++) {
    const c = sembrarCliente(orgId)
    clientes.push(c)
    // Añadir un cargo de deuda a cada cliente para que sea "fiador"
    sembrarMovimientoDeuda(orgId, c.id, "cargo", 100 + i)
  }

  return { productos, ventas, clientes }
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 1: Aislamiento multi-tenant de las agregaciones", () => {
  // P1.1 ── Valor de Inventario: solo productos del tenant activo (Req 2.5, 1.5)
  it(
    "P1.1 — calcularValorInventario(orgA) no cambia al añadir/quitar productos de orgB (Req 2.5, 1.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1, // productos orgA
          arbCantidad,     // productos orgB (ruido)
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            // Sembrar productos del tenant activo
            for (let i = 0; i < nA; i++) {
              sembrarProducto(orgA, { precio_compra: 10, precio_venta: 20, stock_actual: i + 1 })
            }

            // Capturar el valor de inventario sin datos de orgB
            const valorSin = await calcularValorInventario(orgA)

            // Añadir productos de otro tenant (ruido)
            for (let i = 0; i < nB; i++) {
              sembrarProducto(orgB, { precio_compra: 999, precio_venta: 999, stock_actual: 999 })
            }

            // El valor de inventario de orgA no debe cambiar
            const valorCon = await calcularValorInventario(orgA)

            expect(valorCon.inversion).toBe(valorSin.inversion)
            expect(valorCon.recaudacionPotencial).toBe(valorSin.recaudacionPotencial)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.2 ── listarProductos: solo productos del tenant activo (Req 3.5, 10.10)
  it(
    "P1.2 — listarProductos(orgA) devuelve solo productos de orgA, sin importar orgB (Req 3.5, 10.10)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            for (let i = 0; i < nA; i++) sembrarProducto(orgA)
            for (let i = 0; i < nB; i++) sembrarProducto(orgB)

            const { items, total } = await listarProductos({ organizacion_id: orgA, take: 100 })

            expect(total).toBe(nA)
            expect(items.length).toBe(nA)
            expect(items.every((p: any) => p.organizacion_id === orgA)).toBe(true)
            expect(items.every((p: any) => p.organizacion_id !== orgB)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.3 ── listarClientes: solo clientes del tenant activo (Req 4.5)
  it(
    "P1.3 — listarClientes(orgA) devuelve solo clientes de orgA, sin importar orgB (Req 4.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            for (let i = 0; i < nA; i++) sembrarCliente(orgA)
            for (let i = 0; i < nB; i++) sembrarCliente(orgB)

            const { items, total } = await listarClientes({ organizacion_id: orgA, take: 100 })

            expect(total).toBe(nA)
            expect(items.length).toBe(nA)
            expect(items.every((c: any) => c.organizacion_id === orgA)).toBe(true)
            expect(items.every((c: any) => c.organizacion_id !== orgB)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.4 ── listarFiadores: solo fiadores del tenant activo (Req 5.12, 8.10)
  it(
    "P1.4 — listarFiadores(orgA) devuelve solo clientes de orgA con deuda, sin importar orgB (Req 5.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            // Clientes con deuda en orgA
            for (let i = 0; i < nA; i++) {
              const c = sembrarCliente(orgA)
              sembrarMovimientoDeuda(orgA, c.id, "cargo", 100)
            }
            // Ruido en orgB
            for (let i = 0; i < nB; i++) {
              const c = sembrarCliente(orgB)
              sembrarMovimientoDeuda(orgB, c.id, "cargo", 200)
            }

            const fiadoresA = await listarFiadores(orgA)

            expect(fiadoresA.length).toBe(nA)
            expect(fiadoresA.every((f) => f.cliente.organizacion_id === orgA)).toBe(true)
            expect(fiadoresA.every((f) => f.cliente.organizacion_id !== orgB)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.5 ── totalesDeuda: solo movimientos del tenant activo (Req 5.12, 9.7)
  it(
    "P1.5 — totalesDeuda(orgA) no cambia al añadir movimientos de deuda de orgB (Req 5.12, 9.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          arbMonto,
          async ({ orgA, orgB }, nA, nB, montoRuido) => {
            resetDB()

            for (let i = 0; i < nA; i++) {
              const c = sembrarCliente(orgA)
              sembrarMovimientoDeuda(orgA, c.id, "cargo", 100 + i)
            }

            // Snapshot sin ruido de orgB
            const totalesSin = await totalesDeuda(orgA)

            // Añadir ruido de orgB
            for (let i = 0; i < nB; i++) {
              const c = sembrarCliente(orgB)
              sembrarMovimientoDeuda(orgB, c.id, "cargo", montoRuido + i)
            }

            const totalesCon = await totalesDeuda(orgA)

            expect(totalesCon.totalClientesConDeuda).toBe(totalesSin.totalClientesConDeuda)
            expect(totalesCon.totalDeudaPendiente).toBe(totalesSin.totalDeudaPendiente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.6 ── agregarMetricas: ventas del tenant activo (Req 1.1, 1.3, 1.5)
  it(
    "P1.6 — agregarMetricas(orgA) no cambia al añadir ventas de orgB (Req 1.1, 1.3, 1.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            // Sembrar datos del tenant activo
            for (let i = 0; i < nA; i++) {
              const p = sembrarProducto(orgA, { precio_compra: 10, precio_venta: 25, stock_actual: 10 })
              const v = sembrarVenta(orgA, { total: 50, estado: "completada" })
              sembrarVentaItem(orgA, v.id, p.id, { cantidad: 2, precio_unitario: 25 })
              sembrarMovimientoStock(orgA, p.id, { tipo: "devolucion", cantidad: 1 })
            }

            const limites = limitesUtc(DESDE_RANGO, HASTA_RANGO, TZ)
            const metricasSin = await agregarMetricas(limites, orgA)

            // Añadir ruido de orgB
            for (let i = 0; i < nB; i++) {
              const p = sembrarProducto(orgB, { precio_compra: 999, precio_venta: 999, stock_actual: 999 })
              const v = sembrarVenta(orgB, { total: 9999, estado: "completada" })
              sembrarVentaItem(orgB, v.id, p.id, { cantidad: 100, precio_unitario: 999 })
              sembrarMovimientoStock(orgB, p.id, { tipo: "devolucion", cantidad: 100 })
            }

            const metricasCon = await agregarMetricas(limites, orgA)

            expect(metricasCon.totalSales).toBe(metricasSin.totalSales)
            expect(metricasCon.totalReturns).toBe(metricasSin.totalReturns)
            expect(metricasCon.totalExpenses).toBe(metricasSin.totalExpenses)
            expect(metricasCon.estimatedProfit).toBe(metricasSin.estimatedProfit)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.7 ── calcularRankings: rankings del tenant activo (Req 1.2, 1.5)
  it(
    "P1.7 — calcularRankings(orgA) no cambia al añadir ventas/productos de orgB (Req 1.2, 1.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            // Datos del tenant activo
            for (let i = 0; i < nA; i++) {
              const p = sembrarProducto(orgA, { precio_compra: 10, precio_venta: 25, stock_actual: 10 })
              const v = sembrarVenta(orgA, { total: 50, estado: "completada" })
              sembrarVentaItem(orgA, v.id, p.id, { cantidad: 1, precio_unitario: 25 })
              sembrarMovimientoStock(orgA, p.id, { tipo: "venta", cantidad: -1 })
            }

            const rankingsSin = await calcularRankings(DESDE_RANGO, HASTA_RANGO, 10, orgA, TZ)

            // Añadir ruido de orgB
            for (let i = 0; i < nB; i++) {
              const p = sembrarProducto(orgB, { precio_compra: 1, precio_venta: 9999, stock_actual: 9999 })
              const v = sembrarVenta(orgB, { total: 9999, estado: "completada" })
              sembrarVentaItem(orgB, v.id, p.id, { cantidad: 99, precio_unitario: 9999 })
              sembrarMovimientoStock(orgB, p.id, { tipo: "venta", cantidad: -99 })
            }

            const rankingsCon = await calcularRankings(DESDE_RANGO, HASTA_RANGO, 10, orgA, TZ)

            // Los rankings de orgA no deben verse afectados por datos de orgB
            expect(rankingsCon.topSelling.length).toBe(rankingsSin.topSelling.length)
            expect(rankingsCon.topMargin.length).toBe(rankingsSin.topMargin.length)
            expect(rankingsCon.topRotation.length).toBe(rankingsSin.topRotation.length)
            expect(rankingsCon.lowRotation.length).toBe(rankingsSin.lowRotation.length)

            // Los IDs en los rankings de orgA deben ser solo de orgA
            const idsOrgA = new Set(Array.from(productosDB.values())
              .filter((p) => p.organizacion_id === orgA).map((p) => p.id))

            for (const item of rankingsCon.topSelling) {
              expect(idsOrgA.has(item.producto_id)).toBe(true)
            }
            for (const item of rankingsCon.topMargin) {
              expect(idsOrgA.has(item.producto_id)).toBe(true)
            }
            for (const item of rankingsCon.lowRotation) {
              expect(idsOrgA.has(item.producto_id)).toBe(true)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.8 ── Invariante completa: datos de todas las agregaciones dependen solo del tenant
  it(
    "P1.8 — Todas las agregaciones de orgA son independientes de los datos de orgB (invariante global)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          arbCantidad,
          async ({ orgA, orgB }, nA, nB) => {
            resetDB()

            // Sembrar conjunto completo de datos para orgA
            const datosA = sembrarDatosOrg(orgA, nA, nA, nA)

            // Snapshot de todas las agregaciones de orgA antes del ruido de orgB
            const limites = limitesUtc(DESDE_RANGO, HASTA_RANGO, TZ)

            const [valorInventarioSin, clientesSin, fiadoresSin, totalesSin, metricasSin] =
              await Promise.all([
                calcularValorInventario(orgA),
                listarClientes({ organizacion_id: orgA, take: 100 }),
                listarFiadores(orgA),
                totalesDeuda(orgA),
                agregarMetricas(limites, orgA),
              ])

            // Añadir ruido extenso de orgB
            sembrarDatosOrg(orgB, nB + 2, nB + 2, nB + 2)

            // Capturar de nuevo todas las agregaciones de orgA con el ruido presente
            const [valorInventarioCon, clientesCon, fiadoresCon, totalesCon, metricasCon] =
              await Promise.all([
                calcularValorInventario(orgA),
                listarClientes({ organizacion_id: orgA, take: 100 }),
                listarFiadores(orgA),
                totalesDeuda(orgA),
                agregarMetricas(limites, orgA),
              ])

            // Valor de Inventario no cambia (Req 2.5)
            expect(valorInventarioCon.inversion).toBe(valorInventarioSin.inversion)
            expect(valorInventarioCon.recaudacionPotencial).toBe(valorInventarioSin.recaudacionPotencial)

            // Lista de clientes no cambia (Req 4.5)
            expect(clientesCon.total).toBe(clientesSin.total)
            expect(clientesCon.items.length).toBe(clientesSin.items.length)

            // Lista de fiadores no cambia (Req 5.12)
            expect(fiadoresCon.length).toBe(fiadoresSin.length)

            // Totales de deuda no cambian (Req 5.12, 9.7)
            expect(totalesCon.totalClientesConDeuda).toBe(totalesSin.totalClientesConDeuda)
            expect(totalesCon.totalDeudaPendiente).toBe(totalesSin.totalDeudaPendiente)

            // Métricas del dashboard no cambian (Req 1.1, 1.3)
            expect(metricasCon.totalSales).toBe(metricasSin.totalSales)
            expect(metricasCon.totalExpenses).toBe(metricasSin.totalExpenses)
            expect(metricasCon.totalReturns).toBe(metricasSin.totalReturns)
            expect(metricasCon.estimatedProfit).toBe(metricasSin.estimatedProfit)

            // Ningún item de clientes pertenece a orgB (Req 4.5)
            expect(clientesCon.items.every((c: any) => c.organizacion_id === orgA)).toBe(true)
            expect(fiadoresCon.every((f) => f.cliente.organizacion_id === orgA)).toBe(true)

            // Suprimir referencia a datosA para evitar warning de TS
            void datosA
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // P1.9 ── Organización sin datos devuelve ceros/listas vacías (Req 1.6, 2.6, 5.13)
  it(
    "P1.9 — Organización activa sin registros devuelve ceros y listas vacías (Req 1.6, 2.6, 5.13)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbDosOrgs,
          arbCantidadMin1,
          async ({ orgA, orgB }, nB) => {
            resetDB()

            // Solo hay datos de orgB (ruido), orgA está vacía
            sembrarDatosOrg(orgB, nB, nB, nB)

            const limites = limitesUtc(DESDE_RANGO, HASTA_RANGO, TZ)

            const [valorInventario, clientes, fiadores, totales, metricas] = await Promise.all([
              calcularValorInventario(orgA),
              listarClientes({ organizacion_id: orgA, take: 100 }),
              listarFiadores(orgA),
              totalesDeuda(orgA),
              agregarMetricas(limites, orgA),
            ])

            // Req 2.6: sin productos → cero inversión y recaudación
            expect(valorInventario.inversion).toBe(0)
            expect(valorInventario.recaudacionPotencial).toBe(0)

            // Req 4.5: sin clientes → lista vacía
            expect(clientes.total).toBe(0)
            expect(clientes.items.length).toBe(0)

            // Req 5.13: sin clientes con deuda → lista vacía y totales en cero
            expect(fiadores.length).toBe(0)
            expect(totales.totalClientesConDeuda).toBe(0)
            expect(totales.totalDeudaPendiente).toBe(0)

            // Req 1.6: sin ventas → métricas en cero
            expect(metricas.totalSales).toBe(0)
            expect(metricas.totalExpenses).toBe(0)
            expect(metricas.totalReturns).toBe(0)
            expect(metricas.estimatedProfit).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
