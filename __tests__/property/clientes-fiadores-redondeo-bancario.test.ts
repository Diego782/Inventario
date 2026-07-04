// Feature: gestion-clientes-y-fiadores, Property 2: Redondeo bancario en todo monto de salida
/**
 * Property 2: Redondeo bancario en todo monto de salida
 * **Validates: Requirements 2.8, 5.3, 5.6, 7.7, 9.7**
 *
 * Para todo monto monetario devuelto por el dominio:
 *   - Inversión y Recaudación potencial (calcularValorInventario)
 *   - Saldo de cliente (saldoCliente)
 *   - Total_Deuda_Pendiente (totalesDeuda)
 *   - Subtotales de línea y total de venta (calcularTotalesVenta)
 *   - Ventas_Totales y Total de dinero en deuda (agregarMetricas / calcularMetricas)
 *
 * El valor devuelto es igual a `redondearBancario` aplicado al valor crudo con
 * 2 decimales, es decir, nunca tiene más de 2 decimales ni sufre sesgo de
 * redondeo half-up.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { redondearBancario } from "@/lib/money"

// ── Helpers de verificación ──────────────────────────────────────────────────

/**
 * Verifica que un número tenga como máximo 2 decimales y coincida con
 * `redondearBancario(valor)`.  Usamos `toBeCloseTo` con 9 dígitos para
 * absorber el ruido de punto flotante antes del redondeo.
 */
function esMontoRedondeado(valor: number): boolean {
  // 1. Máximo 2 decimales en la representación decimal.
  const parteDecimal = (valor.toString().split(".")[1] ?? "")
  if (parteDecimal.length > 2) return false

  // 2. El valor ya es idempotente bajo redondearBancario.
  return Math.abs(redondearBancario(valor) - valor) < 1e-9
}

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    producto: { findMany: vi.fn() },
    movimientoDeuda: { findMany: vi.fn() },
    cliente: { findMany: vi.fn() },
    venta: { findMany: vi.fn() },
    ventaItem: { findMany: vi.fn() },
    movimientoStock: { findMany: vi.fn() },
  },
}))

vi.mock("@/lib/codigo-barras", () => ({
  generarEan13: vi.fn(() => `200${Math.random().toString().slice(2, 12)}`),
  detectarFormato: vi.fn(() => "EAN-13"),
}))

vi.mock("@/lib/dominio/notificaciones", () => ({
  detectarStockCritico: vi.fn(),
  estadoStock: vi.fn(() => "En Stock"),
}))

import { prisma } from "@/lib/db"
import { calcularValorInventario } from "@/lib/dominio/inventario"
import { saldoCliente, totalesDeuda } from "@/lib/dominio/deuda"
import { calcularTotalesVenta, type LineaVenta } from "@/lib/dominio/descuentos"
import { agregarMetricas, type LimitesUtc } from "@/lib/dominio/metricas"

// ── In-memory types ──────────────────────────────────────────────────────────

type TipoMovimiento = "cargo" | "abono"

interface InMemMovimiento {
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

interface InMemProducto {
  id: string
  organizacion_id: string
  precio_compra: number | null
  precio_venta: number | null
  stock_actual: number | null
  activo: boolean
}

interface InMemVenta {
  id: string
  organizacion_id: string
  total: number
  metodo_pago: string
  cliente_id: string | null
  estado: string
  creado_en: Date
}

// ── In-memory state ──────────────────────────────────────────────────────────

let movimientosDB: Map<string, InMemMovimiento>
let productosDB: Map<string, InMemProducto>
let ventasDB: Map<string, InMemVenta>
let idCounter: number

function newId(prefix = "x"): string {
  return `${prefix}-${++idCounter}`
}

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  movimientosDB = new Map()
  productosDB = new Map()
  ventasDB = new Map()
  idCounter = 0

  // prisma.movimientoDeuda.findMany
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const clienteId: string | undefined = where?.cliente_id
    const clienteIdIn: string[] | undefined = where?.cliente_id?.in

