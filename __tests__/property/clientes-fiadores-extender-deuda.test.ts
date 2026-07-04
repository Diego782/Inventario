// Feature: gestion-clientes-y-fiadores, Property 21: Extender deuda valida fecha posterior
/**
 * Property 21: Extender deuda valida fecha posterior
 * **Validates: Requirements 8.8, 8.9**
 *
 * Para toda deuda con un plazo vigente y toda fecha propuesta arbitraria:
 *   - Si la fecha propuesta es estrictamente posterior al plazo vigente, el plazo
 *     se actualiza al nuevo valor (Req 8.8).
 *   - Si la fecha propuesta es igual o anterior al plazo vigente, la operación se
 *     rechaza con PlazoExtensionInvalidoError y el plazo vigente se conserva (Req 8.9).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { PlazoExtensionInvalidoError } from "@/lib/api/errores"
import { extenderDeuda } from "@/lib/dominio/notificaciones"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryVenta {
  id: string
  organizacion_id: string
  metodo_pago: string
  plazo_deuda: Date | null
}

interface InMemoryMovimientoDeuda {
  id: string
  organizacion_id: string
  venta_id: string | null
  tipo: string
  plazo_deuda: Date | null
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let ventasDB: Map<string, InMemoryVenta>
let movimientosDB: Map<string, InMemoryMovimientoDeuda>
let idCounter: number

function newId(prefix = "id"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    venta: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    movimientoDeuda: {
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

import { prisma } from "@/lib/db"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  ventasDB = new Map()
  movimientosDB = new Map()
  idCounter = 0

  /**
   * prisma.venta.findFirst — busca venta fiada por id y organizacion_id.
   */
  vi.mocked(prisma.venta.findFirst).mockImplementation(async ({ where }: any) => {
    for (const v of ventasDB.values()) {
      if (
        v.id === where?.id &&
        v.organizacion_id === where?.organizacion_id &&
        v.metodo_pago === where?.metodo_pago
      ) {
        return { id: v.id, plazo_deuda: v.plazo_deuda } as any
      }
    }
    return null
  })

  /**
   * prisma.$transaction — ejecuta el callback con un cliente de transacción
   * que actúa sobre la BD en memoria.
   */
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
    const txCliente = {
      venta: {
        update: async ({ where, data }: any) => {
          const venta = ventasDB.get(where?.id)
          if (!venta) throw new Error("Venta no encontrada en tx")
          venta.plazo_deuda = data.plazo_deuda
          return { id: venta.id, plazo_deuda: venta.plazo_deuda } as any
        },
      },
      movimientoDeuda: {
        updateMany: async ({ where, data }: any) => {
          let count = 0
          for (const m of movimientosDB.values()) {
            if (
              m.venta_id === where?.venta_id &&
              m.organizacion_id === where?.organizacion_id &&
              m.tipo === where?.tipo
            ) {
              m.plazo_deuda = data.plazo_deuda
              count++
            }
          }
          return { count } as any
        },
      },
    }
    return fn(txCliente)
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarVentaFiada(orgId: string, plazoDeuda: Date, ventaId?: string): InMemoryVenta {
  const id = ventaId ?? newId("venta")
  const venta: InMemoryVenta = {
    id,
    organizacion_id: orgId,
    metodo_pago: "fiado",
    plazo_deuda: plazoDeuda,
  }
  ventasDB.set(id, venta)
  return venta
}

function sembrarMovimientoCargo(ventaId: string, orgId: string, plazoDeuda: Date): InMemoryMovimientoDeuda {
  const id = newId("mov")
  const movimiento: InMemoryMovimientoDeuda = {
    id,
    organizacion_id: orgId,
    venta_id: ventaId,
    tipo: "cargo",
    plazo_deuda: plazoDeuda,
  }
  movimientosDB.set(id, movimiento)
  return movimiento
}

// ── Generadores fast-check ───────────────────────────────────────────────────

// Epoch mínimo y máximo en ms para el rango de fechas (año 2020–2030).
const MIN_EPOCH = new Date("2020-01-01T00:00:00.000Z").getTime()
const MAX_EPOCH = new Date("2030-12-31T23:59:59.999Z").getTime()

/**
 * Genera una fecha base válida (plazo vigente) dentro de un rango razonable
 * (año 2020–2030). Usamos integer sobre el timestamp para garantizar que no
 * se generen fechas NaN (que `fc.date` puede producir con `noInvalidDate: false`).
 */
const arbFechaBase = fc
  .integer({ min: MIN_EPOCH, max: MAX_EPOCH })
  .map((ms) => new Date(ms))

/**
 * Genera un desplazamiento en milisegundos. Puede ser negativo (antes), cero
 * (igual) o positivo (después). Se limita a ±1 año en ms.
 */
