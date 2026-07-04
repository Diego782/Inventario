// Feature: gestion-clientes-y-fiadores, Property 14: Persistencia de venta fiada condicionada a cliente y plazo válidos
/**
 * Property 14: Persistencia de venta fiada condicionada a cliente y plazo válidos
 * **Validates: Requirements 6.3, 6.4, 6.5, 6.8, 6.9**
 *
 * Para toda venta con metodo_pago = "fiado":
 *   - La venta se persiste si y solo si tiene un cliente existente del tenant
 *     y plazo_deuda >= fecha de registro (normalizado a día).
 *   - En cualquier otro caso (sin cliente, cliente de otra org, sin plazo o plazo
 *     anterior a hoy) la operación se rechaza y no se persiste ninguna venta.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import {
  ClienteNoEncontradoError,
  PlazoDeudaInvalidoError,
  VentaFallidaError,
} from "@/lib/api/errores"
import { registrarVenta } from "@/lib/dominio/ventas"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryCliente {
  id: string
  organizacion_id: string
}

interface InMemoryProducto {
  id: string
  organizacion_id: string
  stock_actual: number
  stock_minimo: number
  nombre: string
  activo: boolean
  precio_compra: number | null
  precio_venta: number | null
}

interface InMemoryVenta {
  id: string
  organizacion_id: string
  metodo_pago: string
  cliente_id: string | null
  plazo_deuda: Date | null
  folio: string
  total: number
}

interface InMemoryMovimientoDeuda {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: "cargo" | "abono"
  monto: number
  venta_id: string | null
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let clientesDB: Map<string, InMemoryCliente>
let productosDB: Map<string, InMemoryProducto>
let ventasDB: Map<string, InMemoryVenta>
let movimientosDeudaDB: Map<string, InMemoryMovimientoDeuda>
let ventaItemsDB: Map<string, { venta_id: string; producto_id: string; cantidad: number; precio_unitario: number; subtotal_linea: number; organizacion_id: string; variante_id: string | null }>
let movimientosStockDB: Map<string, object>
let configuracionDB: Map<string, { clave: string; valor: string; organizacion_id: string }>
let notificacionesDB: Map<string, object>
let folioCounter: number
let idCounter: number

function newId(prefix = "id"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    $executeRaw: vi.fn(),
    $queryRaw: vi.fn(),
    cliente: { findFirst: vi.fn() },
    producto: { findMany: vi.fn(), update: vi.fn() },
    varianteProducto: { findMany: vi.fn() },
    venta: { findFirst: vi.fn(), create: vi.fn() },
    ventaItem: { create: vi.fn() },
    movimientoStock: { create: vi.fn() },
    movimientoDeuda: { create: vi.fn() },
    notificacion: { findFirst: vi.fn(), create: vi.fn() },
    configuracion: { findMany: vi.fn() },
    ventaFolio: { findFirst: vi.fn(), upsert: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  clientesDB = new Map()
  productosDB = new Map()
  ventasDB = new Map()
  movimientosDeudaDB = new Map()
  ventaItemsDB = new Map()
  movimientosStockDB = new Map()
  configuracionDB = new Map()
  notificacionesDB = new Map()
  folioCounter = 0
  idCounter = 0

  // prisma.$transaction — ejecuta el callback con el tx mock (el tx es el mismo prisma)
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
    return callback(prisma)
  })

  // $executeRaw — usado por generarFolio (INSERT IGNORE / UPDATE del contador)
  vi.mocked(prisma.$executeRaw).mockResolvedValue(1 as any)

  // $queryRaw — usado por generarFolio (SELECT ... FOR UPDATE del contador)
  vi.mocked(prisma.$queryRaw).mockImplementation(async () => {
    return [{ valor: String(++folioCounter) }] as any
  })

  // configuracion.findMany — sin configuración especial → usa defaults (impuesto 0)
  vi.mocked(prisma.configuracion.findMany).mockImplementation(async () => [])

  // producto.findMany — busca productos activos del tenant
  vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where }: any) => {
    const orgId = where?.organizacion_id
    const ids: string[] = where?.id?.in ?? []
    return Array.from(productosDB.values())
      .filter(
        (p) =>
          p.activo &&
          (orgId === undefined || p.organizacion_id === orgId) &&
          (ids.length === 0 || ids.includes(p.id))
      )
      .map((p) => ({ ...p })) as any
  })

  // varianteProducto.findMany — no usamos variantes en este test
  vi.mocked(prisma.varianteProducto.findMany).mockImplementation(async () => [])

  // producto.update — actualiza stock en memoria
  vi.mocked(prisma.producto.update).mockImplementation(async ({ where, data }: any) => {
    const prod = productosDB.get(where.id)
    if (!prod) throw new Error("Producto no encontrado")
    const updated = { ...prod, ...data }
    productosDB.set(where.id, updated)
    return updated as any
  })

  // cliente.findFirst — verifica que el cliente exista en el tenant
  vi.mocked(prisma.cliente.findFirst).mockImplementation(async ({ where }: any) => {
    for (const c of clientesDB.values()) {
      const matchId = where?.id === undefined || c.id === where.id
      const matchOrg =
        where?.organizacion_id === undefined || c.organizacion_id === where.organizacion_id
      if (matchId && matchOrg) return { id: c.id } as any
    }
    return null
  })

  // ventaFolio — no usado directamente; folio es generado via $queryRaw
  // (stub vacío por si algún código lo referencia)
  vi.mocked(prisma.ventaFolio.findFirst).mockResolvedValue(null as any)
  vi.mocked(prisma.ventaFolio.upsert).mockResolvedValue({ contador: 1 } as any)

  // venta.create — persiste la venta en memoria
  vi.mocked(prisma.venta.create).mockImplementation(async ({ data }: any) => {
    const id = newId("ven")
    const venta: InMemoryVenta = {
      id,
      organizacion_id: data.organizacion_id,
      metodo_pago: data.metodo_pago,
      cliente_id: data.cliente_id ?? null,
      plazo_deuda: data.plazo_deuda ?? null,
      folio: data.folio ?? `VTA-MOCK-${String(++folioCounter).padStart(4, "0")}`,
      total: data.total ?? 0,
    }
    ventasDB.set(id, venta)
    return { ...venta, items: [], creado_en: new Date() } as any
  })

  // ventaItem.create — persiste el ítem en memoria
  vi.mocked(prisma.ventaItem.create).mockImplementation(async ({ data }: any) => {
    const id = newId("item")
    const item = { id, ...data }
    ventaItemsDB.set(id, item)
    return item as any
  })

  // movimientoStock.create — persiste en memoria
  vi.mocked(prisma.movimientoStock.create).mockImplementation(async ({ data }: any) => {
    const id = newId("ms")
    const mov = { id, ...data }
    movimientosStockDB.set(id, mov)
    return mov as any
  })

  // movimientoDeuda.create — persiste el cargo en memoria
  vi.mocked(prisma.movimientoDeuda.create).mockImplementation(async ({ data }: any) => {
    const id = newId("md")
    const mov: InMemoryMovimientoDeuda = {
      id,
      organizacion_id: data.organizacion_id,
      cliente_id: data.cliente_id,
      tipo: data.tipo,
      monto: Number(data.monto),
      venta_id: data.venta_id ?? null,
    }
    movimientosDeudaDB.set(id, mov)
    return { ...mov, monto: { toString: () => String(mov.monto) } } as any
  })

  // notificacion.findFirst / create — stub para detectarStockCritico / detectarStockCero
  vi.mocked(prisma.notificacion.findFirst).mockImplementation(async () => null)
  vi.mocked(prisma.notificacion.create).mockImplementation(async ({ data }: any) => {
    const id = newId("notif")
    const notif = { id, ...data }
    notificacionesDB.set(id, notif)
    return notif as any
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarCliente(orgId: string, clienteId?: string): InMemoryCliente {
  const id = clienteId ?? newId("cli")
  const cliente: InMemoryCliente = { id, organizacion_id: orgId }
  clientesDB.set(id, cliente)
  return cliente
}

function sembrarProducto(orgId: string, stock = 100): InMemoryProducto {
  const id = newId("prod")
  const producto: InMemoryProducto = {
    id,
    organizacion_id: orgId,
    stock_actual: stock,
    stock_minimo: 5,
    nombre: `Producto ${id}`,
    activo: true,
    precio_compra: 10,
    precio_venta: 20,
  }
  productosDB.set(id, producto)
  return producto
}

/** Construye un input de venta fiada mínimo válido. */
function buildInputFiado(params: {
  orgId: string
  clienteId?: string | null
  plazoDeuda?: Date | null
  productoId: string
}) {
  return {
    organizacion_id: params.orgId,
    metodo_pago: "fiado" as const,
    cliente_id: params.clienteId ?? undefined,
    plazo_deuda: params.plazoDeuda ?? undefined,
    descuento_total: 0,
    items: [
      {
        producto_id: params.productoId,
        cantidad: 1,
        precio_unitario: 10,
        descuento_producto: 0,
      },
    ],
  }
}

