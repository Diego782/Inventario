// Feature: gestion-clientes-y-fiadores, Property 15: Venta fiada válida genera un cargo por el total
/**
 * Property 15: Venta fiada válida genera un cargo por el total
 * **Validates: Requirements 6.6**
 *
 * Para toda venta fiada válida, al completarse:
 *   1. Existe exactamente un Cargo_Deuda de tipo "cargo" asociado a esa venta y
 *      su cliente cuyo monto es igual al total de la venta tras descuentos e impuestos.
 *   2. El saldo del cliente aumenta exactamente en ese monto (usando redondeo bancario).
 *
 * La propiedad se verifica ejercitando `registrarVenta` con mocks de Prisma que
 * simulan una BD en memoria, de modo que el cargo transaccional quede registrado
 * en la misma llamada que la venta (Req 6.6, 6.10).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"
import { calcularTotalesVenta } from "@/lib/dominio/descuentos"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryCliente {
  id: string
  organizacion_id: string
}

interface InMemoryProducto {
  id: string
  organizacion_id: string
  nombre: string
  stock_actual: number
  stock_minimo: number
  activo: boolean
  precio_compra: number | null
  precio_venta: number | null
}

interface InMemoryMovimiento {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: "cargo" | "abono"
  monto: number
  venta_id: string | null
}

interface InMemoryVenta {
  id: string
  organizacion_id: string
  cliente_id: string | null
  metodo_pago: string
  total: number
  folio: string
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let clientesDB: Map<string, InMemoryCliente>
let productosDB: Map<string, InMemoryProducto>
let movimientosDB: Map<string, InMemoryMovimiento>
let ventasDB: Map<string, InMemoryVenta>
let idCounter: number

function newId(prefix = "ent"): string {
  return `${prefix}-${++idCounter}`
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: vi.fn(),
    configuracion: { findMany: vi.fn() },
    cliente: { findFirst: vi.fn() },
    producto: { findMany: vi.fn(), update: vi.fn() },
    varianteProducto: { findMany: vi.fn() },
    venta: { create: vi.fn() },
    ventaItem: { create: vi.fn() },
    movimientoStock: { create: vi.fn() },
    movimientoDeuda: { create: vi.fn(), findMany: vi.fn() },
    notificacion: { findFirst: vi.fn(), create: vi.fn() },
  },
}))

import { prisma } from "@/lib/db"
import { registrarVenta } from "@/lib/dominio/ventas"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()

  clientesDB = new Map()
  productosDB = new Map()
  movimientosDB = new Map()
  ventasDB = new Map()
  idCounter = 0

  /**
   * $transaction: ejecuta el callback con un objeto `tx` que replica todas
   * las operaciones de Prisma utilizadas por registrarVenta.
   */
  vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
    // Construir el cliente de transacción en memoria
    // Contador de folio por iteración (simula el consecutivo diario)
    let folioSeq = 0

    const tx = {
      // generarFolio usa $executeRaw (INSERT IGNORE + UPDATE) y $queryRaw (SELECT ... FOR UPDATE)
      $executeRaw: vi.fn().mockResolvedValue(1),
      $queryRaw: vi.fn().mockImplementation(async () => {
        folioSeq += 1
        return [{ valor: String(folioSeq) }]
      }),
      configuracion: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      cliente: {
        findFirst: vi.fn().mockImplementation(async ({ where }: any) => {
          for (const c of clientesDB.values()) {
            if (c.id === where?.id && c.organizacion_id === where?.organizacion_id) {
              return { id: c.id }
            }
          }
          return null
        }),
      },
      producto: {
        findMany: vi.fn().mockImplementation(async ({ where }: any) => {
          const ids: string[] = where?.id?.in ?? []
          const orgId: string = where?.organizacion_id
          return ids
            .map((id) => productosDB.get(id))
            .filter(
              (p): p is InMemoryProducto =>
                p !== undefined && p.activo && p.organizacion_id === orgId
            )
        }),
        update: vi.fn().mockImplementation(async ({ where, data }: any) => {
          const prod = productosDB.get(where.id)
          if (prod) {
            prod.stock_actual = data.stock_actual ?? prod.stock_actual
            productosDB.set(prod.id, prod)
          }
          return prod
        }),
      },
      varianteProducto: {
        findMany: vi.fn().mockResolvedValue([]),
      },
      venta: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const id = newId("ven")
          const venta: InMemoryVenta = {
            id,
            organizacion_id: data.organizacion_id,
            cliente_id: data.cliente_id ?? null,
            metodo_pago: data.metodo_pago,
            total: Number(data.total),
            folio: data.folio,
          }
          ventasDB.set(id, venta)
          return { ...venta, items: [] }
        }),
      },
      ventaItem: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          return {
            id: newId("item"),
            venta_id: data.venta_id,
            producto_id: data.producto_id,
            cantidad: data.cantidad,
            precio_unitario: data.precio_unitario,
            subtotal_linea: data.subtotal_linea,
          }
        }),
      },
      movimientoStock: {
        create: vi.fn().mockResolvedValue({ id: newId("ms") }),
      },
      movimientoDeuda: {
        create: vi.fn().mockImplementation(async ({ data }: any) => {
          const id = newId("mov")
          const movimiento: InMemoryMovimiento = {
            id,
            organizacion_id: data.organizacion_id,
            cliente_id: data.cliente_id,
            tipo: data.tipo,
            monto: Number(data.monto),
            venta_id: data.venta_id ?? null,
          }
          movimientosDB.set(id, movimiento)
          return { ...movimiento, monto: { toString: () => String(movimiento.monto) } }
        }),
      },
      notificacion: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: newId("notif") }),
      },
    }

    return await callback(tx)
  })
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarCliente(orgId: string): InMemoryCliente {
  const id = newId("cli")
  const cliente: InMemoryCliente = { id, organizacion_id: orgId }
  clientesDB.set(id, cliente)
  return cliente
}

