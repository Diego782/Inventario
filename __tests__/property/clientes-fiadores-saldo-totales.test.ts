// Feature: gestion-clientes-y-fiadores, Property 11: Definición de saldo y conjunto de fiadores
/**
 * Property 11: Definición de saldo y conjunto de fiadores
 * **Validates: Requirements 5.1, 5.3, 5.4, 5.5, 5.6, 5.10, 5.13**
 *
 * Para todo conjunto de MovimientoDeuda aleatorios de una organización:
 *   - El Saldo_Deuda de cada cliente es `redondearBancario(Σ cargos − Σ abonos)`.
 *   - La lista de fiadores contiene exactamente los clientes con saldo > 0.
 *   - Total_Clientes_Con_Deuda es la cardinalidad de esa lista.
 *   - Total_Deuda_Pendiente es `redondearBancario` de la suma de esos saldos.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ── In-memory types ──────────────────────────────────────────────────────────

type TipoMovimiento = "cargo" | "abono"

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

interface InMemoryMovimiento {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: TipoMovimiento
  /** Stored as a number; cast with Number() matches Prisma Decimal behavior */
  monto: number
  venta_id: string | null
  plazo_deuda: Date | null
  fecha: Date
  creado_en: Date
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let clientesDB: Map<string, InMemoryCliente>
let movimientosDB: Map<string, InMemoryMovimiento>
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    cliente: {
      findMany: vi.fn(),
    },
    movimientoDeuda: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"
import {
  saldoCliente,
  listarFiadores,
  totalesDeuda,
} from "@/lib/dominio/deuda"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  movimientosDB = new Map()
  idCounter = 0

  /**
   * prisma.cliente.findMany — devuelve los clientes del tenant incluyendo
   * sus movimientos de deuda (para listarFiadores).
   */
  vi.mocked(prisma.cliente.findMany).mockImplementation(async ({ where, include }: any) => {
    const orgId: string = where?.organizacion_id
    const clientes = Array.from(clientesDB.values()).filter(
      (c) => c.organizacion_id === orgId
    )

    if (include?.movimientos_deuda) {
      const movWhere = include.movimientos_deuda?.where ?? {}
      return clientes.map((c) => {
        const movs = Array.from(movimientosDB.values()).filter(
          (m) =>
            m.cliente_id === c.id &&
            (movWhere.organizacion_id ? m.organizacion_id === movWhere.organizacion_id : true)
        )
        return {
          ...c,
          movimientos_deuda: movs.map((m) => ({
            tipo: m.tipo,
            // Return as plain number — deuda.ts calls Number(m.monto) which works on numbers
            monto: m.monto,
          })),
        }
      })
    }

    return clientes
  })

  /**
   * prisma.movimientoDeuda.findMany — devuelve movimientos del tenant,
   * opcionalmente filtrados por cliente.
   */
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const clienteId: string | undefined = where?.cliente_id

    return Array.from(movimientosDB.values()).filter((m) => {
      if (orgId && m.organizacion_id !== orgId) return false
      if (clienteId && m.cliente_id !== clienteId) return false
      return true
    })
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarCliente(orgId: string): InMemoryCliente {
  const id = newId("cli")
  const cliente: InMemoryCliente = {
    id,
    organizacion_id: orgId,
    cedula: `CED${id.slice(-5)}`,
    nombre: `Cliente ${id}`,
    telefono: "1234567",
    correo: null,
    direccion: null,
    creado_en: new Date(),
    actualizado_en: new Date(),
  }
  clientesDB.set(id, cliente)
  return cliente
}