/** Genera una fecha a N días desde hoy (puede ser positivo o negativo). */
function fechaEnDias(dias: number): Date {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + dias)
  return d
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 14: Persistencia de venta fiada condicionada a cliente y plazo válidos", () => {
  it(
    "P14.1 — Cliente del tenant y plazo >= hoy: venta se persiste (Req 6.3, 6.4, 6.8)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.integer({ min: 0, max: 365 }), // días en el futuro (0 = hoy, incluido)
          async (orgId, diasFuturos) => {
            // Setup fresco por iteración
            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const cliente = sembrarCliente(orgId)
            const producto = sembrarProducto(orgId)
            const plazo = fechaEnDias(diasFuturos)

            const ventasAntes = ventasDB.size

            const resultado = await registrarVenta(
              buildInputFiado({
                orgId,
                clienteId: cliente.id,
                plazoDeuda: plazo,
                productoId: producto.id,
              })
            )

            // La venta fue creada
            expect(resultado).toBeDefined()
            expect(ventasDB.size).toBe(ventasAntes + 1)

            // La venta tiene el cliente y el plazo correctos
            const ventaCreada = ventasDB.get(resultado.id)
            expect(ventaCreada?.cliente_id).toBe(cliente.id)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.2 — Sin cliente: venta se rechaza y no se persiste (Req 6.3, 6.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.integer({ min: 0, max: 365 }), // plazo válido (hoy o futuro)
          async (orgId, diasFuturos) => {
            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const producto = sembrarProducto(orgId)
            const plazo = fechaEnDias(diasFuturos)
            const ventasAntes = ventasDB.size

            // Sin cliente_id
            await expect(
              registrarVenta(
                buildInputFiado({
                  orgId,
                  clienteId: null,
                  plazoDeuda: plazo,
                  productoId: producto.id,
                })
              )
            ).rejects.toThrow(ClienteNoEncontradoError)

            // No se persistió ninguna venta
            expect(ventasDB.size).toBe(ventasAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.3 — Cliente de otra organización: venta se rechaza y no se persiste (Req 6.8, 6.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgA (organización del cliente)
          fc.uuid(), // orgB (organización de la venta)
          fc.integer({ min: 0, max: 365 }),
          async (orgA, orgB, diasFuturos) => {
            fc.pre(orgA !== orgB)

            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            // El cliente pertenece a orgA, la venta se intenta con orgB
            const clienteOrgA = sembrarCliente(orgA)
            const producto = sembrarProducto(orgB)
            const plazo = fechaEnDias(diasFuturos)
            const ventasAntes = ventasDB.size

            await expect(
              registrarVenta(
                buildInputFiado({
                  orgId: orgB,
                  clienteId: clienteOrgA.id,
                  plazoDeuda: plazo,
                  productoId: producto.id,
                })
              )
            ).rejects.toThrow(ClienteNoEncontradoError)

            // No se persistió ninguna venta
            expect(ventasDB.size).toBe(ventasAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.4 — Sin plazo: venta se rechaza y no se persiste (Req 6.4, 6.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (orgId) => {
            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const cliente = sembrarCliente(orgId)
            const producto = sembrarProducto(orgId)
            const ventasAntes = ventasDB.size

            // Sin plazo_deuda
            await expect(
              registrarVenta(
                buildInputFiado({
                  orgId,
                  clienteId: cliente.id,
                  plazoDeuda: null,
                  productoId: producto.id,
                })
              )
            ).rejects.toThrow(PlazoDeudaInvalidoError)

            // No se persistió ninguna venta
            expect(ventasDB.size).toBe(ventasAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.5 — Plazo anterior a hoy: venta se rechaza y no se persiste (Req 6.4, 6.5)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 365 }), // días en el pasado (al menos 1)
          async (orgId, diasPasados) => {
            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const cliente = sembrarCliente(orgId)
            const producto = sembrarProducto(orgId)
            const plazoPasado = fechaEnDias(-diasPasados)
            const ventasAntes = ventasDB.size

            await expect(
              registrarVenta(
                buildInputFiado({
                  orgId,
                  clienteId: cliente.id,
                  plazoDeuda: plazoPasado,
                  productoId: producto.id,
                })
              )
            ).rejects.toThrow(PlazoDeudaInvalidoError)

            // No se persistió ninguna venta
            expect(ventasDB.size).toBe(ventasAntes)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.6 — Propiedad bicondicional: venta se persiste ↔ cliente del tenant y plazo >= hoy (Req 6.3–6.5, 6.8, 6.9)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.uuid(),
          // escenario: 0=válido, 1=sin cliente, 2=cliente de otra org, 3=sin plazo, 4=plazo pasado
          fc.integer({ min: 0, max: 4 }),
          fc.integer({ min: 1, max: 180 }), // días (futuro o pasado según escenario)
          async (orgA, orgB, escenario, dias) => {
            fc.pre(orgA !== orgB)

            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const clienteTenant = sembrarCliente(orgA)
            const clienteOtroTenant = sembrarCliente(orgB)
            const producto = sembrarProducto(orgA, 200)
            const ventasAntes = ventasDB.size

            let clienteId: string | null
            let plazo: Date | null
            let debePersistar: boolean

            switch (escenario) {
              case 0:
                // Válido: cliente del tenant, plazo en el futuro (hoy o más)
                clienteId = clienteTenant.id
                plazo = fechaEnDias(dias) // dias >= 1, siempre futuro
                debePersistar = true
                break
              case 1:
                // Sin cliente
                clienteId = null
                plazo = fechaEnDias(dias)
                debePersistar = false
                break
              case 2:
                // Cliente de otra org
                clienteId = clienteOtroTenant.id
                plazo = fechaEnDias(dias)
                debePersistar = false
                break
              case 3:
                // Sin plazo
                clienteId = clienteTenant.id
                plazo = null
                debePersistar = false
                break
              case 4:
                // Plazo pasado
                clienteId = clienteTenant.id
                plazo = fechaEnDias(-dias) // dias >= 1, siempre pasado
                debePersistar = false
                break
              default:
                clienteId = clienteTenant.id
                plazo = fechaEnDias(0)
                debePersistar = true
            }

            if (debePersistar) {
              const resultado = await registrarVenta(
                buildInputFiado({
                  orgId: orgA,
                  clienteId,
                  plazoDeuda: plazo,
                  productoId: producto.id,
                })
              )
              expect(resultado).toBeDefined()
              expect(ventasDB.size).toBe(ventasAntes + 1)
            } else {
              await expect(
                registrarVenta(
                  buildInputFiado({
                    orgId: orgA,
                    clienteId,
                    plazoDeuda: plazo,
                    productoId: producto.id,
                  })
                )
              ).rejects.toThrow()
              // No se persistió ninguna venta
              expect(ventasDB.size).toBe(ventasAntes)
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.7 — Plazo = hoy (día exacto): venta se persiste (límite inferior del rango válido, Req 6.4)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          async (orgId) => {
            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const cliente = sembrarCliente(orgId)
            const producto = sembrarProducto(orgId)
            // Plazo = hoy (0 días) — debe ser aceptado
            const plazoHoy = fechaEnDias(0)
            const ventasAntes = ventasDB.size

            const resultado = await registrarVenta(
              buildInputFiado({
                orgId,
                clienteId: cliente.id,
                plazoDeuda: plazoHoy,
                productoId: producto.id,
              })
            )

            expect(resultado).toBeDefined()
            expect(ventasDB.size).toBe(ventasAntes + 1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P14.8 — Venta válida: se crea exactamente un cargo de deuda por el total (Req 6.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.integer({ min: 1, max: 10 }), // cantidad de ítems
          fc.integer({ min: 1, max: 9999 }), // precio en centavos
          async (orgId, cantidad, precioCentavos) => {
            clientesDB.clear()
            productosDB.clear()
            ventasDB.clear()
            movimientosDeudaDB.clear()
            ventaItemsDB.clear()
            movimientosStockDB.clear()
            idCounter = 0
            folioCounter = 0

            const cliente = sembrarCliente(orgId)
            const producto = sembrarProducto(orgId, cantidad + 10)
            const precio = precioCentavos / 100
            const plazo = fechaEnDias(1)
            const movimientosAntes = movimientosDeudaDB.size

            const resultado = await registrarVenta({
              organizacion_id: orgId,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazo,
              descuento_total: 0,
              items: [{ producto_id: producto.id, cantidad, precio_unitario: precio, descuento_producto: 0 }],
            })

            // Se creó exactamente un cargo de deuda
            const cargos = Array.from(movimientosDeudaDB.values()).filter(
              (m) => m.tipo === "cargo" && m.venta_id === resultado.id
            )
            expect(cargos).toHaveLength(1)
            expect(movimientosDeudaDB.size).toBe(movimientosAntes + 1)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