function sembrarProducto(orgId: string, stock: number = 100): InMemoryProducto {
  const id = newId("prod")
  const producto: InMemoryProducto = {
    id,
    organizacion_id: orgId,
    nombre: `Producto ${id}`,
    stock_actual: stock,
    stock_minimo: 5,
    activo: true,
    precio_compra: 10,
    precio_venta: 20,
  }
  productosDB.set(id, producto)
  return producto
}

/** Calcula el saldo actual en memoria para un cliente. */
function saldoEnMemoria(clienteId: string, orgId: string): number {
  const movs = Array.from(movimientosDB.values()).filter(
    (m) => m.cliente_id === clienteId && m.organizacion_id === orgId
  )
  const raw = movs.reduce((acc, m) => (m.tipo === "cargo" ? acc + m.monto : acc - m.monto), 0)
  return redondearBancario(raw)
}

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Precio unitario con 2 decimales en [0.50, 500]. */
const arbPrecio = fc
  .integer({ min: 50, max: 50000 })
  .map((c) => Math.round(c) / 100)

/** Cantidad de unidades: 1–10. */
const arbCantidad = fc.integer({ min: 1, max: 10 })

/**
 * Porcentaje de impuesto: siempre 0 para alinear con el mock de configuración
 * que devuelve [] (vacío), lo que hace que registrarVenta use CONFIG_DEFAULTS
 * cuyo porcentaje_impuesto es 0. La propiedad verifica que el cargo coincide
 * con el total calculado por calcularTotalesVenta(lineas, descuento, 0).
 */
const arbImpuesto = fc.constant(0)

/** Una línea de venta (sin descuento de producto para mantener generadores simples). */
const arbLinea = fc.record({
  precio: arbPrecio,
  cantidad: arbCantidad,
})

/** Lista de 1–5 líneas de venta. */
const arbLineas = fc.array(arbLinea, { minLength: 1, maxLength: 5 })

