// Feature: gestion-clientes-y-fiadores, Property 10: Paginación de clientes acotada a 50
/**
 * Property 10: Paginación de clientes acotada a 50
 * **Validates: Requirements 4.14**
 *
 * Para organizaciones con cualquier cantidad de clientes, verifica que cada
 * página devuelta por `listarClientes` contiene a lo sumo 50 clientes,
 * independientemente del valor de `take` solicitado.
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
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"
import { listarClientes } from "@/lib/dominio/clientes"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  idCounter = 0

  /**
   * prisma.cliente.findMany — filtra por organizacion_id, aplica skip/take.
   */
  vi.mocked(prisma.cliente.findMany).mockImplementation(async ({ where, take, skip }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const results = Array.from(clientesDB.values()).filter(
      (c) => orgId === undefined || c.organizacion_id === orgId
    )
    const start = skip ?? 0
    const sliced = take !== undefined ? results.slice(start, start + take) : results.slice(start)
    return sliced as any
  })

  /**
   * prisma.cliente.count — filtra por organizacion_id.
   */
  vi.mocked(prisma.cliente.count).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    return Array.from(clientesDB.values()).filter(
      (c) => orgId === undefined || c.organizacion_id === orgId
    ).length
  })
})

// ── Helper: sembrar clientes ─────────────────────────────────────────────────

function sembrarClientes(orgId: string, cantidad: number): void {
  for (let i = 0; i < cantidad; i++) {
    const id = newId()
    const cliente: InMemoryCliente = {
      id,
      organizacion_id: orgId,
      cedula: `C${String(i + 1).padStart(6, "0")}`,
      nombre: `Cliente ${i + 1}`,
      telefono: `1234567${String(i).padStart(3, "0")}`.slice(0, 10),
      correo: null,
      direccion: null,
      creado_en: new Date(),
      actualizado_en: new Date(),
    }
    clientesDB.set(id, cliente)
  }
}

// ── Tests PBT ─────────────────────────────────────────────────────────────

describe("Property 10: Paginación de clientes acotada a 50", () => {
  it(
    "P10.1 — Cada página devuelta contiene a lo sumo 50 clientes, cualquiera que sea la cantidad en la organización (Req 4.14)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          // tenant id
          fc.uuid(),
          // cantidad total de clientes en la organización: 0 a 150
          fc.integer({ min: 0, max: 150 }),
          // valor de take solicitado por el cliente: 1 a 200 (puede superar el límite)
          fc.integer({ min: 1, max: 200 }),
          // skip: 0 a 120
          fc.integer({ min: 0, max: 120 }),
          async (orgId, totalClientes, takeParam, skipParam) => {
            clientesDB.clear()
            idCounter = 0

            sembrarClientes(orgId, totalClientes)

            const { items } = await listarClientes({
              organizacion_id: orgId,
              take: takeParam,
              skip: skipParam,
            })

            // La propiedad central: nunca se devuelven más de 50 clientes (Req 4.14).
            expect(items.length).toBeLessThanOrEqual(50)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P10.2 — Solicitar take mayor que 50 se recorta a 50 (el máximo de página se respeta siempre)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // catálogo grande para que haya suficientes clientes en cualquier página
          fc.integer({ min: 60, max: 150 }),
          // take que siempre supera el límite
          fc.integer({ min: 51, max: 500 }),
          async (orgId, totalClientes, takeGrande) => {
            clientesDB.clear()
            idCounter = 0

            sembrarClientes(orgId, totalClientes)

            const { items } = await listarClientes({
              organizacion_id: orgId,
              take: takeGrande,
              skip: 0,
            })

            // Aunque take > 50, la respuesta no puede superar 50 clientes.
            expect(items.length).toBeLessThanOrEqual(50)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P10.3 — Con take omitido, la página por defecto tampoco supera 50 clientes",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 0, max: 150 }),
          async (orgId, totalClientes) => {
            clientesDB.clear()
            idCounter = 0

            sembrarClientes(orgId, totalClientes)

            // Sin take explícito: usa el default (50)
            const { items } = await listarClientes({
              organizacion_id: orgId,
            })

            expect(items.length).toBeLessThanOrEqual(50)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P10.4 — El total devuelto refleja el conteo real; los items son un subconjunto paginado (Req 4.14)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 0, max: 120 }),
          fc.integer({ min: 0, max: 80 }),
          async (orgId, totalClientes, skipParam) => {
            clientesDB.clear()
            idCounter = 0

            sembrarClientes(orgId, totalClientes)

            const { items, total } = await listarClientes({
              organizacion_id: orgId,
              take: 50,
              skip: skipParam,
            })

            // El total siempre refleja el número real de clientes de la organización.
            expect(total).toBe(totalClientes)

            // Los items son como máximo 50 y nunca más que los clientes restantes tras el skip.
            const restantes = Math.max(0, totalClientes - skipParam)
            expect(items.length).toBeLessThanOrEqual(50)
            expect(items.length).toBeLessThanOrEqual(restantes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
