// Feature: gestion-clientes-y-fiadores, Property 13: Abono válido decrementa el saldo; inválido no altera nada
/**
 * Property 13: Abono válido decrementa el saldo; inválido no altera nada
 * **Validates: Requirements 5.7, 5.8, 5.9**
 *
 * Para todo cliente con saldo positivo y todo monto de abono arbitrario:
 *   - Si el monto ∈ [0.01, saldo_actual] con ≤2 decimales, el abono se
 *     registra y el nuevo saldo es exactamente redondearBancario(saldo_actual − monto).
 *   - En caso contrario (monto < 0.01 o monto > saldo_actual) se rechaza con
 *     AbonoInvalidoError y el saldo permanece sin cambios.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { AbonoInvalidoError, ClienteNoEncontradoError } from "@/lib/api/errores"
import { registrarAbono } from "@/lib/dominio/deuda"
import { redondearBancario } from "@/lib/money"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryCliente {
  id: string
  organizacion_id: string
}

interface InMemoryMovimiento {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: "cargo" | "abono"
  monto: number
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let clientesDB: Map<string, InMemoryCliente>
let movimientosDB: Map<string, InMemoryMovimiento>
let idCounter: number

function newId(prefix = "id"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    cliente: {
      findFirst: vi.fn(),
    },
    movimientoDeuda: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  movimientosDB = new Map()
  idCounter = 0

  /**
   * prisma.cliente.findFirst — busca cliente por id y organizacion_id.
   */
  vi.mocked(prisma.cliente.findFirst).mockImplementation(async ({ where }: any) => {
    for (const c of clientesDB.values()) {
      if (c.id === where?.id && c.organizacion_id === where?.organizacion_id) {
        return { id: c.id } as any
      }
    }
    return null
  })

  /**
   * prisma.movimientoDeuda.findMany — devuelve movimientos filtrados por
   * cliente_id y organizacion_id, reflejando el comportamiento de saldoCliente.
   */
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where }: any) => {
    return Array.from(movimientosDB.values())
      .filter(
        (m) =>
          (where?.cliente_id === undefined || m.cliente_id === where.cliente_id) &&
          (where?.organizacion_id === undefined || m.organizacion_id === where.organizacion_id)
      )
      .map((m) => ({ tipo: m.tipo, monto: { toString: () => String(m.monto) } })) as any
  })

  /**
   * prisma.movimientoDeuda.create — persiste el abono en memoria y devuelve el
   * movimiento creado.
   */
  vi.mocked(prisma.movimientoDeuda.create).mockImplementation(async ({ data }: any) => {
    const id = newId("mov")
    const movimiento: InMemoryMovimiento = {
      id,
      organizacion_id: data.organizacion_id,
      cliente_id: data.cliente_id,
      tipo: data.tipo,
      monto: Number(data.monto),
    }
    movimientosDB.set(id, movimiento)
    return { ...movimiento, monto: { toString: () => String(movimiento.monto) } } as any
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarCliente(orgId: string, clienteId?: string): InMemoryCliente {
  const id = clienteId ?? newId("cli")
  const cliente: InMemoryCliente = { id, organizacion_id: orgId }
  clientesDB.set(id, cliente)
  return cliente
}

function sembrarCargo(clienteId: string, orgId: string, monto: number): void {
  const id = newId("cargo")
  movimientosDB.set(id, { id, organizacion_id: orgId, cliente_id: clienteId, tipo: "cargo", monto })
}

function sembrarAbono(clienteId: string, orgId: string, monto: number): void {
  const id = newId("abo")
  movimientosDB.set(id, { id, organizacion_id: orgId, cliente_id: clienteId, tipo: "abono", monto })
}

/** Calcula el saldo actual en memoria (replica saldoCliente sin BD). */
function saldoEnMemoria(clienteId: string, orgId: string): number {
  const movimientos = Array.from(movimientosDB.values()).filter(
    (m) => m.cliente_id === clienteId && m.organizacion_id === orgId
  )
  const raw = movimientos.reduce(
    (acc, m) => (m.tipo === "cargo" ? acc + m.monto : acc - m.monto),
    0
  )
  return redondearBancario(raw)
}

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Monto con hasta 2 decimales en el rango [0.01, 9999.99]. */
const arbMonto2Dec = fc
  .integer({ min: 1, max: 999999 })
  .map((centavos) => Math.round(centavos) / 100)

/**
 * Genera un par (saldoBase, montoAbono) donde saldoBase ∈ [0.02, 500]
 * para garantizar que siempre haya espacio para un abono válido e inválido.
 */
const arbSaldoYAbono = fc
  .integer({ min: 2, max: 50000 }) // centavos del saldo, 0.02–500
  .chain((saldoCentavos) => {
    const saldo = saldoCentavos / 100
    return fc.tuple(
      fc.constant(saldo),
      // Monto arbitrario: puede ser válido (≤ saldo) o inválido (> saldo o < 0.01)
      arbMonto2Dec
    )
  })

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 13: Abono válido decrementa el saldo; inválido no altera nada", () => {
  it(
    "P13.1 — Monto válido [0.01, saldo_actual]: abono se registra y nuevo saldo = saldo_actual − monto (Req 5.7, 5.8, 5.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.integer({ min: 1, max: 50000 }), // saldo en centavos [0.01, 500]
          async (orgId, saldoCentavos) => {
            // Setup fresco por iteración
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldo = saldoCentavos / 100
            const cliente = sembrarCliente(orgId)
            sembrarCargo(cliente.id, orgId, saldo)

            // Monto válido: usar exactamente el saldo (caso límite superior) o la mitad
            const monto = redondearBancario(saldo / 2 < 0.01 ? saldo : saldo / 2)
            // Garantizar que sea al menos 0.01 y no supere el saldo
            const montoFinal = Math.max(0.01, Math.min(monto, saldo))
            // Redondear a 2 decimales para respetar la restricción
            const montoRedondeado = Math.round(montoFinal * 100) / 100

            const saldoAntes = saldoEnMemoria(cliente.id, orgId)

            const resultado = await registrarAbono(
              { cliente_id: cliente.id, monto: montoRedondeado },
              orgId
            )

            // El movimiento fue creado
            expect(resultado.movimiento).toBeDefined()
            expect(resultado.movimiento.tipo).toBe("abono")

            // El nuevo saldo es exactamente saldo_actual − monto (con redondeo bancario)
            const saldoEsperado = redondearBancario(saldoAntes - montoRedondeado)
            expect(resultado.saldo).toBe(saldoEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P13.2 — Monto = saldo_actual (límite superior exacto): abono se acepta y saldo queda en 0 (Req 5.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 50000 }), // saldo en centavos [0.01, 500]
          async (orgId, saldoCentavos) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldo = saldoCentavos / 100
            const cliente = sembrarCliente(orgId)
            sembrarCargo(cliente.id, orgId, saldo)

            // Abonar exactamente el saldo
            const resultado = await registrarAbono(
              { cliente_id: cliente.id, monto: saldo },
              orgId
            )

            expect(resultado.movimiento).toBeDefined()
            expect(resultado.saldo).toBe(0)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P13.3 — Monto > saldo_actual: se rechaza con AbonoInvalidoError y el saldo no cambia (Req 5.8)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 50000 }),   // saldo en centavos [0.01, 500]
          fc.integer({ min: 1, max: 10000 }),    // exceso en centavos [0.01, 100]
          async (orgId, saldoCentavos, excesoCentavos) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldo = saldoCentavos / 100
            const cliente = sembrarCliente(orgId)
            sembrarCargo(cliente.id, orgId, saldo)

            const montoInvalido = redondearBancario(saldo + excesoCentavos / 100)
            const movimientosAntes = movimientosDB.size

            await expect(
              registrarAbono({ cliente_id: cliente.id, monto: montoInvalido }, orgId)
            ).rejects.toThrow(AbonoInvalidoError)

            // El saldo no cambió: no se crearon movimientos nuevos
            expect(movimientosDB.size).toBe(movimientosAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P13.4 — Monto < 0.01: se rechaza con AbonoInvalidoError y el saldo no cambia (Req 5.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 50000 }), // saldo en centavos [0.01, 500]
          // Monto inválido por ser menor que 0.01: [-100, 0] en centavos → [-1, 0.00]
          fc.integer({ min: -10000, max: 0 }).map((c) => c / 100),
          async (orgId, saldoCentavos, montoInvalido) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldo = saldoCentavos / 100
            const cliente = sembrarCliente(orgId)
            sembrarCargo(cliente.id, orgId, saldo)

            const movimientosAntes = movimientosDB.size

            await expect(
              registrarAbono({ cliente_id: cliente.id, monto: montoInvalido }, orgId)
            ).rejects.toThrow(AbonoInvalidoError)

            // El saldo no cambió: no se crearon movimientos nuevos
            expect(movimientosDB.size).toBe(movimientosAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P13.5 — Propiedad bicondicional completa: monto ∈ [0.01, saldo_actual] ↔ abono aceptado; fuera del rango ↔ rechazado (Req 5.7, 5.8, 5.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 2, max: 50000 }), // saldo en centavos ≥ 0.02 para tener margen
          arbMonto2Dec,                         // monto arbitrario con ≤2 decimales
          async (orgId, saldoCentavos, monto) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldo = saldoCentavos / 100
            const cliente = sembrarCliente(orgId)
            sembrarCargo(cliente.id, orgId, saldo)

            const saldoAntes = saldoEnMemoria(cliente.id, orgId)
            const esValido = monto >= 0.01 && monto <= saldoAntes
            const movimientosAntes = movimientosDB.size

            if (esValido) {
              const resultado = await registrarAbono(
                { cliente_id: cliente.id, monto },
                orgId
              )

              // Abono registrado
              expect(resultado.movimiento).toBeDefined()
              expect(resultado.movimiento.tipo).toBe("abono")

              // Nuevo saldo = saldo_anterior − monto (con redondeo bancario)
              const saldoEsperado = redondearBancario(saldoAntes - monto)
              expect(resultado.saldo).toBe(saldoEsperado)
            } else {
              // Monto inválido: debe rechazarse y el saldo no debe cambiar
              await expect(
                registrarAbono({ cliente_id: cliente.id, monto }, orgId)
              ).rejects.toThrow(AbonoInvalidoError)

              // No se persistió ningún movimiento nuevo
              expect(movimientosDB.size).toBe(movimientosAntes)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P13.6 — Cliente de otro tenant es rechazado con ClienteNoEncontradoError y no se altera el saldo (Req 5.11)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          fc.integer({ min: 1, max: 50000 }),
          async (orgA, orgB, saldoCentavos) => {
            fc.pre(orgA !== orgB)

            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldo = saldoCentavos / 100
            const cliente = sembrarCliente(orgA)
            sembrarCargo(cliente.id, orgA, saldo)

            const movimientosAntes = movimientosDB.size

            // Intentar abonar usando orgB (distinto tenant)
            await expect(
              registrarAbono({ cliente_id: cliente.id, monto: 0.01 }, orgB)
            ).rejects.toThrow(ClienteNoEncontradoError)

            // No se creó ningún movimiento
            expect(movimientosDB.size).toBe(movimientosAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P13.7 — Abono parcial iterativo: cada abono válido reduce el saldo exactamente en el monto abonado (Req 5.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 10, max: 10000 }), // saldo inicial en centavos [0.10, 100]
          fc.integer({ min: 2, max: 5 }),        // cantidad de abonos parciales
          async (orgId, saldoCentavos, numAbonos) => {
            clientesDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const saldoInicial = saldoCentavos / 100
            const cliente = sembrarCliente(orgId)
            sembrarCargo(cliente.id, orgId, saldoInicial)

            let saldoActual = saldoEnMemoria(cliente.id, orgId)

            for (let i = 0; i < numAbonos; i++) {
              // Dividir el saldo restante en partes iguales y abonar una parte
              // Garantizamos que el monto es ≥ 0.01 y ≤ saldo actual
              const montoAbono = Math.round((saldoActual / (numAbonos - i)) * 100) / 100
              if (montoAbono < 0.01 || montoAbono > saldoActual) break

              const saldoAntes = saldoActual
              const resultado = await registrarAbono(
                { cliente_id: cliente.id, monto: montoAbono },
                orgId
              )

              const saldoEsperado = redondearBancario(saldoAntes - montoAbono)
              expect(resultado.saldo).toBe(saldoEsperado)

              // Actualizar el saldo para la siguiente iteración usando la BD en memoria
              saldoActual = saldoEnMemoria(cliente.id, orgId)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
