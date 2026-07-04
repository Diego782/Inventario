// Feature: gestion-clientes-y-fiadores, Property 9: Borrado de Cliente protegido por historial
/**
 * Property 9: Borrado de Cliente protegido por historial
 * **Validates: Requirements 4.8, 4.9**
 *
 * La eliminación de un Cliente tiene éxito si y solo si el cliente no tiene
 * ninguna `Venta` ni `MovimientoDeuda` asociados. Si tiene historial (al menos
 * una Venta o un MovimientoDeuda), la eliminación se rechaza con
 * `ClienteConHistorialError` y el cliente permanece en la base de datos.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { ClienteConHistorialError, ClienteNoEncontradoError } from "@/lib/api/errores"
import { eliminarCliente } from "@/lib/dominio/clientes"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryCliente {
  id: string
  organizacion_id: string
  cedula: string
  nombre: string
  telefono: string
  correo: string | null
  direccion: string | null
}

interface InMemoryVenta {
  id: string
  cliente_id: string
}

interface InMemoryMovimientoDeuda {
  id: string
  cliente_id: string
  organizacion_id: string
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let clientesDB: Map<string, InMemoryCliente>
let ventasDB: Map<string, InMemoryVenta>
let movimientosDB: Map<string, InMemoryMovimientoDeuda>
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    cliente: {
      findFirst: vi.fn(),
      delete: vi.fn(),
    },
    venta: {
      count: vi.fn(),
    },
    movimientoDeuda: {
      count: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  ventasDB = new Map()
  movimientosDB = new Map()
  idCounter = 0

  /**
   * prisma.cliente.findFirst — verifica que el cliente exista y pertenezca al tenant.
   * Refleja la implementación de eliminarCliente en clientes.ts.
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
   * prisma.venta.count — cuenta ventas del cliente.
   */
  vi.mocked(prisma.venta.count).mockImplementation(async ({ where }: any) => {
    const clienteId = where?.cliente_id
    if (!clienteId) return 0
    return Array.from(ventasDB.values()).filter((v) => v.cliente_id === clienteId).length
  })

  /**
   * prisma.movimientoDeuda.count — cuenta movimientos de deuda del cliente.
   */
  vi.mocked(prisma.movimientoDeuda.count).mockImplementation(async ({ where }: any) => {
    const clienteId = where?.cliente_id
    if (!clienteId) return 0
    return Array.from(movimientosDB.values()).filter((m) => m.cliente_id === clienteId).length
  })

  /**
   * prisma.cliente.delete — elimina el cliente de la BD en memoria.
   */
  vi.mocked(prisma.cliente.delete).mockImplementation(async ({ where }: any) => {
    const id: string = where?.id
    const cliente = clientesDB.get(id)
    if (!cliente) throw new Error("P2025 Record not found")
    clientesDB.delete(id)
    return cliente as any
  })
})

// ── Generadores fast-check ───────────────────────────────────────────────────

/** UUID simplificado para IDs en los tests. */
const arbId = fc.uuid()

/** Organización: UUID de tenant. */
const arbOrgId = fc.uuid()

/** Cédula válida: 5–20 caracteres alfanuméricos. */
const arbCedula = fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/)

/** Cantidad de ventas asociadas al cliente: 0 o 1–5. */
const arbVentasCount = fc.integer({ min: 0, max: 5 })

/** Cantidad de movimientos de deuda asociados al cliente: 0 o 1–5. */
const arbMovimientosCount = fc.integer({ min: 0, max: 5 })

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarCliente(orgId: string, id?: string): InMemoryCliente {
  const clienteId = id ?? newId("cli")
  const cliente: InMemoryCliente = {
    id: clienteId,
    organizacion_id: orgId,
    cedula: `CED${clienteId.slice(-5)}`,
    nombre: `Cliente ${clienteId}`,
    telefono: "1234567",
    correo: null,
    direccion: null,
  }
  clientesDB.set(clienteId, cliente)
  return cliente
}

function sembrarVentas(clienteId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = newId("ven")
    ventasDB.set(id, { id, cliente_id: clienteId })
  }
}