/** Fecha de plazo: hoy o en el futuro (hasta 30 días). */
const arbPlazoFuturo = fc
  .integer({ min: 0, max: 30 })
  .map((dias) => {
    const d = new Date()
    d.setDate(d.getDate() + dias)
    d.setHours(0, 0, 0, 0)
    return d
  })

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 15: Venta fiada válida genera un cargo por el total", () => {
  it(
    "P15.1 — El cargo creado tiene tipo 'cargo' y monto igual al total tras descuentos e impuestos (Req 6.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),       // organizacion_id
          arbLineas,
          arbImpuesto,
          arbPlazoFuturo,
          async (orgId, lineas, porcentajeImpuesto, plazoDeuda) => {
            // Reset estado por iteración
            clientesDB.clear()
            productosDB.clear()
            movimientosDB.clear()
            ventasDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)

            // Sembrar un producto por línea con stock suficiente
            const items = lineas.map((l) => {
              const prod = sembrarProducto(orgId, l.cantidad + 50)
              return {
                producto_id: prod.id,
                cantidad: l.cantidad,
                precio_unitario: l.precio,
              }
            })

            // Calcular el total esperado de forma independiente usando calcularTotalesVenta
            const lineasCalculo = items.map((i) => ({
              precio_unitario: i.precio_unitario,
              cantidad: i.cantidad,
            }))
            const { total: totalEsperado } = calcularTotalesVenta(lineasCalculo, 0, porcentajeImpuesto)

            // Estado antes de la venta
            const saldoAntes = saldoEnMemoria(cliente.id, orgId)
            const movimientosAntes = movimientosDB.size

            // Registrar la venta fiada
            await registrarVenta({
              organizacion_id: orgId,
              items,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazoDeuda,
              descuento_total: 0,
            })

            // Exactamente un MovimientoDeuda nuevo fue creado
            expect(movimientosDB.size).toBe(movimientosAntes + 1)

            // Identificar el cargo creado
            const nuevosMovimientos = Array.from(movimientosDB.values()).filter(
              (m) => m.cliente_id === cliente.id && m.organizacion_id === orgId
            )
            expect(nuevosMovimientos).toHaveLength(1)

            const cargo = nuevosMovimientos[0]

            // El movimiento es un cargo
            expect(cargo.tipo).toBe("cargo")

            // El monto del cargo es igual al total calculado
            expect(cargo.monto).toBe(totalEsperado)

            // El cargo está asociado a la venta recién creada
            expect(cargo.venta_id).toBeTruthy()
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P15.2 — El saldo del cliente aumenta exactamente en el monto del cargo (Req 6.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),    // organizacion_id
          arbLineas,
          arbImpuesto,
          arbPlazoFuturo,
          async (orgId, lineas, porcentajeImpuesto, plazoDeuda) => {
            clientesDB.clear()
            productosDB.clear()
            movimientosDB.clear()
            ventasDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)

            const items = lineas.map((l) => {
              const prod = sembrarProducto(orgId, l.cantidad + 50)
              return {
                producto_id: prod.id,
                cantidad: l.cantidad,
                precio_unitario: l.precio,
              }
            })

            // Calcular el total esperado de forma pura e independiente
            const lineasCalculo = items.map((i) => ({
              precio_unitario: i.precio_unitario,
              cantidad: i.cantidad,
            }))
            const { total: totalEsperado } = calcularTotalesVenta(lineasCalculo, 0, porcentajeImpuesto)

            // Saldo antes de la venta (0 para cliente nuevo)
            const saldoAntes = saldoEnMemoria(cliente.id, orgId)

            // Registrar la venta fiada
            await registrarVenta({
              organizacion_id: orgId,
              items,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazoDeuda,
              descuento_total: 0,
            })

            // El saldo después es el saldo anterior más el total de la venta
            const saldoDespues = saldoEnMemoria(cliente.id, orgId)
            const saldoEsperado = redondearBancario(saldoAntes + totalEsperado)

            expect(saldoDespues).toBe(saldoEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P15.3 — Venta con descuento total: el cargo refleja el total ya reducido (Req 6.6, Req 7.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          // 2–5 líneas para asegurar que hay margen para aplicar descuento total
          fc.array(arbLinea, { minLength: 2, maxLength: 5 }),
          arbImpuesto,
          arbPlazoFuturo,
          async (orgId, lineas, porcentajeImpuesto, plazoDeuda) => {
            clientesDB.clear()
            productosDB.clear()
            movimientosDB.clear()
            ventasDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)

            const items = lineas.map((l) => {
              const prod = sembrarProducto(orgId, l.cantidad + 50)
              return {
                producto_id: prod.id,
                cantidad: l.cantidad,
                precio_unitario: l.precio,
              }
            })

            // Calcular el subtotal para generar un descuento total válido (10% del subtotal)
            const lineasCalculo = items.map((i) => ({
              precio_unitario: i.precio_unitario,
              cantidad: i.cantidad,
            }))
            const { subtotal } = calcularTotalesVenta(lineasCalculo, 0, 0)
            const descuentoTotal = redondearBancario(subtotal * 0.1)

            // Recalcular con el descuento total
            const { total: totalConDescuento } = calcularTotalesVenta(
              lineasCalculo,
              descuentoTotal,
              porcentajeImpuesto
            )

            // Registrar la venta fiada con descuento total
            await registrarVenta({
              organizacion_id: orgId,
              items,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazoDeuda,
              descuento_total: descuentoTotal,
            })

            // Verificar que el cargo tiene el monto = total con descuento aplicado
            const movimientos = Array.from(movimientosDB.values()).filter(
              (m) => m.cliente_id === cliente.id && m.organizacion_id === orgId && m.tipo === "cargo"
            )
            expect(movimientos).toHaveLength(1)
            expect(movimientos[0].monto).toBe(totalConDescuento)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P15.4 — Dos ventas fiadas del mismo cliente generan dos cargos independientes y el saldo acumula (Req 6.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbLineas,
          arbLineas,
          arbImpuesto,
          arbPlazoFuturo,
          async (orgId, lineas1, lineas2, porcentajeImpuesto, plazoDeuda) => {
            clientesDB.clear()
            productosDB.clear()
            movimientosDB.clear()
            ventasDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)

            // Construir items de la primera venta
            const items1 = lineas1.map((l) => {
              const prod = sembrarProducto(orgId, l.cantidad + 50)
              return { producto_id: prod.id, cantidad: l.cantidad, precio_unitario: l.precio }
            })

            // Construir items de la segunda venta
            const items2 = lineas2.map((l) => {
              const prod = sembrarProducto(orgId, l.cantidad + 50)
              return { producto_id: prod.id, cantidad: l.cantidad, precio_unitario: l.precio }
            })

            // Calcular totales esperados de cada venta
            const { total: total1 } = calcularTotalesVenta(
              items1.map((i) => ({ precio_unitario: i.precio_unitario, cantidad: i.cantidad })),
              0,
              porcentajeImpuesto
            )
            const { total: total2 } = calcularTotalesVenta(
              items2.map((i) => ({ precio_unitario: i.precio_unitario, cantidad: i.cantidad })),
              0,
              porcentajeImpuesto
            )

            // Registrar las dos ventas fiadas
            await registrarVenta({
              organizacion_id: orgId,
              items: items1,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazoDeuda,
              descuento_total: 0,
            })
            await registrarVenta({
              organizacion_id: orgId,
              items: items2,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazoDeuda,
              descuento_total: 0,
            })

            // Deben existir exactamente 2 cargos para este cliente
            const cargos = Array.from(movimientosDB.values()).filter(
              (m) => m.cliente_id === cliente.id && m.organizacion_id === orgId && m.tipo === "cargo"
            )
            expect(cargos).toHaveLength(2)

            // Los montos de los cargos corresponden a los totales de cada venta
            const montos = cargos.map((c) => c.monto).sort((a, b) => a - b)
            const esperados = [total1, total2].sort((a, b) => a - b)
            expect(montos[0]).toBe(esperados[0])
            expect(montos[1]).toBe(esperados[1])

            // El saldo acumulado es la suma de los dos totales
            const saldoTotal = saldoEnMemoria(cliente.id, orgId)
            const saldoEsperado = redondearBancario(total1 + total2)
            expect(saldoTotal).toBe(saldoEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P15.5 — El cargo está vinculado a la venta registrada mediante venta_id (Req 6.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          arbLineas,
          arbImpuesto,
          arbPlazoFuturo,
          async (orgId, lineas, porcentajeImpuesto, plazoDeuda) => {
            clientesDB.clear()
            productosDB.clear()
            movimientosDB.clear()
            ventasDB.clear()
            idCounter = 0

            const cliente = sembrarCliente(orgId)
            const items = lineas.map((l) => {
              const prod = sembrarProducto(orgId, l.cantidad + 50)
              return { producto_id: prod.id, cantidad: l.cantidad, precio_unitario: l.precio }
            })

            const resultado = await registrarVenta({
              organizacion_id: orgId,
              items,
              metodo_pago: "fiado",
              cliente_id: cliente.id,
              plazo_deuda: plazoDeuda,
              descuento_total: 0,
            })

            // Encontrar el cargo creado para este cliente
            const cargo = Array.from(movimientosDB.values()).find(
              (m) => m.cliente_id === cliente.id && m.tipo === "cargo"
            )

            expect(cargo).toBeDefined()
            // El cargo tiene el venta_id de la venta recién registrada
            expect(cargo?.venta_id).toBe(resultado.id)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
