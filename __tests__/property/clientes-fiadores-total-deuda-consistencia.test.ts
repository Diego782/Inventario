// Feature: gestion-clientes-y-fiadores, Property 23: Consistencia del total en deuda entre dashboard y fiadores
/**
 * Property 23: Consistencia de "Total de dinero en deuda" con Total_Deuda_Pendiente
 * **Validates: Requirements 9.4, 9.5, 9.6**
 *
 * Para toda organización en un instante dado, el valor de la métrica
 * "Total de dinero en deuda" expuesto por `calcularMetricas` es igual al
 * `Total_Deuda_Pendiente` calculado por `totalesDeuda` para la misma
 * organización.  Ambas funciones usan el mismo origen de cálculo, garantizando
 * que nunca haya divergencia entre la sección Dashboard y la sección Fiadores.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ── In-memory types ──────────────────────────────────────────────────────────

type TipoMovimiento = "cargo" | "abono"

interface InMemoryMovimiento {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: TipoMovimiento
  monto: number
  venta_id: string | null
  plazo_deuda: Date | null
  fecha: Date
  creado_en: Date
}

interface InMemoryVenta {
  id: string
  organizacion_id: string
  folio: string
  total: number
  subtotal: number
  impuesto: number
  metodo_pago: string
  estado: string
  cliente_id: string | null
  creado_en: Date
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let movimientosDB: Map<string, InMemoryMovimiento>
let ventasDB: Map<string, InMemoryVenta>
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    movimientoDeuda: {
      findMany: vi.fn(),
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
    },
  },
}))

import { prisma } from "@/lib/db"
import { totalesDeuda } from "@/lib/dominio/deuda"
import { calcularMetricas } from "@/lib/dominio/metricas"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  movimientosDB = new Map()
  ventasDB = new Map()
  idCounter = 0

  /**
   * prisma.movimientoDeuda.findMany — devuelve movimientos filtrados por tenant
   * y opcionalmente por lista de cliente_ids.
   */
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const clienteIdIn: string[] | undefined = where?.cliente_id?.in

    return Array.from(movimientosDB.values()).filter((m) => {
      if (orgId && m.organizacion_id !== orgId) return false
      if (clienteIdIn && !clienteIdIn.includes(m.cliente_id)) return false
      return true
    })
  })

  /**
   * prisma.venta.findMany — devuelve ventas completadas del tenant.
   * Devuelve array vacío para no interferir con la métrica de ventas totales;
   * la propiedad solo verifica totalDeuda.
   */
  vi.mocked(prisma.venta.findMany).mockResolvedValue([])

  /**
   * prisma.ventaItem.findMany — devuelve array vacío (sin gastos).
   */
  vi.mocked(prisma.ventaItem.findMany).mockResolvedValue([])

  /**
   * prisma.movimientoStock.findMany — devuelve array vacío (sin devoluciones).
   */
  vi.mocked(prisma.movimientoStock.findMany).mockResolvedValue([])

  /**
   * prisma.cliente.findMany — no es usado directamente por totalesDeuda
   * (que consulta movimientoDeuda.findMany), pero lo dejamos como fallback.
   */
  vi.mocked(prisma.cliente.findMany).mockResolvedValue([])
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

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

type TipoMov = "cargo" | "abono"

/** Un movimiento individual: tipo y monto. */
const arbMovimiento = fc.record({
  tipo: fc.oneof(fc.constant("cargo" as TipoMov), fc.constant("abono" as TipoMov)),
  monto: arbMonto,
})

/** Lista de movimientos por cliente: 0–8 movimientos. */
const arbMovimientosList = fc.array(arbMovimiento, { minLength: 0, maxLength: 8 })

/**
 * Un "cliente" descrito solo por sus movimientos (no necesitamos persistir el
 * registro de Cliente porque `totalesDeuda` trabaja directamente sobre
 * `MovimientoDeuda`).
 */
const arbClienteConMovimientos = fc.record({
  clienteId: fc.uuid(),
  movimientos: arbMovimientosList,
})

/** Conjunto de 0–6 clientes con sus movimientos. */
const arbClientes = fc.array(arbClienteConMovimientos, { minLength: 0, maxLength: 6 })