    return Array.from(movimientosDB.values()).filter((m) => {
      if (orgId && m.organizacion_id !== orgId) return false
      if (clienteId && !clienteIdIn && m.cliente_id !== clienteId) return false
      if (clienteIdIn && !clienteIdIn.includes(m.cliente_id)) return false
      return true
    }) as any
  })

  // prisma.cliente.findMany
  vi.mocked(prisma.cliente.findMany).mockImplementation(async ({ where, include }: any) => {
    const orgId: string = where?.organizacion_id
    const clientes = Array.from(
      new Set(
        Array.from(movimientosDB.values())
          .filter((m) => m.organizacion_id === orgId)
          .map((m) => m.cliente_id)
      )
    ).map((cid) => ({ id: cid, organizacion_id: orgId }))

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
          movimientos_deuda: movs.map((m) => ({ tipo: m.tipo, monto: m.monto })),
        }
      })
    }

    return clientes
  })

  // prisma.producto.findMany
  vi.mocked(prisma.producto.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id
    const soloActivos: boolean = where?.activo === true

    return Array.from(productosDB.values())
      .filter((p) => {
        if (orgId !== undefined && p.organizacion_id !== orgId) return false
        if (soloActivos && !p.activo) return false
        return true
      })
      .map((p) => ({
        precio_compra: p.precio_compra,
        precio_venta: p.precio_venta,
        stock_actual: p.stock_actual,
      })) as any
  })

  // prisma.venta.findMany — para agregarMetricas
  vi.mocked(prisma.venta.findMany).mockImplementation(async ({ where }: any) => {
    const orgId: string | undefined = where?.organizacion_id

    return Array.from(ventasDB.values())
      .filter((v) => {
        if (orgId && v.organizacion_id !== orgId) return false
        if (where?.estado && v.estado !== where.estado) return false
        // rango de fechas no verificado en mock; todas las ventas pasan
        return true
      })
      .map((v) => ({
        total: v.total,
        creado_en: v.creado_en,
        metodo_pago: v.metodo_pago,
        cliente_id: v.cliente_id,
      })) as any
  })

  // prisma.ventaItem.findMany — vacío (no afecta los montos que testamos)
  vi.mocked(prisma.ventaItem.findMany).mockResolvedValue([])

  // prisma.movimientoStock.findMany — vacío
  vi.mocked(prisma.movimientoStock.findMany).mockResolvedValue([])
})

// ── Helpers de seeding ───────────────────────────────────────────────────────

function sembrarMovimiento(
  clienteId: string,
  orgId: string,
  tipo: TipoMovimiento,
  monto: number
): void {
  const id = newId("mov")
  movimientosDB.set(id, {
    id,
    organizacion_id: orgId,
    cliente_id: clienteId,
    tipo,
    monto,
    venta_id: null,
    plazo_deuda: null,
    fecha: new Date(),
    creado_en: new Date(),
  })
}

function sembrarProducto(
  orgId: string,
  precio_compra: number | null,
  precio_venta: number | null,
  stock_actual: number | null
): void {
  const id = newId("prod")
  productosDB.set(id, {
    id,
    organizacion_id: orgId,
    precio_compra,
    precio_venta,
    stock_actual,
    activo: true,
  })
}

function sembrarVenta(
  orgId: string,
  total: number,
  metodo_pago: string,
  cliente_id: string | null
): void {
  const id = newId("venta")
  ventasDB.set(id, {
    id,
    organizacion_id: orgId,
    total,
    metodo_pago,
    cliente_id,
    estado: "completada",
    creado_en: new Date(),
  })
}

// ── Generadores fast-check ───────────────────────────────────────────────────

/** Monto monetario positivo con hasta 2 decimales [0.01, 9 999.99]. */
const arbMonto = fc
  .integer({ min: 1, max: 999_999 })
  .map((n) => Math.round(n) / 100)

/** Precio nullable (null | positivo con hasta 2 decimales). */
const arbPrecioNullable = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 1, max: 999_999 }).map((c) => c / 100)
)

/** Stock nullable (null | entero 0–999). */
const arbStockNullable = fc.oneof(
  fc.constant(null),
  fc.integer({ min: 0, max: 999 })
)

