// Feature: gestion-clientes-y-fiadores, Property 20: Generación de notificaciones idempotente por clave de deduplicación
/**
 * Property 20: Generación de notificaciones idempotente por clave de deduplicación
 * **Validates: Requirements 8.1, 8.11, 8.12**
 *
 * Para toda condición que dispara una notificación (stock cero, stock crítico o
 * vencimiento de deuda), evaluarla repetidamente mientras exista una notificación
 * no leída con la misma clave de deduplicación (organizacion_id + tipo + id de
 * producto/deuda) NO crea notificaciones duplicadas.
 *
 * Concretamente:
 *   - Llamar a `detectarStockCero` N veces con el mismo producto → exactamente 1
 *     notificación `stock_cero` no leída.
 *   - Llamar a `detectarStockCritico` N veces con la misma transición no-Crítico→Crítico
 *     (stock_actual > 0) → exactamente 1 notificación `stock_critico` no leída.
 *   - Llamar a `generarNotificacionesVencimiento` N veces con las mismas ventas vencidas
 *     y saldos positivos → exactamente 1 notificación `vencimiento_deuda` no leída
 *     por venta.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// ── In-memory DB state ───────────────────────────────────────────────────────

interface InMemoryNotificacion {
  id: string
  organizacion_id: string
  tipo: string
  titulo: string
  mensaje: string
  clave_deduplicacion: string | null
  producto_id: string | null
  venta_id: string | null
  leida: boolean
  creado_en: Date
}

interface InMemoryVenta {
  id: string
  organizacion_id: string
  metodo_pago: string
  plazo_deuda: Date | null
  cliente_id: string | null
}

let notificacionesDB: Map<string, InMemoryNotificacion>
let ventasDB: Map<string, InMemoryVenta>
let saldosPorCliente: Map<string, number>
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    notificacion: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    venta: {
      findMany: vi.fn(),
    },
    movimientoDeuda: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// saldoCliente is used by generarNotificacionesVencimiento → mock the whole module
vi.mock("@/lib/dominio/deuda", () => ({
  saldoCliente: vi.fn(),
}))

import { prisma } from "@/lib/db"
import { saldoCliente } from "@/lib/dominio/deuda"
import {
  detectarStockCero,
  detectarStockCritico,
  generarNotificacionesVencimiento,
  claveDedupStockCero,
  claveDedupStockCritico,
  claveDedupVencimientoDeuda,
} from "@/lib/dominio/notificaciones"
import type { EstadoStock } from "@/lib/dominio/notificaciones"

// ── In-memory helpers ─────────────────────────────────────────────────────────

function buildTxMock() {
  /**
   * Minimal TransactionClient proxy that delegates to the same in-memory helpers
   * as the top-level prisma mock. `detectarStockCero` and `detectarStockCritico`
   * call `tx.notificacion.{findFirst, updateMany, create}`.
   */
  return {
    notificacion: {
      findFirst: vi.mocked(prisma.notificacion.findFirst),
      updateMany: vi.mocked(prisma.notificacion.updateMany),
      create: vi.mocked(prisma.notificacion.create),
    },
  }
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  notificacionesDB = new Map()
  ventasDB = new Map()
  saldosPorCliente = new Map()
  idCounter = 0

  // ── prisma.notificacion.findFirst ──────────────────────────────────────────
  vi.mocked(prisma.notificacion.findFirst).mockImplementation(async ({ where }: any) => {
    const clave: string | undefined = where?.clave_deduplicacion
    const leida: boolean | undefined = where?.leida

    for (const n of notificacionesDB.values()) {
      const claveMatch = clave !== undefined ? n.clave_deduplicacion === clave : true
      const leidaMatch = leida !== undefined ? n.leida === leida : true
      if (claveMatch && leidaMatch) {
        return { id: n.id } as any
      }
    }
    return null
  })

  // ── prisma.notificacion.updateMany ─────────────────────────────────────────
  vi.mocked(prisma.notificacion.updateMany).mockImplementation(async ({ where, data }: any) => {
    const clave: string | undefined = where?.clave_deduplicacion
    let count = 0
    for (const [id, n] of notificacionesDB.entries()) {
      if (clave !== undefined && n.clave_deduplicacion !== clave) continue
      notificacionesDB.set(id, { ...n, ...data })
      count++
    }
    return { count }
  })

  // ── prisma.notificacion.create ─────────────────────────────────────────────
  vi.mocked(prisma.notificacion.create).mockImplementation(async ({ data }: any) => {
    const id = newId("notif")
    const notif: InMemoryNotificacion = {
      id,
      organizacion_id: data.organizacion_id,
      tipo: data.tipo,
      titulo: data.titulo,
      mensaje: data.mensaje,
      clave_deduplicacion: data.clave_deduplicacion ?? null,
      producto_id: data.producto_id ?? null,
      venta_id: data.venta_id ?? null,
      leida: data.leida ?? false,
      creado_en: new Date(),
    }
    notificacionesDB.set(id, notif)
    return notif as any
  })

  // ── prisma.venta.findMany ──────────────────────────────────────────────────
  vi.mocked(prisma.venta.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const metodoPago: string | undefined = where?.metodo_pago
    const plazaLte: Date | undefined = where?.plazo_deuda?.lte

    return Array.from(ventasDB.values()).filter((v) => {
      if (orgId && v.organizacion_id !== orgId) return false
      if (metodoPago && v.metodo_pago !== metodoPago) return false
      if (plazaLte && v.plazo_deuda && v.plazo_deuda > plazaLte) return false
      if (plazaLte && !v.plazo_deuda) return false
      if (where?.cliente_id?.not === null && v.cliente_id === null) return false
      return true
    }) as any
  })

  // ── saldoCliente mock ──────────────────────────────────────────────────────
  vi.mocked(saldoCliente).mockImplementation(async (clienteId: string) => {
    return saldosPorCliente.get(clienteId) ?? 0
  })
})

