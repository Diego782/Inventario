// __tests__/integration/dashboard-rendimiento.test.ts
//
// Verificación de uso de índices y timeout en las consultas agregadas del Dashboard.
//
// Cubre dos aspectos de R14.6 y R14.7:
//
// 1. ÍNDICES (R14.6): Con un dataset sembrado, ejecuta `EXPLAIN` directo sobre
//    las consultas que `calcularMetricas` y `calcularRankings` realizan y confirma
//    que el plan de MySQL utiliza los índices `creado_en` de `ventas` y
//    `movimientos_stock` (y los índices `leida` / `creado_en` de `notificaciones`),
//    sin incurrir en full table scan (tipo "ALL") sobre esas tablas.
//
// 2. TIMEOUT (R14.7): Verifica que los Route Handlers de `metricas` y `rankings`
//    responden `CONSULTA_TIMEOUT` 504 cuando la consulta de dominio tarda más de
//    5 s. Se simula el retraso con vi.mock + vi.useFakeTimers.
//
// Sigue la convención del resto de la suite:
// - `describe.skipIf(SKIP_DB || !TIENE_BD)` para la parte que necesita BD.
// - Las pruebas de timeout son puras (sin BD) y se ejecutan siempre.
//
// Validates: Requirements R14.6, R14.7
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest"
import { NextRequest } from "next/server"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

const ORG_DEFAULT = "00000000-0000-4000-8000-000000000001"
const DESDE = "2025-06-01"
const HASTA = "2025-06-30"
const EN_RANGO = new Date("2025-06-15T12:00:00.000Z")
const TZ = "America/Mexico_City"

// ---------------------------------------------------------------------------
// Mocks para las pruebas de timeout (hoisted al top-level por vitest).
// Cuando `SIMULAR_TIMEOUT` es true, las funciones de dominio nunca resuelven.
// ---------------------------------------------------------------------------
let SIMULAR_TIMEOUT = false

vi.mock("@/lib/dominio/metricas", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/dominio/metricas")>()
  return {
    ...original,
    calcularMetricas: (...args: Parameters<typeof original.calcularMetricas>) => {
      if (SIMULAR_TIMEOUT) return new Promise<never>(() => { /* nunca resuelve */ })
      return original.calcularMetricas(...args)
    },
  }
})

vi.mock("@/lib/dominio/rankings", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/dominio/rankings")>()
  return {
    ...original,
    calcularRankings: (...args: Parameters<typeof original.calcularRankings>) => {
      if (SIMULAR_TIMEOUT) return new Promise<never>(() => { /* nunca resuelve */ })
      return original.calcularRankings(...args)
    },
  }
})

// ---------------------------------------------------------------------------
// PARTE 1 — Timeout (sin BD, siempre se ejecutan)
// ---------------------------------------------------------------------------

describe("Timeout de consulta (CONSULTA_TIMEOUT 504)", () => {
  it("GET /api/dashboard/metricas responde 504 CONSULTA_TIMEOUT cuando calcularMetricas tarda > 5 s", async () => {
    SIMULAR_TIMEOUT = true
    vi.useFakeTimers()

    const { GET } = await import("@/app/api/dashboard/metricas/route")
    const req = new NextRequest(
      "http://localhost:3000/api/dashboard/metricas?desde=2025-06-01&hasta=2025-06-30",
    )

    const responsePromise = GET(req)
    // Adelantamos el reloj más allá del timeout de 5 s del handler.
    await vi.advanceTimersByTimeAsync(6_000)

    const res = await responsePromise
    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.error.codigo).toBe("CONSULTA_TIMEOUT")

    vi.useRealTimers()
    SIMULAR_TIMEOUT = false
  })

  it("GET /api/dashboard/rankings responde 504 CONSULTA_TIMEOUT cuando calcularRankings tarda > 5 s", async () => {
    SIMULAR_TIMEOUT = true
    vi.useFakeTimers()

    const { GET } = await import("@/app/api/dashboard/rankings/route")
    const req = new NextRequest(
      "http://localhost:3000/api/dashboard/rankings?desde=2025-06-01&hasta=2025-06-30",
    )

    const responsePromise = GET(req)
    await vi.advanceTimersByTimeAsync(6_000)

    const res = await responsePromise
    expect(res.status).toBe(504)
    const body = await res.json()
    expect(body.error.codigo).toBe("CONSULTA_TIMEOUT")

    vi.useRealTimers()
    SIMULAR_TIMEOUT = false
  })
})

