// Feature: gestion-clientes-y-fiadores, Property 7: Unicidad de cédula acotada por organización
/**
 * Property 7: Unicidad de cédula acotada por organización
 * **Validates: Requirements 4.3, 4.4**
 *
 * Para toda organización, no puede haber dos clientes con la misma cédula (el
 * segundo intento se rechaza con CedulaDuplicadaError — conflicto 409); y la
 * misma cédula sí puede existir en organizaciones distintas.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { Prisma } from "@prisma/client"

// ── In-memory DB state ───────────────────────────────────────────────────────

interface InMemoryCliente {
  id: string
  organizacion_id: string
  cedula: string
  nombre: string
  telefono: string
  correo: string | null
  direccion: string | null
}

let clientesDB: Map<string, InMemoryCliente>
let idCounter: number

function newId(): string {
  return `cli-${++idCounter}`
}

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    cliente: {
      create: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"
import { crearCliente } from "@/lib/dominio/clientes"
import { CedulaDuplicadaError } from "@/lib/api/errores"

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  idCounter = 0

  /**
   * prisma.cliente.create — inserts into the in-memory DB.
   * Replicates the @@unique([organizacion_id, cedula]) constraint:
   * throws a P2002 when an (organizacion_id, cedula) pair already exists.
   */
  vi.mocked(prisma.cliente.create).mockImplementation(async ({ data }: any) => {
    const { organizacion_id, cedula } = data as {
      organizacion_id: string
      cedula: string
    }

    // Check uniqueness constraint @@unique([organizacion_id, cedula])
    const existe = Array.from(clientesDB.values()).some(
      (c) => c.organizacion_id === organizacion_id && c.cedula === cedula
    )
    if (existe) {
      // Simulate Prisma P2002 unique constraint violation
      const error = new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`organizacion_id`, `cedula`)",
        {
          code: "P2002",
          clientVersion: "5.0.0",
          meta: { target: ["organizacion_id", "cedula"] },
        }
      )
      throw error
    }

    const id = newId()
    const cliente: InMemoryCliente = {
      id,
      organizacion_id,
      cedula,
      nombre: data.nombre,
      telefono: data.telefono,
      correo: data.correo ?? null,
      direccion: data.direccion ?? null,
    }
    clientesDB.set(id, cliente)
    return cliente as any
  })
})

// ── Generadores ───────────────────────────────────────────────────────────────

/** Cédula válida: 5–20 caracteres alfanuméricos. */
const arbCedula = fc
  .stringMatching(/^[a-zA-Z0-9]{5,20}$/)
  .filter((s) => s.length >= 5 && s.length <= 20)

/** Nombre válido: 1–100 caracteres no vacíos. */
const arbNombre = fc
  .string({ minLength: 1, maxLength: 50 })
  .map((s) => s.trim())
  .filter((s) => s.length >= 1)

/** Teléfono válido: 7–15 dígitos. */
const arbTelefono = fc
  .integer({ min: 1_000_000, max: 999_999_999_999_999 })
  .map((n) => String(n))

/** Datos mínimos de un cliente. */
const arbDatosCliente = fc.record({
  cedula: arbCedula,
  nombre: arbNombre,
  telefono: arbTelefono,
})

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Property 7: Unicidad de cédula acotada por organización", () => {
  it(
    "P7.1 — Dentro de la misma organización, el segundo intento con la misma cédula lanza CedulaDuplicadaError (Req 4.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbDatosCliente, // datos del primer cliente
          arbNombre, // nombre distinto para el segundo intento
          arbTelefono, // teléfono distinto para el segundo intento
          async (orgId, datos, otroNombre, otroTelefono) => {
            clientesDB.clear()
            idCounter = 0

            // Primer intento: debe tener éxito
            const primero = await crearCliente(datos, orgId)
            expect(primero.cedula).toBe(datos.cedula)
            expect(primero.organizacion_id).toBe(orgId)

            // Segundo intento con la misma cédula en la misma organización:
            // debe rechazarse con CedulaDuplicadaError (Req 4.3)
            await expect(
              crearCliente(
                {
                  cedula: datos.cedula, // misma cédula
                  nombre: otroNombre,
                  telefono: otroTelefono,
                },
                orgId // misma organización
              )
            ).rejects.toBeInstanceOf(CedulaDuplicadaError)

            // El registro en la BD sigue siendo solo uno
            const clientesDeLaOrg = Array.from(clientesDB.values()).filter(
              (c) => c.organizacion_id === orgId && c.cedula === datos.cedula
            )
            expect(clientesDeLaOrg).toHaveLength(1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P7.2 — La misma cédula puede existir en organizaciones distintas sin conflicto (Req 4.4)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion A
          fc.uuid(), // organizacion B
          arbCedula, // cédula compartida
          arbNombre,
          arbTelefono,
          async (orgA, orgB, cedula, nombre, telefono) => {
            // Las dos organizaciones deben ser distintas
            fc.pre(orgA !== orgB)

            clientesDB.clear()
            idCounter = 0

            const datos = { cedula, nombre, telefono }

            // Crear el cliente en la organización A — no debe fallar
            const clienteA = await crearCliente(datos, orgA)
            expect(clienteA.cedula).toBe(cedula)
            expect(clienteA.organizacion_id).toBe(orgA)

            // Crear el cliente con la misma cédula en la organización B — no debe fallar (Req 4.4)
            const clienteB = await crearCliente(datos, orgB)
            expect(clienteB.cedula).toBe(cedula)
            expect(clienteB.organizacion_id).toBe(orgB)

            // Ambos registros existen en sus respectivas organizaciones
            expect(clienteA.id).not.toBe(clienteB.id)
            expect(clientesDB.size).toBe(2)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P7.3 — Cédulas distintas en la misma organización se aceptan todas sin conflicto (Req 4.3 negativo)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          // Conjunto de 2–5 cédulas únicas entre sí
          fc
            .uniqueArray(arbCedula, { minLength: 2, maxLength: 5 })
            .filter((arr) => new Set(arr).size === arr.length),
          arbNombre,
          arbTelefono,
          async (orgId, cedulas, nombre, telefono) => {
            clientesDB.clear()
            idCounter = 0

            // Crear un cliente por cada cédula distinta
            for (const cedula of cedulas) {
              const cliente = await crearCliente({ cedula, nombre, telefono }, orgId)
              expect(cliente.cedula).toBe(cedula)
              expect(cliente.organizacion_id).toBe(orgId)
            }

            // Todos los clientes fueron creados sin conflicto
            const clientesDeLaOrg = Array.from(clientesDB.values()).filter(
              (c) => c.organizacion_id === orgId
            )
            expect(clientesDeLaOrg).toHaveLength(cedulas.length)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