// ── Función auxiliar: Total_Deuda_Pendiente esperado ────────────────────────

/**
 * Calcula el `Total_Deuda_Pendiente` esperado a partir de los movimientos
 * sembrados, replicando la lógica de `totalesDeuda`:
 *   saldo_cliente = redondearBancario(Σ cargos − Σ abonos)
 *   total         = redondearBancario(Σ saldos positivos)
 */
function calcularTotalDeudaEsperado(
  clientes: Array<{ clienteId: string; movimientos: Array<{ tipo: TipoMov; monto: number }> }>
): number {
  const saldosPorCliente = new Map<string, number>()

  for (const { clienteId, movimientos } of clientes) {
    const raw = movimientos.reduce((acc, m) => {
      return m.tipo === "cargo" ? acc + m.monto : acc - m.monto
    }, 0)
    saldosPorCliente.set(clienteId, redondearBancario(raw))
  }

  let sumaRaw = 0
  for (const saldo of saldosPorCliente.values()) {
    if (saldo > 0) sumaRaw += saldo
  }

  return redondearBancario(sumaRaw)
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 23: Consistencia de 'Total de dinero en deuda' con Total_Deuda_Pendiente", () => {
  /**
   * P23.1 — El campo `totalDeuda` de `calcularMetricas` coincide con el
   * `totalDeudaPendiente` de `totalesDeuda` para la misma organización
   * (Req 9.4, 9.5).
   *
   * Ambas funciones se ejecutan contra el mismo estado en memoria, emulando
   * el mismo instante.  La propiedad garantiza que no pueden divergir.
   */
  it(
    "P23.1 — totalDeuda en calcularMetricas == totalDeudaPendiente en totalesDeuda (Req 9.4, 9.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            // Reset estado por iteración
            movimientosDB.clear()
            idCounter = 0

            // Sembrar movimientos usando los clienteIds generados
            for (const { clienteId, movimientos } of clientesData) {
              for (const mov of movimientos) {
                sembrarMovimiento(clienteId, orgId, mov.tipo, mov.monto)
              }
            }

            // Llamar a ambas funciones en el mismo instante
            const [totales, metricas] = await Promise.all([
              totalesDeuda(orgId),
              calcularMetricas("2025-01-01", "2025-01-31", "UTC", orgId),
            ])

            // La propiedad central: mismo valor desde ambas rutas de acceso
            expect(metricas.totalDeuda).toBe(totales.totalDeudaPendiente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  /**
   * P23.2 — Cuando no hay clientes con deuda, `totalDeuda` es 0 en ambas
   * funciones (Req 9.6).
   */
  it(
    "P23.2 — Sin clientes con deuda, totalDeuda y totalDeudaPendiente son 0 (Req 9.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          async (orgId) => {
            movimientosDB.clear()
            idCounter = 0

            // No se siembra ningún movimiento

            const [totales, metricas] = await Promise.all([
              totalesDeuda(orgId),
              calcularMetricas("2025-01-01", "2025-01-31", "UTC", orgId),
            ])

            expect(totales.totalDeudaPendiente).toBe(0)
            expect(metricas.totalDeuda).toBe(0)
            expect(metricas.totalDeuda).toBe(totales.totalDeudaPendiente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  /**
   * P23.3 — El `totalDeuda` coincide con el valor calculado manualmente
   * (modelo en memoria), validando la implementación de extremo a extremo
   * (Req 9.4, 9.5).
   */
  it(
    "P23.3 — totalDeuda coincide con el modelo de referencia en memoria (Req 9.4, 9.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // organizacion_id
          arbClientes,
          async (orgId, clientesData) => {
            movimientosDB.clear()
            idCounter = 0

            for (const { clienteId, movimientos } of clientesData) {
              for (const mov of movimientos) {
                sembrarMovimiento(clienteId, orgId, mov.tipo, mov.monto)
              }
            }

            const metricas = await calcularMetricas(
              "2025-01-01",
              "2025-01-31",
              "UTC",
              orgId
            )

            const totalEsperado = calcularTotalDeudaEsperado(clientesData)

            expect(metricas.totalDeuda).toBe(totalEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
