// Feature: gestion-clientes-y-fiadores, Property 6: Round-trip de creación y edición de Cliente
/**
 * Property 6: Round-trip de creación y edición de Cliente
 * **Validates: Requirements 4.1, 4.6**
 *
 * Para todo cliente con datos válidos, crearlo y luego recuperarlo devuelve los
 * mismos valores de negocio; y tras editarlo con nuevos valores válidos, recuperarlo
 * devuelve los valores editados.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// ── In-memory types ──────────────────────────────────────────────────────────

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

// ── In-memory DB state ───────────────────────────────────────────────────────

let clientesDB: Map<string, InMemoryCliente>
let idCounter: number

function newId(): string {
  return `cliente-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    cliente: {
      create: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
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
import { crearCliente, editarCliente, obtenerCliente } from "@/lib/dominio/clientes"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  idCounter = 0

  // prisma.cliente.create — inserts into in-memory DB
  vi.mocked(prisma.cliente.create).mockImplementation(async ({ data }: any) => {
    const id = newId()
    const now = new Date()
    const cliente: InMemoryCliente = {
      id,
      organizacion_id: data.organizacion_id,
      cedula: data.cedula,
      nombre: data.nombre,
      telefono: data.telefono,
      correo: data.correo ?? null,
      direccion: data.direccion ?? null,
      creado_en: now,
      actualizado_en: now,
    }
    clientesDB.set(id, cliente)
    return cliente as any
  })

  // prisma.cliente.update — updates in-memory record
  vi.mocked(prisma.cliente.update).mockImplementation(async ({ where, data }: any) => {
    const cliente = clientesDB.get(where.id)
    if (!cliente) throw new Error(`Cliente no encontrado: ${where.id}`)

    const updated: InMemoryCliente = {
      ...cliente,
      ...(data.cedula !== undefined && { cedula: data.cedula }),
      ...(data.nombre !== undefined && { nombre: data.nombre }),
      ...(data.telefono !== undefined && { telefono: data.telefono }),
      ...(data.correo !== undefined && { correo: data.correo }),
      ...(data.direccion !== undefined && { direccion: data.direccion }),
      actualizado_en: new Date(),
    }
    clientesDB.set(where.id, updated)
    return updated as any
  })

  // prisma.cliente.findFirst — finds by id + organizacion_id
  vi.mocked(prisma.cliente.findFirst).mockImplementation(async ({ where }: any) => {
    for (const c of clientesDB.values()) {
      const matchId = where?.id === undefined || c.id === where.id
      const matchOrg = where?.organizacion_id === undefined || c.organizacion_id === where.organizacion_id
      if (matchId && matchOrg) return c as any
    }
    return null
  })
})

// ── Generadores fast-check ────────────────────────────────────────────────────

/** Cédula: 5–20 caracteres alfanuméricos (Req 4.11). */
const arbCedula = fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/)

/** Nombre: 1–100 caracteres no vacíos. */
const arbNombre = fc
  .string({ minLength: 1, maxLength: 100 })
  .filter((s) => s.trim().length > 0)

/** Teléfono: 7–15 dígitos (Req 4.11). */
const arbTelefono = fc
  .integer({ min: 1_000_000, max: 999_999_999_999_999 })
  .map((n) => String(n))
  .filter((s) => s.length >= 7 && s.length <= 15)

/** Correo válido opcional (Req 4.10). */
const arbCorreoOpcional = fc.oneof(
  fc.constant(null),
  fc
    .record({
      user: fc.stringMatching(/^[a-zA-Z0-9]{1,20}$/),
      domain: fc.stringMatching(/^[a-zA-Z]{2,10}$/),
      tld: fc.stringMatching(/^[a-zA-Z]{2,5}$/),
    })
    .map(({ user, domain, tld }) => `${user}@${domain}.${tld}`)
)

/** Dirección opcional: máximo 240 caracteres. */
const arbDireccionOpcional = fc.oneof(
  fc.constant(null),
  fc.string({ minLength: 0, maxLength: 100 })
)

/** Input completo para crear un Cliente. */
const arbCrearClienteInput = fc.record({
  cedula: arbCedula,
  nombre: arbNombre,
  telefono: arbTelefono,
  correo: arbCorreoOpcional,
  direccion: arbDireccionOpcional,
})

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Property 6: Round-trip de creación y edición de Cliente", () => {
  it(
    "P6.1 — Crear un cliente y recuperarlo devuelve los mismos valores de negocio (Req 4.1)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCrearClienteInput,
          async (orgId, input) => {
            clientesDB.clear()
            idCounter = 0

            // Crear el cliente
            const creado = await crearCliente(input, orgId)

            // Recuperar por id + tenant
            const recuperado = await obtenerCliente(creado.id, orgId)

            // El cliente debe existir
            expect(recuperado).not.toBeNull()

            // Los valores de negocio deben coincidir exactamente con los que se enviaron
            expect(recuperado!.cedula).toBe(input.cedula)
            expect(recuperado!.nombre).toBe(input.nombre)
            expect(recuperado!.telefono).toBe(input.telefono)
            expect(recuperado!.correo ?? null).toBe(input.correo ?? null)
            expect(recuperado!.direccion ?? null).toBe(input.direccion ?? null)
            expect(recuperado!.organizacion_id).toBe(orgId)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P6.2 — Editar un cliente con nuevos valores válidos y recuperarlo devuelve los valores editados (Req 4.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCrearClienteInput,
          arbCrearClienteInput,
          async (orgId, inputOriginal, inputEditado) => {
            clientesDB.clear()
            idCounter = 0

            // Crear el cliente original
            const creado = await crearCliente(inputOriginal, orgId)

            // Editar con nuevos valores
            await editarCliente(creado.id, inputEditado, orgId)

            // Recuperar tras la edición
            const recuperado = await obtenerCliente(creado.id, orgId)

            expect(recuperado).not.toBeNull()

            // Los valores de negocio deben reflejar la edición
            expect(recuperado!.cedula).toBe(inputEditado.cedula)
            expect(recuperado!.nombre).toBe(inputEditado.nombre)
            expect(recuperado!.telefono).toBe(inputEditado.telefono)
            expect(recuperado!.correo ?? null).toBe(inputEditado.correo ?? null)
            expect(recuperado!.direccion ?? null).toBe(inputEditado.direccion ?? null)

            // El id y la organización no cambian
            expect(recuperado!.id).toBe(creado.id)
            expect(recuperado!.organizacion_id).toBe(orgId)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P6.3 — Edición parcial actualiza solo los campos indicados y conserva el resto (Req 4.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbCrearClienteInput,
          arbNombre,
          async (orgId, input, nuevoNombre) => {
            clientesDB.clear()
            idCounter = 0

            const creado = await crearCliente(input, orgId)

            // Editar solo el nombre (editarClienteSchema es partial)
            await editarCliente(creado.id, { nombre: nuevoNombre }, orgId)

            const recuperado = await obtenerCliente(creado.id, orgId)

            expect(recuperado).not.toBeNull()

            // El nombre debe reflejar el nuevo valor
            expect(recuperado!.nombre).toBe(nuevoNombre)

            // Los demás campos de negocio deben conservarse
            expect(recuperado!.cedula).toBe(input.cedula)
            expect(recuperado!.telefono).toBe(input.telefono)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
