// Feature: dashboard-metricas-notificaciones, Property 5: Métricas correctas, inclusivas y redondeadas
//
// Validates: Requirements R2.4, R2.6, R2.7, R2.8, R2.9, R2.10, R2.13
//
// PBT model-based: siembra ventas (con estado/fecha/items) y devoluciones en una BD
// de prueba, invoca `calcularMetricas(desde, hasta, tz)` y compara el resultado contra
// un modelo en memoria que filtra de forma INCLUSIVA por el rango en la zona horaria
// `tz`. Incluye registros en los extremos exactos del rango (inicio y fin).
//
// Estado esperado en TDD: este test COMPILA pero FALLA porque `lib/dominio/metricas.ts`
// todavía no existe.
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as fc from "fast-check"
import { fromZonedTime } from "date-fns-tz"
import { redondearBancario } from "@/lib/money"
// Importación bajo prueba — aún no implementada (TDD test-first).
import { calcularMetricas } from "@/lib/dominio/metricas"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

const TZ = "America/Mexico_City"
const ORG_DEFAULT = "00000000-0000-4000-8000-000000000001"

// ───────────────────────── Utilidades de fecha civil ──────────────────────────

function pad(n: number): string {
  return String(n).padStart(2, "0")
}

function civil(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`
}

function addDiasCivil(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

// Límites instantáneos UTC del rango civil [desde, hasta] en `tz`, inclusivos.
function limitesUtc(desde: string, hasta: string, tz: string): { inicio: number; fin: number } {
  const inicio = fromZonedTime(`${desde}T00:00:00.000`, tz).getTime()
  const fin = fromZonedTime(`${hasta}T23:59:59.999`, tz).getTime()
  return { inicio, fin }
}

function cents(n: number): number {
  return Math.round(n * 100)
}

// ───────────────────────────── Modelo en memoria ──────────────────────────────

type ProductoSeed = { id: string; precio_compra: number; precio_venta: number }

type ItemSeed = { producto_id: string; cantidad: number; precio_unitario: number }

type VentaSeed = {
  estado: "completada" | "pendiente" | "cancelada"
  total: number
  creado_en: Date
  items: ItemSeed[]
}

type DevolucionSeed = { producto_id: string; cantidad: number; creado_en: Date }

type MetricasModelo = {
  totalSales: number
  totalReturns: number
  totalExpenses: number
  estimatedProfit: number
}

function calcularModelo(
  productos: ProductoSeed[],
  ventas: VentaSeed[],
  devoluciones: DevolucionSeed[],
  desde: string,
  hasta: string,
  tz: string
): MetricasModelo {
  const { inicio, fin } = limitesUtc(desde, hasta, tz)
  const enRango = (d: Date) => {
    const t = d.getTime()
    return t >= inicio && t <= fin // inclusivo en ambos extremos (R2.4)
  }
  const byId = new Map(productos.map((p) => [p.id, p]))

  let totalSales = 0
  let totalExpenses = 0
  for (const v of ventas) {
    if (v.estado !== "completada") continue // R2.6 / R2.8 sólo completadas
    if (!enRango(v.creado_en)) continue
    totalSales += v.total
    for (const it of v.items) {
      const p = byId.get(it.producto_id)!
      totalExpenses += p.precio_compra * it.cantidad // R2.8 precio_compra × cantidad
    }
  }

  let totalReturns = 0
  for (const m of devoluciones) {
    if (!enRango(m.creado_en)) continue
    const p = byId.get(m.producto_id)!
    totalReturns += p.precio_venta * m.cantidad // R2.7 valorado a precio_venta
  }

  const estimatedProfit = totalSales - totalExpenses // R2.9
  return {
    totalSales: redondearBancario(totalSales),
    totalReturns: redondearBancario(totalReturns),
    totalExpenses: redondearBancario(totalExpenses),
    estimatedProfit: redondearBancario(estimatedProfit),
  }
}

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Property 5: Métricas del dashboard — correctas, inclusivas y redondeadas",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    // Catálogo fijo de productos con precios conocidos (en pesos, 2 decimales exactos).
    const PRODUCTOS: ProductoSeed[] = [
      { id: "", precio_compra: 10.5, precio_venta: 25.0 },
      { id: "", precio_compra: 3.33, precio_venta: 9.99 },
      { id: "", precio_compra: 100.0, precio_venta: 149.5 },
      { id: "", precio_compra: 0.75, precio_venta: 1.25 },
    ]
    const sufijo = `MET-${Date.now()}`

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p

      // Crea el catálogo de productos bajo la organización por defecto.
      for (let i = 0; i < PRODUCTOS.length; i++) {
        const creado = await prisma.producto.create({
          data: {
            organizacion_id: ORG_DEFAULT,
            codigo_barras: `${sufijo}-${i}`,
            nombre: `Producto métricas ${i}`,
            precio_compra: PRODUCTOS[i].precio_compra,
            precio_venta: PRODUCTOS[i].precio_venta,
            stock_actual: 1000,
            stock_minimo: 0,
          },
        })
        PRODUCTOS[i].id = creado.id
      }
    })

    afterAll(async () => {
      if (!prisma) return
      const ids = PRODUCTOS.map((p) => p.id).filter(Boolean)
      // Orden de borrado respetando llaves foráneas.
      await prisma.ventaItem.deleteMany({ where: { producto_id: { in: ids } } })
      await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: ids } } })
      // Limpia ventas huérfanas de prueba (sin ítems) creadas durante las corridas.
      await prisma.venta.deleteMany({ where: { folio: { startsWith: "VTA-MET-" } } })
      await prisma.producto.deleteMany({ where: { id: { in: ids } } })
    })

    // Vacía las tablas transaccionales para dejar sólo los datos de la corrida actual.
    async function limpiarTransaccional() {
      await prisma.ventaItem.deleteMany({})
      await prisma.venta.deleteMany({})
      await prisma.movimientoStock.deleteMany({})
    }

    // ─── R2.13: sin registros, las 4 métricas valen 0 ───
    it("sin registros en el rango, las cuatro métricas valen 0", async () => {
      await limpiarTransaccional()
      const dto = await calcularMetricas("2099-01-01", "2099-01-31", TZ)
      expect(dto.totalSales.actual).toBe(0)
      expect(dto.totalReturns.actual).toBe(0)
      expect(dto.totalExpenses.actual).toBe(0)
      expect(dto.estimatedProfit.actual).toBe(0)
    })

    // ─── Generadores ───
    const arbProdIdx = fc.integer({ min: 0, max: PRODUCTOS.length - 1 })
    const arbEstado = fc.constantFrom("completada", "pendiente", "cancelada") as fc.Arbitrary<
      VentaSeed["estado"]
    >
    // Posición temporal del registro respecto al rango, garantizando cobertura de extremos.
    const arbKind = fc.constantFrom("before", "start", "inside", "end", "after") as fc.Arbitrary<
      "before" | "start" | "inside" | "end" | "after"
    >
    const arbFrac = fc.double({ min: 0, max: 1, noNaN: true })

    const arbItem = fc.record({
      prodIdx: arbProdIdx,
      cantidad: fc.integer({ min: 1, max: 20 }),
      // precio unitario en centavos → pesos con 2 decimales exactos
      precioCents: fc.integer({ min: 1, max: 100000 }),
    })

    const arbVenta = fc.record({
      estado: arbEstado,
      kind: arbKind,
      frac: arbFrac,
      items: fc.array(arbItem, { minLength: 1, maxLength: 4 }),
    })

    const arbDevolucion = fc.record({
      prodIdx: arbProdIdx,
      cantidad: fc.integer({ min: 1, max: 20 }),
      kind: arbKind,
      frac: arbFrac,
    })

    const arbSeed = fc.record({
      // Rango civil: año fijo, mes 1..12, día 1..20, duración 0..15 días.
      mes: fc.integer({ min: 1, max: 12 }),
      dia: fc.integer({ min: 1, max: 20 }),
      duracion: fc.integer({ min: 0, max: 15 }),
      ventas: fc.array(arbVenta, { minLength: 0, maxLength: 8 }),
      devoluciones: fc.array(arbDevolucion, { minLength: 0, maxLength: 6 }),
    })

    function instante(
      kind: "before" | "start" | "inside" | "end" | "after",
      frac: number,
      inicio: number,
      fin: number
    ): Date {
      switch (kind) {
        case "before":
          return new Date(inicio - 1000)
        case "start":
          return new Date(inicio)
        case "inside":
          return new Date(inicio + Math.floor(frac * Math.max(0, fin - inicio)))
        case "end":
          return new Date(fin)
        case "after":
          return new Date(fin + 1000)
      }
    }

    it("calcularMetricas coincide con el modelo en memoria (inclusivo, redondeado)", async () => {
      let folioSeq = 0
      await fc.assert(
        fc.asyncProperty(arbSeed, async (seed) => {
          const desde = civil(2025, seed.mes, seed.dia)
          const hasta = addDiasCivil(desde, seed.duracion)
          const { inicio, fin } = limitesUtc(desde, hasta, TZ)

          // Construye las estructuras de siembra resolviendo precios e instantes.
          const ventas: VentaSeed[] = seed.ventas.map((v) => {
            const items: ItemSeed[] = v.items.map((it) => ({
              producto_id: PRODUCTOS[it.prodIdx].id,
              cantidad: it.cantidad,
              precio_unitario: it.precioCents / 100,
            }))
            const total = items.reduce(
              (acc, it) => acc + it.precio_unitario * it.cantidad,
              0
            )
            return {
              estado: v.estado,
              total: redondearBancario(total),
              creado_en: instante(v.kind, v.frac, inicio, fin),
              items,
            }
          })

          const devoluciones: DevolucionSeed[] = seed.devoluciones.map((d) => ({
            producto_id: PRODUCTOS[d.prodIdx].id,
            cantidad: d.cantidad,
            creado_en: instante(d.kind, d.frac, inicio, fin),
          }))

          // Siembra: tabla transaccional limpia + datos de la corrida.
          await limpiarTransaccional()
          for (const v of ventas) {
            const venta = await prisma.venta.create({
              data: {
                organizacion_id: ORG_DEFAULT,
                folio: `VTA-MET-${folioSeq++}`,
                subtotal: v.total,
                impuesto: 0,
                total: v.total,
                metodo_pago: "efectivo",
                estado: v.estado,
                creado_en: v.creado_en,
              },
            })
            for (const it of v.items) {
              await prisma.ventaItem.create({
                data: {
                  organizacion_id: ORG_DEFAULT,
                  venta_id: venta.id,
                  producto_id: it.producto_id,
                  cantidad: it.cantidad,
                  precio_unitario: it.precio_unitario,
                  subtotal_linea: redondearBancario(it.precio_unitario * it.cantidad),
                },
              })
            }
          }
          for (const d of devoluciones) {
            await prisma.movimientoStock.create({
              data: {
                organizacion_id: ORG_DEFAULT,
                producto_id: d.producto_id,
                tipo: "devolucion",
                cantidad: d.cantidad,
                stock_resultante: 0,
                creado_en: d.creado_en,
              },
            })
          }

          const esperado = calcularModelo(PRODUCTOS, ventas, devoluciones, desde, hasta, TZ)
          const dto = await calcularMetricas(desde, hasta, TZ)

          // 1) Coincidencia exacta (en centavos) con el modelo inclusivo.
          if (cents(dto.totalSales.actual) !== cents(esperado.totalSales)) return false
          if (cents(dto.totalReturns.actual) !== cents(esperado.totalReturns)) return false
          if (cents(dto.totalExpenses.actual) !== cents(esperado.totalExpenses)) return false
          if (cents(dto.estimatedProfit.actual) !== cents(esperado.estimatedProfit)) return false

          // 2) estimatedProfit === totalSales − totalExpenses (R2.9)
          if (
            cents(dto.estimatedProfit.actual) !==
            cents(redondearBancario(dto.totalSales.actual - dto.totalExpenses.actual))
          ) {
            return false
          }

          // 3) Todo monto de salida cumple v === redondearBancario(v) (R2.10)
          for (const m of [
            dto.totalSales,
            dto.totalReturns,
            dto.totalExpenses,
            dto.estimatedProfit,
          ]) {
            if (m.actual !== redondearBancario(m.actual)) return false
            if (m.anterior !== redondearBancario(m.anterior)) return false
          }

          return true
        }),
        { numRuns: 50 }
      )
    })
  }
)