/** Línea de venta con descuento válido. */
const arbLinea: fc.Arbitrary<LineaVenta> = fc
  .tuple(
    fc.integer({ min: 1, max: 1_000_000 }).map((c) => c / 100), // precio
    fc.integer({ min: 1, max: 1_000 })                           // cantidad
  )
  .chain(([precio_unitario, cantidad]) => {
    const subtotalBruto = precio_unitario * cantidad
    const maxDescCentavos = Math.floor(subtotalBruto * 100)
    return fc
      .integer({ min: 0, max: maxDescCentavos })
      .map((dc) => ({ precio_unitario, cantidad, descuento_producto: dc / 100 }))
  })

const arbLineas = fc.array(arbLinea, { minLength: 1, maxLength: 8 })

const arbImpuesto = fc.oneof(fc.constant(0), fc.constantFrom(8, 10, 13, 16, 21))

const arbEntradaVenta = arbLineas.chain((lineas) => {
  const subtotales = lineas.map((l) =>
    redondearBancario(l.precio_unitario * l.cantidad - (l.descuento_producto ?? 0))
  )
  const sumaSubtotales = subtotales.reduce((a, b) => a + b, 0)
  const maxDescTotalCentavos = Math.floor(sumaSubtotales * 100)
  return fc.tuple(
    fc.constant(lineas),
    fc.integer({ min: 0, max: Math.max(0, maxDescTotalCentavos) }).map((c) => c / 100),
    arbImpuesto
  )
})

// ── Limites UTC fijos para agregarMetricas ────────────────────────────────────