function sembrarMovimientos(clienteId: string, orgId: string, count: number): void {
  for (let i = 0; i < count; i++) {
    const id = newId("mov")
    movimientosDB.set(id, { id, cliente_id: clienteId, organizacion_id: orgId })
  }
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 9: Borrado de Cliente protegido por historial", () => {
  it(
    "P9.1 — Sin historial: eliminación tiene éxito y el cliente desaparece (Req 4.8)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbOrgId,
          async (orgId) => {
            // Setup fresco por iteración
            clientesDB.clear()
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)
            // Sin ventas ni movimientos de deuda

            await expect(eliminarCliente(cliente.id, orgId)).resolves.toBeUndefined()

            // El cliente ya no debe estar en la BD en memoria
            expect(clientesDB.has(cliente.id)).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P9.2 — Con Ventas asociadas: eliminación se rechaza y el cliente permanece (Req 4.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbOrgId,
          fc.integer({ min: 1, max: 5 }),   // al menos 1 venta
          async (orgId, ventasCount) => {
            clientesDB.clear()
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)
            sembrarVentas(cliente.id, ventasCount)
            // Sin movimientos de deuda

            await expect(eliminarCliente(cliente.id, orgId)).rejects.toThrow(
              ClienteConHistorialError
            )

            // El cliente debe seguir existiendo
            expect(clientesDB.has(cliente.id)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P9.3 — Con MovimientosDeuda asociados: eliminación se rechaza y el cliente permanece (Req 4.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbOrgId,
          fc.integer({ min: 1, max: 5 }),   // al menos 1 movimiento
          async (orgId, movCount) => {
            clientesDB.clear()
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)
            // Sin ventas
            sembrarMovimientos(cliente.id, orgId, movCount)

            await expect(eliminarCliente(cliente.id, orgId)).rejects.toThrow(
              ClienteConHistorialError
            )

            expect(clientesDB.has(cliente.id)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P9.4 — Con Ventas Y MovimientosDeuda asociados: eliminación se rechaza y el cliente permanece (Req 4.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbOrgId,
          fc.integer({ min: 1, max: 5 }),
          fc.integer({ min: 1, max: 5 }),
          async (orgId, ventasCount, movCount) => {
            clientesDB.clear()
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)
            sembrarVentas(cliente.id, ventasCount)
            sembrarMovimientos(cliente.id, orgId, movCount)

            await expect(eliminarCliente(cliente.id, orgId)).rejects.toThrow(
              ClienteConHistorialError
            )

            expect(clientesDB.has(cliente.id)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P9.5 — Si y solo si no hay historial, la eliminación tiene éxito (propiedad bicondicional, Req 4.8, 4.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbOrgId,
          arbVentasCount,
          arbMovimientosCount,
          async (orgId, ventasCount, movCount) => {
            clientesDB.clear()
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)
            sembrarVentas(cliente.id, ventasCount)
            sembrarMovimientos(cliente.id, orgId, movCount)

            const tieneHistorial = ventasCount > 0 || movCount > 0

            if (tieneHistorial) {
              // Con historial: debe rechazarse
              await expect(eliminarCliente(cliente.id, orgId)).rejects.toThrow(
                ClienteConHistorialError
              )
              // El cliente permanece
              expect(clientesDB.has(cliente.id)).toBe(true)
            } else {
              // Sin historial: debe tener éxito
              await expect(eliminarCliente(cliente.id, orgId)).resolves.toBeUndefined()
              // El cliente desaparece
              expect(clientesDB.has(cliente.id)).toBe(false)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P9.6 — Cliente de otro tenant no puede ser eliminado (ClienteNoEncontradoError, Req 4.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          arbOrgId,
          arbOrgId,
          async (orgA, orgB) => {
            // Precondición: los dos orgs deben ser distintos
            fc.pre(orgA !== orgB)

            clientesDB.clear()
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // Sembrar el cliente en orgA
            const cliente = sembrarCliente(orgA)

            // Intentar eliminar con orgB → debe fallar con ClienteNoEncontradoError
            await expect(eliminarCliente(cliente.id, orgB)).rejects.toThrow(
              ClienteNoEncontradoError
            )

            // El cliente debe seguir existiendo en orgA
            expect(clientesDB.has(cliente.id)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