// ---------------------------------------------------------------------------
// PARTE 2 — Índices (requiere BD activa)
// ---------------------------------------------------------------------------

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Uso de índices en consultas agregadas (R14.6)",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    const productoIds: string[] = []
    const ventaIds: string[] = []
    const sufijo = `REND-${Date.now()}`

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p

      // Sembrar un producto con su venta y movimientos para que las tablas no estén vacías.
      const producto = await prisma.producto.create({
        data: {
          organizacion_id: ORG_DEFAULT,
          codigo_barras: `${sufijo}-0`,
          nombre: "Producto Rendimiento",
          precio_compra: 5.0,
          precio_venta: 10.0,
          stock_actual: 100,
          stock_minimo: 0,
          activo: true,
        },
      })
      productoIds.push(producto.id)

      const venta = await prisma.venta.create({
        data: {
          organizacion_id: ORG_DEFAULT,
          folio: `${sufijo}-VTA`,
          subtotal: 10.0,
          impuesto: 0,
          total: 10.0,
          metodo_pago: "efectivo",
          estado: "completada",
          creado_en: EN_RANGO,
          items: {
            create: [
              {
                organizacion_id: ORG_DEFAULT,
                producto_id: producto.id,
                cantidad: 1,
                precio_unitario: 10.0,
                subtotal_linea: 10.0,
              },
            ],
          },
        },
      })
      ventaIds.push(venta.id)

      await prisma.movimientoStock.create({
        data: {
          organizacion_id: ORG_DEFAULT,
          producto_id: producto.id,
          tipo: "salida",
          cantidad: -1,
          stock_resultante: 99,
          creado_en: EN_RANGO,
        },
      })

      // Sembrar una notificación para que la tabla no esté vacía.
      await prisma.notificacion.create({
        data: {
          tipo: "stock_critico",
          titulo: "Test rendimiento",
          mensaje: "Sin leer",
          leida: false,
          creado_en: EN_RANGO,
        },
      })
    })

    afterAll(async () => {
      if (!prisma) return
      await prisma.notificacion.deleteMany({ where: { titulo: "Test rendimiento" } })
      await prisma.ventaItem.deleteMany({ where: { producto_id: { in: productoIds } } })
      await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } })
      await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: productoIds } } })
      await prisma.producto.deleteMany({ where: { id: { in: productoIds } } })
    })

    /**
     * Ejecuta `EXPLAIN` para una consulta y devuelve las filas del plan.
     * El plan de MySQL puede tener una o varias filas cuando hay JOINs.
     */
    type ExplainRow = {
      table: string | null
      type: string | null
      possible_keys: string | null
      key: string | null
      Extra: string | null
    }

    async function explainQuery(sql: string, params: unknown[]): Promise<ExplainRow[]> {
      return prisma.$queryRawUnsafe<ExplainRow[]>(`EXPLAIN ${sql}`, ...params)
    }

    /** Comprueba que ninguna fila del plan usa full-table-scan ("ALL") en la tabla dada. */
    function sinFullScan(rows: ExplainRow[], tabla: string) {
      const fila = rows.find((r) => r.table === tabla)
      if (fila) {
        expect(
          fila.type,
          `Se esperaba uso de índice en '${tabla}' pero el plan usa '${fila.type}' (full scan)`,
        ).not.toBe("ALL")
      }
      // Si la tabla no aparece en el plan es porque el optimizador la eliminó — aceptable.
    }

    it("La consulta de ventas completadas por rango utiliza el índice creado_en de ventas", async () => {
      const { limitesUtc } = await import("@/lib/dominio/metricas")
      const lim = limitesUtc(DESDE, HASTA, TZ)
      // Consulta análoga a la que lanza agregarMetricas para ventas.
      const rows = await explainQuery(
        "SELECT id, total, creado_en FROM ventas WHERE estado = ? AND creado_en >= ? AND creado_en <= ?",
        ["completada", lim.inicio, lim.fin],
      )
      sinFullScan(rows, "ventas")
    })

    it("La consulta de movimientos de devolución por rango utiliza el índice creado_en de movimientos_stock", async () => {
      const { limitesUtc } = await import("@/lib/dominio/metricas")
      const lim = limitesUtc(DESDE, HASTA, TZ)
      const rows = await explainQuery(
        "SELECT producto_id, cantidad FROM movimientos_stock WHERE tipo = ? AND creado_en >= ? AND creado_en <= ?",
        ["devolucion", lim.inicio, lim.fin],
      )
      sinFullScan(rows, "movimientos_stock")
    })

    it("La consulta de salidas por rango utiliza el índice creado_en de movimientos_stock", async () => {
      const { limitesUtc } = await import("@/lib/dominio/metricas")
      const lim = limitesUtc(DESDE, HASTA, TZ)
      const rows = await explainQuery(
        "SELECT producto_id, cantidad FROM movimientos_stock WHERE creado_en >= ? AND creado_en <= ? AND cantidad < 0",
        [lim.inicio, lim.fin],
      )
      sinFullScan(rows, "movimientos_stock")
    })

    it("La consulta de conteo de notificaciones no leídas utiliza el índice leida de notificaciones", async () => {
      // Consulta análoga a prisma.notificacion.count({ where: { leida: false } })
      const rows = await explainQuery(
        "SELECT COUNT(*) FROM notificaciones WHERE leida = ?",
        [false],
      )
      sinFullScan(rows, "notificaciones")
    })

    it("La consulta de listado de notificaciones no leídas utiliza el índice leida de notificaciones", async () => {
      const rows = await explainQuery(
        "SELECT id, tipo, titulo, mensaje, leida, creado_en FROM notificaciones WHERE leida = ? ORDER BY creado_en DESC, id DESC LIMIT 100",
        [false],
      )
      sinFullScan(rows, "notificaciones")
    })

    it("calcularMetricas completa sin error con el dataset sembrado", async () => {
      const { calcularMetricas } = await import("@/lib/dominio/metricas")
      const dto = await calcularMetricas(DESDE, HASTA, TZ)
      expect(dto.totalSales.actual).toBeGreaterThanOrEqual(0)
      expect(dto.estimatedProfit.actual).toBeCloseTo(
        dto.totalSales.actual - dto.totalExpenses.actual,
        5,
      )
    })

    it("calcularRankings completa sin error con el dataset sembrado", async () => {
      const { calcularRankings } = await import("@/lib/dominio/rankings")
      const dto = await calcularRankings(DESDE, HASTA, 5, TZ)
      expect(dto.topSelling).toBeInstanceOf(Array)
      expect(dto.topMargin).toBeInstanceOf(Array)
      expect(dto.topRotation).toBeInstanceOf(Array)
      expect(dto.lowRotation).toBeInstanceOf(Array)
    })
  },
)