// ── Generadores ───────────────────────────────────────────────────────────────

/** Número de repeticiones entre 2 y 5. */
const arbRepeticiones = fc.integer({ min: 2, max: 5 })

/** stock_actual > 0 pero que cumpla el criterio Crítico: stock <= minimo * 0.3 */
const arbStockCriticoNoZero = fc.record({
  stockMinimo: fc.integer({ min: 10, max: 1000 }),
}).chain(({ stockMinimo }) =>
  fc.record({
    stockMinimo: fc.constant(stockMinimo),
    // stock_actual en (0, stockMinimo * 0.3] garantiza estado Crítico sin ser 0
    stockActual: fc.integer({ min: 1, max: Math.max(1, Math.floor(stockMinimo * 0.3)) }),
  })
)

// ── Helpers ───────────────────────────────────────────────────────────────────

function contarNotifNoLeidas(clave: string): number {
  let count = 0
  for (const n of notificacionesDB.values()) {
    if (n.clave_deduplicacion === clave && !n.leida) count++
  }
  return count
}

function contarNotifTotales(clave: string): number {
  let count = 0
  for (const n of notificacionesDB.values()) {
    if (n.clave_deduplicacion === clave) count++
  }
  return count
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 20: Generación de notificaciones idempotente por clave de deduplicación", () => {
  it(
    "P20.1 — detectarStockCero N veces con el mismo producto → exactamente 1 notificación stock_cero no leída (Req 8.1, 8.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),    // organizacion_id
          fc.uuid(),    // producto_id
          arbRepeticiones,
          async (orgId, productoId, repeticiones) => {
            notificacionesDB.clear()
            idCounter = 0

            const tx = buildTxMock() as any
            const params = {
              producto_id: productoId,
              nombre: "Producto Test",
              stock_actual: 0,  // stock_cero se dispara cuando stock_actual === 0
              organizacion_id: orgId,
            }

            // Invocar N veces con los mismos parámetros mientras no hay lectura
            for (let i = 0; i < repeticiones; i++) {
              await detectarStockCero(tx, params)
            }

            const clave = claveDedupStockCero(productoId)
            // Req 8.12: debe existir exactamente 1 notificación no leída con esa clave
            expect(contarNotifNoLeidas(clave)).toBe(1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.2 — detectarStockCero no crea nueva notificación si ya existe una no leída (Req 8.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),    // organizacion_id
          fc.uuid(),    // producto_id
          arbRepeticiones,
          async (orgId, productoId, repeticiones) => {
            notificacionesDB.clear()
            idCounter = 0

            const tx = buildTxMock() as any
            const params = {
              producto_id: productoId,
              nombre: "Producto Test",
              stock_actual: 0,
              organizacion_id: orgId,
            }

            // Primera llamada: crea la notificación
            await detectarStockCero(tx, params)
            const totalTrasUna = notificacionesDB.size
            expect(totalTrasUna).toBe(1)

            // Llamadas adicionales: el total de notificaciones no aumenta
            for (let i = 1; i < repeticiones; i++) {
              await detectarStockCero(tx, params)
            }

            expect(notificacionesDB.size).toBe(1)
            const clave = claveDedupStockCero(productoId)
            expect(contarNotifNoLeidas(clave)).toBe(1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.3 — detectarStockCritico N veces con mismo producto y transición → exactamente 1 notificación stock_critico no leída (Req 8.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),    // organizacion_id
          fc.uuid(),    // producto_id
          arbStockCriticoNoZero,
          arbRepeticiones,
          async (orgId, productoId, { stockActual, stockMinimo }, repeticiones) => {
            notificacionesDB.clear()
            idCounter = 0

            const tx = buildTxMock() as any
            const params = {
              producto_id: productoId,
              nombre: "Producto Test",
              stock_actual: stockActual,
              stock_minimo: stockMinimo,
              organizacion_id: orgId,
            }

            // estadoPrevio = "En Stock" → desencadena la transición a Crítico
            const estadoPrevio: EstadoStock = "En Stock"

            for (let i = 0; i < repeticiones; i++) {
              await detectarStockCritico(tx, params, estadoPrevio)
            }

            const clave = claveDedupStockCritico(productoId)
            // Req 8.12: exactamente 1 notificación no leída con esa clave
            expect(contarNotifNoLeidas(clave)).toBe(1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.4 — detectarStockCritico no crea nueva notificación si ya existe una no leída (Req 8.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          arbStockCriticoNoZero,
          arbRepeticiones,
          async (orgId, productoId, { stockActual, stockMinimo }, repeticiones) => {
            notificacionesDB.clear()
            idCounter = 0

            const tx = buildTxMock() as any
            const params = {
              producto_id: productoId,
              nombre: "Producto Test",
              stock_actual: stockActual,
              stock_minimo: stockMinimo,
              organizacion_id: orgId,
            }

            const estadoPrevio: EstadoStock = "En Stock"

            // Primera llamada: crea la notificación
            await detectarStockCritico(tx, params, estadoPrevio)
            expect(notificacionesDB.size).toBe(1)

            // Llamadas adicionales: sin nuevas notificaciones
            for (let i = 1; i < repeticiones; i++) {
              await detectarStockCritico(tx, params, estadoPrevio)
            }

            expect(notificacionesDB.size).toBe(1)
            const clave = claveDedupStockCritico(productoId)
            expect(contarNotifNoLeidas(clave)).toBe(1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.5 — generarNotificacionesVencimiento N veces → exactamente 1 notificación vencimiento_deuda no leída por venta (Req 8.7, 8.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),    // organizacion_id
          fc.uuid(),    // venta_id
          fc.uuid(),    // cliente_id
          arbRepeticiones,
          async (orgId, ventaId, clienteId, repeticiones) => {
            notificacionesDB.clear()
            ventasDB.clear()
            saldosPorCliente.clear()
            idCounter = 0

            // Sembrar venta fiada con plazo vencido
            const ahora = new Date()
            const plazoVencido = new Date(ahora.getTime() - 24 * 60 * 60 * 1000) // ayer
            ventasDB.set(ventaId, {
              id: ventaId,
              organizacion_id: orgId,
              metodo_pago: "fiado",
              plazo_deuda: plazoVencido,
              cliente_id: clienteId,
            })

            // El cliente tiene saldo positivo
            saldosPorCliente.set(clienteId, 100)

            // Invocar N veces
            for (let i = 0; i < repeticiones; i++) {
              await generarNotificacionesVencimiento(orgId)
            }

            const clave = claveDedupVencimientoDeuda(ventaId)
            // Req 8.12: exactamente 1 notificación no leída con esa clave
            expect(contarNotifNoLeidas(clave)).toBe(1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.6 — generarNotificacionesVencimiento no crea duplicado mientras la notificación no leída persiste (Req 8.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // 1–3 ventas fiadas vencidas con saldo positivo
          fc.array(
            fc.record({ ventaId: fc.uuid(), clienteId: fc.uuid() }),
            { minLength: 1, maxLength: 3 }
          ),
          arbRepeticiones,
          async (orgId, ventas, repeticiones) => {
            notificacionesDB.clear()
            ventasDB.clear()
            saldosPorCliente.clear()
            idCounter = 0

            const ahora = new Date()
            const plazoVencido = new Date(ahora.getTime() - 24 * 60 * 60 * 1000)

            for (const { ventaId, clienteId } of ventas) {
              ventasDB.set(ventaId, {
                id: ventaId,
                organizacion_id: orgId,
                metodo_pago: "fiado",
                plazo_deuda: plazoVencido,
                cliente_id: clienteId,
              })
              saldosPorCliente.set(clienteId, 50)
            }

            // Invocar N veces
            for (let i = 0; i < repeticiones; i++) {
              await generarNotificacionesVencimiento(orgId)
            }

            // Invariante: exactamente 1 notificación no leída por venta (sin duplicados)
            for (const { ventaId } of ventas) {
              const clave = claveDedupVencimientoDeuda(ventaId)
              expect(contarNotifNoLeidas(clave)).toBe(1)
            }

            // Total de notificaciones no leídas = número de ventas únicas
            const uniqueVentas = new Set(ventas.map((v) => v.ventaId)).size
            const totalNoLeidas = Array.from(notificacionesDB.values()).filter(
              (n) => !n.leida
            ).length
            expect(totalNoLeidas).toBe(uniqueVentas)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.7 — clave de dedupe incluye tipo e id de producto/venta: distintos productos/ventas generan notificaciones distintas (Req 8.11)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),    // productoId A
          fc.uuid(),    // productoId B
          async (orgId, productoIdA, productoIdB) => {
            // Las dos IDs deben ser distintas
            fc.pre(productoIdA !== productoIdB)

            notificacionesDB.clear()
            idCounter = 0

            const tx = buildTxMock() as any

            // Disparar stock_cero para dos productos distintos
            await detectarStockCero(tx, {
              producto_id: productoIdA,
              nombre: "Producto A",
              stock_actual: 0,
              organizacion_id: orgId,
            })
            await detectarStockCero(tx, {
              producto_id: productoIdB,
              nombre: "Producto B",
              stock_actual: 0,
              organizacion_id: orgId,
            })

            // Cada producto debe tener exactamente 1 notificación no leída con su propia clave
            const claveA = claveDedupStockCero(productoIdA)
            const claveB = claveDedupStockCero(productoIdB)

            expect(contarNotifNoLeidas(claveA)).toBe(1)
            expect(contarNotifNoLeidas(claveB)).toBe(1)

            // Las claves son distintas (Req 8.11)
            expect(claveA).not.toBe(claveB)
            expect(notificacionesDB.size).toBe(2)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P20.8 — productos distintos dentro de la misma organización generan claves de dedupe distintas (Req 8.11)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),    // organizacion_id
          fc.uniqueArray(fc.uuid(), { minLength: 2, maxLength: 4 }),  // productoIds distintos
          async (orgId, productoIds) => {
            notificacionesDB.clear()
            idCounter = 0

            const tx = buildTxMock() as any

            // Disparar stock_cero para cada producto distinto
            for (const productoId of productoIds) {
              await detectarStockCero(tx, {
                producto_id: productoId,
                nombre: `Producto ${productoId}`,
                stock_actual: 0,
                organizacion_id: orgId,
              })
            }

            // Cada producto debe tener exactamente 1 notificación no leída con su propia clave
            for (const productoId of productoIds) {
              const clave = claveDedupStockCero(productoId)
              expect(contarNotifNoLeidas(clave)).toBe(1)
            }

            // Las claves son distintas entre sí (Req 8.11: id de producto es parte de la clave)
            const claves = productoIds.map(claveDedupStockCero)
            const clavesUnicas = new Set(claves)
            expect(clavesUnicas.size).toBe(productoIds.length)

            // Total de notificaciones = número de productos distintos
            expect(notificacionesDB.size).toBe(productoIds.length)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