function sembrarMovimiento(
  clienteId: string,
  orgId: string,
  tipo: TipoMovimiento,
  monto: number
): InMemoryMovimiento {
  const id = newId("mov")
  const mov: InMemoryMovimiento = {
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
  movimientosDB.set(id, mov)
  return mov
}

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Monto monetario positivo con hasta 2 decimales, en el rango [0.01, 9999.99]. */
const arbMonto = fc
  .integer({ min: 1, max: 999999 })
  .map((n) => Math.round(n) / 100)

/** Un movimiento individual: tipo y monto. */
const arbMovimiento = fc.record({
  tipo: fc.oneof(fc.constant("cargo" as TipoMovimiento), fc.constant("abono" as TipoMovimiento)),
  monto: arbMonto,
})

/** Lista de movimientos para un cliente: 0–8 movimientos. */
const arbMovimientosList = fc.array(arbMovimiento, { minLength: 0, maxLength: 8 })

/** Datos de un cliente con sus movimientos. */
const arbClienteConMovimientos = fc.record({
  movimientos: arbMovimientosList,
})

/** Conjunto de 1–6 clientes con sus movimientos. */
const arbClientes = fc.array(arbClienteConMovimientos, { minLength: 1, maxLength: 6 })

// ── Función auxiliar: calcular saldo esperado a partir de movimientos ────────

function calcularSaldoEsperado(
  movimientos: Array<{ tipo: TipoMovimiento; monto: number }>
): number {
  const raw = movimientos.reduce((acc, m) => {
    return m.tipo === "cargo" ? acc + m.monto : acc - m.monto
  }, 0)
  return redondearBancario(raw)
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 11: Definición de saldo y conjunto de fiadores", () => {
  it(
    "P11.1 — Saldo de cada cliente es redondearBancario(Σ cargos − Σ abonos) (Req 5.3, 5.10)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            // Reset estado por iteración
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // Sembrar clientes y sus movimientos
            const clientesSembrados = clientesData.map((cd) => {
              const cliente = sembrarCliente(orgId)
              for (const mov of cd.movimientos) {
                sembrarMovimiento(cliente.id, orgId, mov.tipo, mov.monto)
              }
              return { cliente, movimientos: cd.movimientos }
            })

            // Verificar el saldo de cada cliente
            for (const { cliente, movimientos } of clientesSembrados) {
              const saldo = await saldoCliente(cliente.id, orgId)
              const saldoEsperado = calcularSaldoEsperado(movimientos)
              expect(saldo).toBe(saldoEsperado)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P11.2 — Lista de fiadores contiene exactamente los clientes con saldo > 0 (Req 5.1, 5.10, 5.13)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // Sembrar y registrar el saldo esperado de cada cliente
            const esperados: Array<{ clienteId: string; saldo: number }> = []

            for (const cd of clientesData) {
              const cliente = sembrarCliente(orgId)
              for (const mov of cd.movimientos) {
                sembrarMovimiento(cliente.id, orgId, mov.tipo, mov.monto)
              }
              const saldo = calcularSaldoEsperado(cd.movimientos)
              esperados.push({ clienteId: cliente.id, saldo })
            }

            const fiadores = await listarFiadores(orgId)

            // Los IDs de los fiadores devueltos
            const idsFiadores = new Set(fiadores.map((f) => f.cliente.id))

            // Los IDs de clientes que esperamos con saldo > 0
            const idsConDeuda = new Set(
              esperados.filter((e) => e.saldo > 0).map((e) => e.clienteId)
            )

            // La lista debe coincidir exactamente: mismos IDs, sin más ni menos
            expect(idsFiadores).toEqual(idsConDeuda)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P11.3 — Total_Clientes_Con_Deuda es la cardinalidad de la lista de fiadores (Req 5.4, 5.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const esperados: Array<{ clienteId: string; saldo: number }> = []

            for (const cd of clientesData) {
              const cliente = sembrarCliente(orgId)
              for (const mov of cd.movimientos) {
                sembrarMovimiento(cliente.id, orgId, mov.tipo, mov.monto)
              }
              const saldo = calcularSaldoEsperado(cd.movimientos)
              esperados.push({ clienteId: cliente.id, saldo })
            }

            const { totalClientesConDeuda } = await totalesDeuda(orgId)

            // Contar los que tienen saldo > 0
            const cardinalidadEsperada = esperados.filter((e) => e.saldo > 0).length

            expect(totalClientesConDeuda).toBe(cardinalidadEsperada)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P11.4 — Total_Deuda_Pendiente es redondearBancario de la suma de saldos positivos (Req 5.5, 5.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldosPositivos: number[] = []

            for (const cd of clientesData) {
              const cliente = sembrarCliente(orgId)
              for (const mov of cd.movimientos) {
                sembrarMovimiento(cliente.id, orgId, mov.tipo, mov.monto)
              }
              const saldo = calcularSaldoEsperado(cd.movimientos)
              if (saldo > 0) {
                saldosPositivos.push(saldo)
              }
            }

            const { totalDeudaPendiente } = await totalesDeuda(orgId)

            const totalEsperado = redondearBancario(
              saldosPositivos.reduce((acc, s) => acc + s, 0)
            )

            expect(totalDeudaPendiente).toBe(totalEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P11.5 — Sin clientes con deuda: lista vacía y totales en cero (Req 5.13)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          // Clientes sin movimientos (saldo siempre 0)
          fc.array(fc.constant(null), { minLength: 0, maxLength: 5 }),
          async (orgId, slots) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // Sembrar clientes sin ningún movimiento de deuda
            for (let i = 0; i < slots.length; i++) {
              sembrarCliente(orgId)
            }

            const fiadores = await listarFiadores(orgId)
            expect(fiadores).toHaveLength(0)

            const { totalClientesConDeuda, totalDeudaPendiente } =
              await totalesDeuda(orgId)
            expect(totalClientesConDeuda).toBe(0)
            expect(totalDeudaPendiente).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P11.6 — El saldo expuesto en la lista de fiadores coincide con el saldo calculado individualmente (Req 5.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const mapaEsperado = new Map<string, number>()

            for (const cd of clientesData) {
              const cliente = sembrarCliente(orgId)
              for (const mov of cd.movimientos) {
                sembrarMovimiento(cliente.id, orgId, mov.tipo, mov.monto)
              }
              const saldo = calcularSaldoEsperado(cd.movimientos)
              mapaEsperado.set(cliente.id, saldo)
            }

            const fiadores = await listarFiadores(orgId)

            // Para cada fiador, el saldo devuelto coincide con el calculado individualmente
            for (const f of fiadores) {
              const saldoEsperado = mapaEsperado.get(f.cliente.id) ?? 0
              expect(f.saldo).toBe(saldoEsperado)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