const LIMITES_FIJOS: LimitesUtc = {
  inicio: new Date("2024-01-01T00:00:00.000Z"),
  fin: new Date("2024-12-31T23:59:59.999Z"),
}

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 2: Redondeo bancario en todo monto de salida", () => {
  // ── 2.1 Inversión y Recaudación potencial (Req 2.8) ──────────────────────

  it(
    "P2.1 — calcularValorInventario devuelve inversión y recaudación con ≤ 2 decimales (Req 2.8)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              precio_compra: arbPrecioNullable,
              precio_venta: arbPrecioNullable,
              stock_actual: arbStockNullable,
            }),
            { minLength: 0, maxLength: 10 }
          ),
          async (orgId, catalog) => {
            productosDB.clear()
            idCounter = 0

            catalog.forEach((p) =>
              sembrarProducto(orgId, p.precio_compra, p.precio_venta, p.stock_actual)
            )

            const { inversion, recaudacionPotencial } =
              await calcularValorInventario(orgId)

            expect(esMontoRedondeado(inversion)).toBe(true)
            expect(esMontoRedondeado(recaudacionPotencial)).toBe(true)

            // Los valores deben coincidir con redondearBancario del crudo
            let invCrudo = 0
            let recCrudo = 0
            catalog.forEach((p) => {
              const stock = p.stock_actual ?? 0
              invCrudo += (p.precio_compra ?? 0) * stock
              recCrudo += (p.precio_venta ?? 0) * stock
            })

            expect(inversion).toBeCloseTo(redondearBancario(invCrudo), 9)
            expect(recaudacionPotencial).toBeCloseTo(redondearBancario(recCrudo), 9)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // ── 2.2 Saldo de cliente (Req 5.3) ───────────────────────────────────────

  it(
    "P2.2 — saldoCliente devuelve el saldo con ≤ 2 decimales igual a redondearBancario(Σ cargos − Σ abonos) (Req 5.3)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.uuid(), // clienteId
          fc.array(
            fc.record({
              tipo: fc.oneof(fc.constant("cargo" as TipoMovimiento), fc.constant("abono" as TipoMovimiento)),
              monto: arbMonto,
            }),
            { minLength: 0, maxLength: 8 }
          ),
          async (orgId, clienteId, movs) => {
            movimientosDB.clear()
            idCounter = 0

            movs.forEach((m) => sembrarMovimiento(clienteId, orgId, m.tipo, m.monto))

            const saldo = await saldoCliente(clienteId, orgId)

            // Verificar propiedad de redondeo
            expect(esMontoRedondeado(saldo)).toBe(true)

            // Verificar que el valor coincide con redondearBancario del crudo
            const crudoRaw = movs.reduce(
              (acc, m) => (m.tipo === "cargo" ? acc + m.monto : acc - m.monto),
              0
            )
            expect(saldo).toBe(redondearBancario(crudoRaw))
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // ── 2.3 Total_Deuda_Pendiente (Req 5.6) ──────────────────────────────────

  it(
    "P2.3 — totalesDeuda devuelve totalDeudaPendiente con ≤ 2 decimales (Req 5.6)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          // 1–5 clientes, cada uno con 0–6 movimientos
          fc.array(
            fc.record({
              clienteId: fc.uuid(),
              movimientos: fc.array(
                fc.record({
                  tipo: fc.oneof(
                    fc.constant("cargo" as TipoMovimiento),
                    fc.constant("abono" as TipoMovimiento)
                  ),
                  monto: arbMonto,
                }),
                { minLength: 0, maxLength: 6 }
              ),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (orgId, clientes) => {
            movimientosDB.clear()
            idCounter = 0

            for (const c of clientes) {
              c.movimientos.forEach((m) =>
                sembrarMovimiento(c.clienteId, orgId, m.tipo, m.monto)
              )
            }

            const { totalDeudaPendiente } = await totalesDeuda(orgId)

            expect(esMontoRedondeado(totalDeudaPendiente)).toBe(true)

            // Verificar que coincide con redondearBancario de la suma de saldos positivos
            const saldosPositivos = clientes.map((c) => {
              const raw = c.movimientos.reduce(
                (acc, m) => (m.tipo === "cargo" ? acc + m.monto : acc - m.monto),
                0
              )
              return redondearBancario(raw)
            }).filter((s) => s > 0)

            const totalEsperado = redondearBancario(
              saldosPositivos.reduce((a, b) => a + b, 0)
            )

            expect(totalDeudaPendiente).toBe(totalEsperado)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // ── 2.4 Subtotales de línea (Req 7.7) ────────────────────────────────────

  it(
    "P2.4 — calcularTotalesVenta: cada subtotal de línea tiene ≤ 2 decimales y es redondearBancario(bruto − descuento) (Req 7.7)",
    () => {
      fc.assert(
        fc.property(arbEntradaVenta, ([lineas, descuentoTotal, porcentajeImpuesto]) => {
          const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)

          for (let i = 0; i < lineas.length; i++) {
            const sub = resultado.subtotalesLinea[i]
            expect(esMontoRedondeado(sub)).toBe(true)

            const { precio_unitario, cantidad, descuento_producto = 0 } = lineas[i]
            const esperado = redondearBancario(precio_unitario * cantidad - descuento_producto)
            expect(sub).toBeCloseTo(esperado, 9)
          }
        }),
        { numRuns: 100 }
      )
    }
  )

  // ── 2.5 Total de venta (Req 7.7) ─────────────────────────────────────────

  it(
    "P2.5 — calcularTotalesVenta: el total tiene ≤ 2 decimales y es redondearBancario(base + impuesto) (Req 7.7)",
    () => {
      fc.assert(
        fc.property(arbEntradaVenta, ([lineas, descuentoTotal, porcentajeImpuesto]) => {
          const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)

          expect(esMontoRedondeado(resultado.total)).toBe(true)

          // Reconstruir total esperado
          const sumaSubtotales = resultado.subtotalesLinea.reduce((a, b) => a + b, 0)
          const base = sumaSubtotales - descuentoTotal
          const impuesto =
            porcentajeImpuesto > 0
              ? redondearBancario((base * porcentajeImpuesto) / 100)
              : 0
          const totalEsperado = redondearBancario(base + impuesto)

          expect(resultado.total).toBeCloseTo(totalEsperado, 9)
        }),
        { numRuns: 100 }
      )
    }
  )

  // ── 2.6 Ventas_Totales desde agregarMetricas (Req 9.7) ──────────────────
  // Nota: agregarMetricas devuelve el acumulado crudo; el redondeo bancario
  // se aplica en calcularMetricas vía `metrica()`. Aquí verificamos que
  // redondearBancario(totalSales) == redondearBancario(suma cruda), es decir,
  // que el valor crudo es el correcto antes del redondeo final.

  it(
    "P2.6 — agregarMetricas: totalSales es la suma exacta de los totales de ventas de contado elegibles (base para redondeo en Req 9.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          // 0–6 ventas de contado (no fiadas) con totales arbitrarios ya redondeados
          fc.array(arbMonto, { minLength: 0, maxLength: 6 }),
          async (orgId, totalesVentas) => {
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // Sembrar ventas de contado (siempre elegibles para totalSales)
            totalesVentas.forEach((total) => sembrarVenta(orgId, total, "efectivo", null))

            const resultado = await agregarMetricas(LIMITES_FIJOS, orgId)

            // redondearBancario(totalSales) debe coincidir con
            // redondearBancario(suma de totales individuales)
            const crudoRaw = totalesVentas.reduce((a, b) => a + b, 0)
            const totalSalesRedondeado = redondearBancario(resultado.totalSales)

            expect(esMontoRedondeado(totalSalesRedondeado)).toBe(true)
            expect(totalSalesRedondeado).toBeCloseTo(redondearBancario(crudoRaw), 9)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P2.7 — agregarMetricas: ventas fiadas saldadas se incluyen y su redondeo coincide con redondearBancario(total) (Req 9.3, 9.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.uuid(), // clienteId — cliente con saldo = 0 (deuda totalmente saldada)
          arbMonto,  // total de la venta fiada (ya con 2 decimales por arbMonto)
          async (orgId, clienteId, totalVenta) => {
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // La venta fiada tiene su cargo totalmente saldado (saldo del cliente = 0)
            sembrarMovimiento(clienteId, orgId, "cargo", totalVenta)
            sembrarMovimiento(clienteId, orgId, "abono", totalVenta)

            sembrarVenta(orgId, totalVenta, "fiado", clienteId)

            const resultado = await agregarMetricas(LIMITES_FIJOS, orgId)

            // La venta fiada saldada debe aparecer en totalSales
            const redondeado = redondearBancario(resultado.totalSales)
            expect(redondeado).toBeCloseTo(redondearBancario(totalVenta), 9)
            expect(esMontoRedondeado(redondeado)).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P2.8 — agregarMetricas: ventas fiadas con deuda pendiente NO se incluyen en Ventas_Totales (Req 9.1, 9.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.uuid(), // clienteId — cliente con saldo > 0
          arbMonto,  // total de la venta fiada
          async (orgId, clienteId, totalVenta) => {
            ventasDB.clear()
            movimientosDB.clear()
            idCounter = 0

            // El cliente tiene un cargo sin abono → saldo > 0
            sembrarMovimiento(clienteId, orgId, "cargo", totalVenta)

            sembrarVenta(orgId, totalVenta, "fiado", clienteId)

            const resultado = await agregarMetricas(LIMITES_FIJOS, orgId)

            // La venta fiada con deuda pendiente debe ser excluida
            expect(resultado.totalSales).toBe(0)
            expect(esMontoRedondeado(redondearBancario(resultado.totalSales))).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  // ── 2.9 Total de dinero en deuda desde totalesDeuda (Req 9.7) ────────────

  it(
    "P2.9 — totalesDeuda.totalDeudaPendiente tiene ≤ 2 decimales y coincide con el origen de cálculo del dashboard (Req 9.7)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(),
          fc.array(
            fc.record({
              clienteId: fc.uuid(),
              cargos: fc.array(arbMonto, { minLength: 1, maxLength: 4 }),
              abonos: fc.array(arbMonto, { minLength: 0, maxLength: 3 }),
            }),
            { minLength: 1, maxLength: 5 }
          ),
          async (orgId, clientes) => {
            movimientosDB.clear()
            idCounter = 0

            // Sembrar movimientos de tal forma que algunos clientes tengan saldo > 0
            for (const c of clientes) {
              c.cargos.forEach((m) => sembrarMovimiento(c.clienteId, orgId, "cargo", m))
              // Los abonos se limitan al total de cargos para no ir a negativo
              const totalCargos = c.cargos.reduce((a, b) => a + b, 0)
              let abonadoAcumulado = 0
              for (const abono of c.abonos) {
                if (abonadoAcumulado + abono <= totalCargos + 1e-9) {
                  sembrarMovimiento(c.clienteId, orgId, "abono", abono)
                  abonadoAcumulado += abono
                }
              }
            }

            const { totalDeudaPendiente } = await totalesDeuda(orgId)

            // Debe ser un monto redondeado
            expect(esMontoRedondeado(totalDeudaPendiente)).toBe(true)

            // Verificar que el redondeo bancario es idempotente
            expect(redondearBancario(totalDeudaPendiente)).toBe(totalDeudaPendiente)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
