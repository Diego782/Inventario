// Feature: gestion-clientes-y-fiadores, Property 22: Ventas fiadas contribuyen a Ventas_Totales solo al saldarse
/**
 * Property 22: Ventas fiadas contribuyen a Ventas_Totales solo al saldarse
 * **Validates: Requirements 9.1, 9.2, 9.3**
 *
 * Para toda venta fiada:
 *   - Su contribución a Ventas_Totales es 0 mientras el Saldo_Deuda del
 *     cliente asociado sea mayor que 0 (incluso con abonos parciales, Req 9.2).
 *   - Su contribución es igual al total de la venta cuando ese saldo llega a 0
 *     (Req 9.3).
 *
 * La propiedad se verifica directamente sobre `agregarMetricas`, que es la
 * función de dominio responsable del cálculo de Ventas_Totales en el rango
 * dado, con los mocks de Prisma que simulan la BD en memoria.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryVenta {
  id: string
  organizacion_id: string
  total: number
  metodo_pago: string
  cliente_id: string | null
  estado: string
  creado_en: Date
}

interface InMemoryVentaItem {
  id: string
  venta_id: string
  organizacion_id: string
  cantidad: number
  producto: { precio_compra: number | null }
  venta: { creado_en: Date; estado: string }
}

interface InMemoryMovimiento {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: "cargo" | "abono"
  monto: number
}

interface InMemoryMovimientoStock {
  id: string
  organizacion_id: string
  tipo: string
  creado_en: Date
  cantidad: number
  producto: { precio_venta: number | null }
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let ventasDB: Map<string, InMemoryVenta>
let itemsDB: Map<string, InMemoryVentaItem>
let movimientosDeudaDB: Map<string, InMemoryMovimiento>
let movimientosStockDB: Map<string, InMemoryMovimientoStock>
let clientesConDeudaDB: Map<string, true>  // IDs de clientes presentes en movimientos
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    venta: { findMany: vi.fn() },
    ventaItem: { findMany: vi.fn() },
    movimientoDeuda: { findMany: vi.fn() },
    movimientoStock: { findMany: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { agregarMetricas, type LimitesUtc } from "@/lib/dominio/metricas"

// ── Rango de fechas que siempre incluye las ventas sembradas ──────────────────

const RANGO_AMPLIO: LimitesUtc = {
  inicio: new Date("2000-01-01T00:00:00.000Z"),
  fin: new Date("2099-12-31T23:59:59.999Z"),
}

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  ventasDB = new Map()
  itemsDB = new Map()
  movimientosDeudaDB = new Map()
  movimientosStockDB = new Map()
  clientesConDeudaDB = new Map()
  idCounter = 0

  /**
   * prisma.venta.findMany — devuelve ventas del tenant dentro del rango,
   * en estado "completada".
   */
  vi.mocked(prisma.venta.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string = where?.organizacion_id
    const desde: Date = where?.creado_en?.gte ?? new Date(0)
    const hasta: Date = where?.creado_en?.lte ?? new Date("2099-12-31")

    return Array.from(ventasDB.values())
      .filter(
        (v) =>
          v.organizacion_id === orgId &&
          v.estado === "completada" &&
          v.creado_en >= desde &&
          v.creado_en <= hasta
      )
      .map((v) => ({
        total: { toString: () => String(v.total) },
        creado_en: v.creado_en,
        metodo_pago: v.metodo_pago,
        cliente_id: v.cliente_id,
      }))
  })

  /**
   * prisma.movimientoDeuda.findMany — devuelve movimientos del tenant
   * filtrados por cliente_id si se proporciona.
   */
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const clienteIds: string[] | undefined = where?.cliente_id?.in

    return Array.from(movimientosDeudaDB.values())
      .filter((m) => {
        if (orgId && m.organizacion_id !== orgId) return false
        if (clienteIds && !clienteIds.includes(m.cliente_id)) return false
        return true
      })
      .map((m) => ({
        cliente_id: m.cliente_id,
        tipo: m.tipo,
        monto: { toString: () => String(m.monto) },
      }))
  })

  /**
   * prisma.ventaItem.findMany — devuelve ítems del tenant cuyas ventas están
   * en estado "completada" dentro del rango.
   */
  vi.mocked(prisma.ventaItem.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string = where?.organizacion_id
    const desde: Date = where?.venta?.creado_en?.gte ?? new Date(0)
    const hasta: Date = where?.venta?.creado_en?.lte ?? new Date("2099-12-31")

    return Array.from(itemsDB.values())
      .filter(
        (i) =>
          i.organizacion_id === orgId &&
          i.venta.estado === "completada" &&
          i.venta.creado_en >= desde &&
          i.venta.creado_en <= hasta
      )
      .map((i) => ({
        cantidad: i.cantidad,
        producto: { precio_compra: i.producto.precio_compra },
        venta: { creado_en: i.venta.creado_en },
      }))
  })

  /**
   * prisma.movimientoStock.findMany — devuelve movimientos de stock del tenant
   * (para devoluciones).
   */
  vi.mocked(prisma.movimientoStock.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string = where?.organizacion_id
    const tipo: string = where?.tipo

    return Array.from(movimientosStockDB.values())
      .filter(
        (ms) => ms.organizacion_id === orgId && ms.tipo === tipo
      )
      .map((ms) => ({
        cantidad: ms.cantidad,
        producto: { precio_venta: ms.producto.precio_venta },
      }))
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarVentaFiada(
  orgId: string,
  clienteId: string,
  total: number
): InMemoryVenta {
  const id = newId("ven")
  const venta: InMemoryVenta = {
    id,
    organizacion_id: orgId,
    total,
    metodo_pago: "fiado",
    cliente_id: clienteId,
    estado: "completada",
    creado_en: new Date("2024-06-15T12:00:00.000Z"),
  }
  ventasDB.set(id, venta)
  return venta
}

function sembrarVentaEfectivo(orgId: string, total: number): InMemoryVenta {
  const id = newId("ven")
  const venta: InMemoryVenta = {
    id,
    organizacion_id: orgId,
    total,
    metodo_pago: "efectivo",
    cliente_id: null,
    estado: "completada",
    creado_en: new Date("2024-06-15T12:00:00.000Z"),
  }
  ventasDB.set(id, venta)
  return venta
}

function sembrarCargo(clienteId: string, orgId: string, monto: number): void {
  const id = newId("mov")
  movimientosDeudaDB.set(id, {
    id,
    organizacion_id: orgId,
    cliente_id: clienteId,
    tipo: "cargo",
    monto,
  })
  clientesConDeudaDB.set(clienteId, true)
}

function sembrarAbono(clienteId: string, orgId: string, monto: number): void {
  const id = newId("mov")
  movimientosDeudaDB.set(id, {
    id,
    organizacion_id: orgId,
    cliente_id: clienteId,
    tipo: "abono",
    monto,
  })
}

/**
 * Calcula el saldo en memoria de un cliente sumando cargos − abonos con
 * redondeo bancario. Replica la lógica de saldoCliente / agregarMetricas.
 */
function saldoEnMemoria(clienteId: string, orgId: string): number {
  const movimientos = Array.from(movimientosDeudaDB.values()).filter(
    (m) => m.cliente_id === clienteId && m.organizacion_id === orgId
  )
  const raw = movimientos.reduce(
    (acc, m) => (m.tipo === "cargo" ? acc + m.monto : acc - m.monto),
    0
  )
  return redondearBancario(raw)
}

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Total de venta en centavos [1, 100000] → monto de [0.01, 1000.00] con 2 dec */
const arbTotal = fc
  .integer({ min: 1, max: 100000 })
  .map((c) => Math.round(c) / 100)

/** Una venta fiada con su total y si está totalmente saldada o no */
const arbVentaFiadaConEstado = fc.record({
  total: arbTotal,
  /**
   * Cuántos abonos parciales se hacen: 0 = sin abonar (saldo > 0),
   * n = abonos parciales (saldo > 0), "total" = se salda completamente.
   */
  estadoSaldo: fc.oneof(
    fc.constant("sin_pagar" as const),
    fc.constant("parcial" as const),
    fc.constant("saldado" as const)
  ),
})

/** Lista de 1–5 ventas fiadas arbitrarias */
const arbVentasFiadas = fc.array(arbVentaFiadaConEstado, { minLength: 1, maxLength: 5 })

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 22: Ventas fiadas contribuyen a Ventas_Totales solo al saldarse", () => {
  it(
    "P22.1 — Venta fiada con saldo > 0: contribución a Ventas_Totales es 0 (Req 9.1)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbTotal,  // total de la venta fiada
          async (orgId, total) => {
            // Reset estado por iteración
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            const clienteId = newId("cli")

            // Venta fiada con saldo pendiente (solo cargo, sin abonar)
            sembrarVentaFiada(orgId, clienteId, total)
            sembrarCargo(clienteId, orgId, total)

            // El saldo debe ser > 0
            expect(saldoEnMemoria(clienteId, orgId)).toBeGreaterThan(0)

            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            // La venta fiada no debe contribuir a totalSales
            expect(totalSales).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P22.2 — Venta fiada con abonos parciales (saldo > 0): contribución sigue siendo 0 (Req 9.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          fc.integer({ min: 2, max: 100000 }).map((c) => Math.round(c) / 100), // total ≥ 0.02
          // Fracción abonada: 10%–90% del total (para que quede saldo > 0)
          fc.integer({ min: 10, max: 90 }),
          async (orgId, total, porcentajeAbonado) => {
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            const clienteId = newId("cli")

            // Calcular abono parcial (deja saldo > 0)
            const abonoRaw = (total * porcentajeAbonado) / 100
            const abono = Math.max(0.01, Math.min(Math.round(abonoRaw * 100) / 100, total - 0.01))

            // Sembrar venta fiada + cargo + abono parcial
            sembrarVentaFiada(orgId, clienteId, total)
            sembrarCargo(clienteId, orgId, total)
            sembrarAbono(clienteId, orgId, abono)

            // Confirmar que el saldo sigue siendo > 0
            const saldo = saldoEnMemoria(clienteId, orgId)
            expect(saldo).toBeGreaterThan(0)

            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            // La venta fiada con saldo pendiente no debe contribuir a totalSales
            expect(totalSales).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P22.3 — Venta fiada completamente saldada (saldo = 0): contribuye con su total a Ventas_Totales (Req 9.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbTotal,  // total de la venta fiada
          async (orgId, total) => {
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            const clienteId = newId("cli")

            // Sembrar venta fiada + cargo + abono completo (saldo = 0)
            sembrarVentaFiada(orgId, clienteId, total)
            sembrarCargo(clienteId, orgId, total)
            sembrarAbono(clienteId, orgId, total)

            // Confirmar que el saldo es exactamente 0
            expect(saldoEnMemoria(clienteId, orgId)).toBe(0)

            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            // La venta saldada debe contribuir con su total a totalSales
            expect(totalSales).toBe(Number(total))
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P22.4 — Mezcla de ventas fiadas: solo contribuyen las completamente saldadas (Req 9.1, 9.2, 9.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),       // organizacion_id
          arbVentasFiadas, // varias ventas con distintos estados de saldo
          async (orgId, ventasData) => {
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            let totalEsperado = 0

            for (const vd of ventasData) {
              const clienteId = newId("cli")

              sembrarVentaFiada(orgId, clienteId, vd.total)
              sembrarCargo(clienteId, orgId, vd.total)

              if (vd.estadoSaldo === "sin_pagar") {
                // Sin abonar: saldo = total > 0 → contribución 0
              } else if (vd.estadoSaldo === "parcial") {
                // Abono parcial del 50%: saldo > 0 → contribución 0
                const abono = Math.max(0.01, Math.round(vd.total * 0.5 * 100) / 100)
                // Garantizar que no se salda completamente
                if (abono < vd.total) {
                  sembrarAbono(clienteId, orgId, abono)
                }
                // Si el abono igualaría el total, ajustar a total - 0.01
                const abonoFinal = abono >= vd.total ? Math.max(0.01, vd.total - 0.01) : abono
                if (abonoFinal < vd.total && abonoFinal >= 0.01) {
                  // El abono ya fue sembrado arriba (si abono < total)
                  // Verificar que el saldo sigue siendo > 0
                }
              } else {
                // saldado: saldo = 0 → contribuye con su total
                sembrarAbono(clienteId, orgId, vd.total)
                totalEsperado += vd.total
              }
            }

            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            // Solo las ventas saldadas contribuyen
            expect(totalSales).toBe(totalEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P22.5 — Ventas no fiadas siempre contribuyen a Ventas_Totales independientemente del estado de deuda (Req 9.1)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbTotal,  // total de la venta en efectivo
          arbTotal,  // total de la venta fiada (con deuda pendiente)
          async (orgId, totalEfectivo, totalFiado) => {
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            // Venta en efectivo: siempre debe contribuir
            sembrarVentaEfectivo(orgId, totalEfectivo)

            // Venta fiada con saldo pendiente: no debe contribuir
            const clienteId = newId("cli")
            sembrarVentaFiada(orgId, clienteId, totalFiado)
            sembrarCargo(clienteId, orgId, totalFiado)

            // El saldo del cliente es > 0
            expect(saldoEnMemoria(clienteId, orgId)).toBeGreaterThan(0)

            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            // Solo la venta en efectivo contribuye
            expect(totalSales).toBe(totalEfectivo)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P22.6 — Propiedad bicondicional: contribución = total ↔ saldo = 0; contribución = 0 ↔ saldo > 0 (Req 9.1, 9.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbTotal,  // total de la venta fiada
          // Fracción del total que se abona: 0% = sin pagar, 100% = saldado, otro = parcial
          fc.integer({ min: 0, max: 100 }),
          async (orgId, total, porcentaje) => {
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            const clienteId = newId("cli")

            sembrarVentaFiada(orgId, clienteId, total)
            sembrarCargo(clienteId, orgId, total)

            let saldoEsperado: number

            if (porcentaje === 0) {
              // Sin abonar: saldo = total
              saldoEsperado = total
            } else if (porcentaje === 100) {
              // Totalmente saldado
              sembrarAbono(clienteId, orgId, total)
              saldoEsperado = 0
            } else {
              // Abono parcial: calcula el abono asegurando que quede saldo > 0
              const abonoRaw = (total * porcentaje) / 100
              const abono = Math.min(
                Math.max(0.01, Math.round(abonoRaw * 100) / 100),
                total - 0.01  // dejar al menos 0.01 de saldo
              )
              if (abono >= 0.01 && abono < total) {
                sembrarAbono(clienteId, orgId, abono)
              }
              saldoEsperado = redondearBancario(total - (abono >= 0.01 && abono < total ? abono : 0))
            }

            const saldoReal = saldoEnMemoria(clienteId, orgId)
            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            if (saldoReal > 0) {
              // Req 9.1, 9.2: Venta fiada con saldo > 0 no contribuye
              expect(totalSales).toBe(0)
            } else {
              // Req 9.3: Venta fiada saldada contribuye con su total
              expect(totalSales).toBe(total)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P22.7 — Venta fiada saldada más venta en efectivo: Ventas_Totales es la suma de ambas (Req 9.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbTotal,  // total venta fiada saldada
          arbTotal,  // total venta en efectivo
          async (orgId, totalFiado, totalEfectivo) => {
            ventasDB.clear()
            itemsDB.clear()
            movimientosDeudaDB.clear()
            movimientosStockDB.clear()
            idCounter = 0

            // Venta fiada completamente saldada
            const clienteId = newId("cli")
            sembrarVentaFiada(orgId, clienteId, totalFiado)
            sembrarCargo(clienteId, orgId, totalFiado)
            sembrarAbono(clienteId, orgId, totalFiado) // saldo = 0

            // Venta en efectivo (siempre contribuye)
            sembrarVentaEfectivo(orgId, totalEfectivo)

            const { totalSales } = await agregarMetricas(RANGO_AMPLIO, orgId)

            // Ambas deben contribuir: suma de los dos totales
            const esperado = totalFiado + totalEfectivo
            expect(totalSales).toBe(esperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