const arbDesplazamientoMs = fc.integer({ min: -365 * 24 * 3600 * 1000, max: 365 * 24 * 3600 * 1000 })

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 21: Extender deuda valida fecha posterior", () => {
  it(
    "P21.1 — Fecha estrictamente posterior al plazo vigente: plazo se actualiza (Req 8.8)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),                             // orgId
          arbFechaBase,                          // plazo vigente
          fc.integer({ min: 1, max: 365 * 24 * 3600 * 1000 }), // desplazamiento positivo en ms
          async (orgId, plazoVigente, desplazamientoMs) => {
            // Setup fresco por iteración
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const nuevaFecha = new Date(plazoVigente.getTime() + desplazamientoMs)
            const venta = sembrarVentaFiada(orgId, plazoVigente)
            sembrarMovimientoCargo(venta.id, orgId, plazoVigente)

            // No debe lanzar error
            await expect(
              extenderDeuda(venta.id, nuevaFecha, orgId)
            ).resolves.toBeUndefined()

            // El plazo de la venta en memoria debe haberse actualizado
            const ventaActualizada = ventasDB.get(venta.id)!
            expect(ventaActualizada.plazo_deuda).toEqual(nuevaFecha)

            // El movimiento de cargo también debe tener el nuevo plazo
            const movimientoActualizado = Array.from(movimientosDB.values()).find(
              (m) => m.venta_id === venta.id && m.tipo === "cargo"
            )
            expect(movimientoActualizado?.plazo_deuda).toEqual(nuevaFecha)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P21.2 — Fecha igual al plazo vigente: se rechaza con PlazoExtensionInvalidoError y el plazo no cambia (Req 8.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbFechaBase,
          async (orgId, plazoVigente) => {
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // La fecha propuesta es exactamente igual al plazo vigente
            const mismaFecha = new Date(plazoVigente.getTime())
            const venta = sembrarVentaFiada(orgId, plazoVigente)
            sembrarMovimientoCargo(venta.id, orgId, plazoVigente)

            await expect(
              extenderDeuda(venta.id, mismaFecha, orgId)
            ).rejects.toThrow(PlazoExtensionInvalidoError)

            // El plazo de la venta debe conservarse intacto
            const ventaDespues = ventasDB.get(venta.id)!
            expect(ventaDespues.plazo_deuda).toEqual(plazoVigente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P21.3 — Fecha anterior al plazo vigente: se rechaza con PlazoExtensionInvalidoError y el plazo no cambia (Req 8.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbFechaBase,
          fc.integer({ min: 1, max: 365 * 24 * 3600 * 1000 }), // desplazamiento negativo en ms
          async (orgId, plazoVigente, desplazamientoMs) => {
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const fechaAnterior = new Date(plazoVigente.getTime() - desplazamientoMs)
            const venta = sembrarVentaFiada(orgId, plazoVigente)
            sembrarMovimientoCargo(venta.id, orgId, plazoVigente)

            await expect(
              extenderDeuda(venta.id, fechaAnterior, orgId)
            ).rejects.toThrow(PlazoExtensionInvalidoError)

            // El plazo de la venta debe conservarse intacto
            const ventaDespues = ventasDB.get(venta.id)!
            expect(ventaDespues.plazo_deuda).toEqual(plazoVigente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P21.4 — Propiedad bicondicional: fecha > plazo ↔ operación aceptada; fecha ≤ plazo ↔ rechazada (Req 8.8, 8.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbFechaBase,
          arbDesplazamientoMs,
          async (orgId, plazoVigente, desplazamientoMs) => {
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const nuevaFecha = new Date(plazoVigente.getTime() + desplazamientoMs)
            const esPosterior = nuevaFecha > plazoVigente

            const venta = sembrarVentaFiada(orgId, plazoVigente)
            sembrarMovimientoCargo(venta.id, orgId, plazoVigente)

            if (esPosterior) {
              // Debe aceptarse y actualizar el plazo
              await expect(
                extenderDeuda(venta.id, nuevaFecha, orgId)
              ).resolves.toBeUndefined()

              const ventaActualizada = ventasDB.get(venta.id)!
              expect(ventaActualizada.plazo_deuda).toEqual(nuevaFecha)
            } else {
              // Debe rechazarse y conservar el plazo original
              await expect(
                extenderDeuda(venta.id, nuevaFecha, orgId)
              ).rejects.toThrow(PlazoExtensionInvalidoError)

              const ventaDespues = ventasDB.get(venta.id)!
              expect(ventaDespues.plazo_deuda).toEqual(plazoVigente)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P21.5 — Venta de otro tenant se rechaza con PlazoExtensionInvalidoError (aislamiento, Req 8.10)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          arbFechaBase,
          async (orgA, orgB, plazoVigente) => {
            fc.pre(orgA !== orgB)

            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            const nuevaFecha = new Date(plazoVigente.getTime() + 24 * 3600 * 1000) // +1 día
            // La venta pertenece a orgA
            sembrarVentaFiada(orgA, plazoVigente)

            // Intentar extender usando orgB (tenant incorrecto)
            const ventaDeOrgA = Array.from(ventasDB.values())[0]
            await expect(
              extenderDeuda(ventaDeOrgA.id, nuevaFecha, orgB)
            ).rejects.toThrow(PlazoExtensionInvalidoError)

            // El plazo de la venta en orgA no cambió
            const ventaDespues = ventasDB.get(ventaDeOrgA.id)!
            expect(ventaDespues.plazo_deuda).toEqual(plazoVigente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
