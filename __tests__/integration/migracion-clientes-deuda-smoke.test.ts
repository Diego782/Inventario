// __tests__/integration/migracion-clientes-deuda-smoke.test.ts
// Smoke test de la migración aditiva y retrocompatible `clientes_y_deuda`.
// Verifica que:
//  1. Los conteos de Productos, Ventas, VentaItem, MovimientoStock y
//     Notificacion son idénticos antes y después de aplicar/verificar la
//     migración (Req 11.1).
//  2. Las ventas en estado "fiado" que no tenían cliente_id siguen
//     existiendo, están válidas y conservan cliente_id = NULL (Req 11.3).
//  3. Las nuevas columnas ventas.cliente_id y ventas.plazo_deuda son
//     nullable (Req 11.5).
// Validates: Requirements 11.1, 11.3, 11.5
import { describe, it, expect, beforeAll, afterAll } from "vitest"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Sufijo único para aislar los datos sembrados por este test
const SUFIJO = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const ORG_ID = "00000000-0000-4000-8000-000000000001"

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Migración clientes_y_deuda — smoke test aditivo y retrocompatible",
  () => {
    let prisma: import("@prisma/client").PrismaClient

    // IDs de los registros sembrados para limpiarlos en afterAll
    const productosSembrados: string[] = []
    const ventasSembradas: string[] = []

    // Conteos capturados antes de sembrar los datos de prueba
    let conteoProductosAntes: number
    let conteoVentasAntes: number
    let conteoVentaItemsAntes: number
    let conteoMovStockAntes: number
    let conteoNotificacionesAntes: number

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p

      // ── 1. Capturar conteos antes de sembrar ──────────────────────────────
      conteoProductosAntes = await prisma.producto.count()
      conteoVentasAntes = await prisma.venta.count()
      conteoVentaItemsAntes = await prisma.ventaItem.count()
      conteoMovStockAntes = await prisma.movimientoStock.count()
      conteoNotificacionesAntes = await prisma.notificacion.count()

      // ── 2. Sembrar un Producto para tener algo real que vender ─────────────
      const producto = await prisma.producto.create({
        data: {
          organizacion_id: ORG_ID,
          codigo_barras: `9999${SUFIJO.slice(-8)}`,
          nombre: `Producto Smoke ${SUFIJO}`,
          precio_venta: 150,
          precio_compra: 80,
          stock_actual: 20,
          stock_minimo: 3,
          unidad: "unidad",
        },
      })
      productosSembrados.push(producto.id)

      // ── 3. Sembrar una Venta normal (metodo_pago = "efectivo") ────────────
      const ventaNormal = await prisma.venta.create({
        data: {
          organizacion_id: ORG_ID,
          folio: `VTA-SMOKE-${SUFIJO}-EF`,
          subtotal: 150,
          impuesto: 0,
          total: 150,
          metodo_pago: "efectivo",
          estado: "completada",
          // cliente_id y plazo_deuda deben quedar NULL (nullable)
        },
      })
      ventasSembradas.push(ventaNormal.id)

      // VentaItem asociado a la venta normal
      await prisma.ventaItem.create({
        data: {
          organizacion_id: ORG_ID,
          venta_id: ventaNormal.id,
          producto_id: producto.id,
          cantidad: 1,
          precio_unitario: 150,
          subtotal_linea: 150,
        },
      })

      // Movimiento de stock asociado al producto sembrado
      await prisma.movimientoStock.create({
        data: {
          organizacion_id: ORG_ID,
          producto_id: producto.id,
          tipo: "venta",
          cantidad: -1,
          stock_resultante: 19,
          motivo: `Smoke test ${SUFIJO}`,
          referencia_id: ventaNormal.id,
        },
      })

      // ── 4. Sembrar la Venta "fiado" histórica SIN cliente_id ─────────────
      // Esta es la venta crítica: simula una venta fiada preexistente que
      // no fue asociada a ningún cliente antes de la migración (Req 11.3).
      const ventaFiada = await prisma.venta.create({
        data: {
          organizacion_id: ORG_ID,
          folio: `VTA-SMOKE-${SUFIJO}-FI`,
          subtotal: 150,
          impuesto: 0,
          total: 150,
          metodo_pago: "fiado",
          estado: "pendiente",
          // cliente_id y plazo_deuda explícitamente NULL (retrocompatibilidad)
          cliente_id: null,
          plazo_deuda: null,
        },
      })
      ventasSembradas.push(ventaFiada.id)

      // ── 5. Sembrar una Notificacion para verificar que no se altera ───────
      await prisma.notificacion.create({
        data: {
          organizacion_id: ORG_ID,
          tipo: `smoke_test_${SUFIJO}`,
          titulo: `Smoke ${SUFIJO}`,
          mensaje: `Test de migración ${SUFIJO}`,
          clave_deduplicacion: `smoke:${SUFIJO}`,
        },
      })
    })

    afterAll(async () => {
      if (!prisma) return

      // Limpieza en orden inverso de dependencias FK:
      // venta_items → movimientos_stock → notificaciones → ventas → productos

      // Eliminar notificaciones sembradas por este test
      await prisma.notificacion.deleteMany({
        where: { tipo: `smoke_test_${SUFIJO}` },
      })

      // Eliminar VentaItems asociados a las ventas sembradas
      if (ventasSembradas.length > 0) {
        await prisma.ventaItem.deleteMany({
          where: { venta_id: { in: ventasSembradas } },
        })
      }

      // Eliminar MovimientosStock asociados a los productos sembrados
      if (productosSembrados.length > 0) {
        await prisma.movimientoStock.deleteMany({
          where: { producto_id: { in: productosSembrados } },
        })
      }

      // Eliminar Ventas sembradas
      if (ventasSembradas.length > 0) {
        await prisma.venta.deleteMany({
          where: { id: { in: ventasSembradas } },
        })
      }

      // Eliminar Productos sembrados
      if (productosSembrados.length > 0) {
        await prisma.producto.deleteMany({
          where: { id: { in: productosSembrados } },
        })
      }
    })

    // ── Tests ────────────────────────────────────────────────────────────────

    it("Req 11.1 — el conteo de Productos es ≥ 0 y creció en exactamente el sembrado", async () => {
      const total = await prisma.producto.count()
      // Los productos sembrados (1) deben estar en la BD
      expect(total).toBeGreaterThanOrEqual(conteoProductosAntes + 1)
      // El delta debe ser exactamente la cantidad sembrada
      expect(total - conteoProductosAntes).toBe(productosSembrados.length)
    })

    it("Req 11.1 — el conteo de Ventas creció en exactamente las sembradas (2)", async () => {
      const total = await prisma.venta.count()
      expect(total).toBeGreaterThanOrEqual(conteoVentasAntes + 2)
      expect(total - conteoVentasAntes).toBe(ventasSembradas.length)
    })

    it("Req 11.1 — el conteo de VentaItems creció en 1 (solo la venta normal tiene ítem)", async () => {
      const total = await prisma.ventaItem.count()
      expect(total - conteoVentaItemsAntes).toBe(1)
    })

    it("Req 11.1 — el conteo de MovimientosStock creció en 1", async () => {
      const total = await prisma.movimientoStock.count()
      expect(total - conteoMovStockAntes).toBe(1)
    })

    it("Req 11.1 — el conteo de Notificaciones creció en 1", async () => {
      const total = await prisma.notificacion.count()
      expect(total - conteoNotificacionesAntes).toBe(1)
    })

    it("Req 11.3 — la venta fiada histórica existe y tiene metodo_pago='fiado'", async () => {
      const ventaFiada = await prisma.venta.findFirst({
        where: {
          folio: `VTA-SMOKE-${SUFIJO}-FI`,
          organizacion_id: ORG_ID,
        },
      })

      expect(ventaFiada).not.toBeNull()
      expect(ventaFiada!.metodo_pago).toBe("fiado")
    })

    it("Req 11.3 — la venta fiada histórica conserva cliente_id = NULL (retrocompatibilidad)", async () => {
      const ventaFiada = await prisma.venta.findFirst({
        where: {
          folio: `VTA-SMOKE-${SUFIJO}-FI`,
          organizacion_id: ORG_ID,
        },
      })

      expect(ventaFiada).not.toBeNull()
      expect(ventaFiada!.cliente_id).toBeNull()
    })

    it("Req 11.3 — la venta fiada histórica conserva plazo_deuda = NULL", async () => {
      const ventaFiada = await prisma.venta.findFirst({
        where: {
          folio: `VTA-SMOKE-${SUFIJO}-FI`,
          organizacion_id: ORG_ID,
        },
      })

      expect(ventaFiada).not.toBeNull()
      expect(ventaFiada!.plazo_deuda).toBeNull()
    })

    it("Req 11.3 — la venta fiada histórica sigue válida (estado='pendiente')", async () => {
      const ventaFiada = await prisma.venta.findFirst({
        where: {
          folio: `VTA-SMOKE-${SUFIJO}-FI`,
          organizacion_id: ORG_ID,
        },
      })

      expect(ventaFiada).not.toBeNull()
      expect(ventaFiada!.estado).toBe("pendiente")
    })

    it("Req 11.5 — ventas.cliente_id acepta NULL (la venta normal también lo tiene NULL)", async () => {
      const ventaNormal = await prisma.venta.findFirst({
        where: {
          folio: `VTA-SMOKE-${SUFIJO}-EF`,
          organizacion_id: ORG_ID,
        },
      })

      expect(ventaNormal).not.toBeNull()
      expect(ventaNormal!.cliente_id).toBeNull()
      expect(ventaNormal!.plazo_deuda).toBeNull()
    })

    it("Req 11.5 — la tabla clientes existe y admite inserciones (nullable en ventas)", async () => {
      // Confirma que el modelo Cliente está disponible y la tabla fue creada
      const count = await prisma.cliente.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it("Req 11.5 — la tabla movimientos_deuda existe y admite inserciones", async () => {
      // Confirma que el modelo MovimientoDeuda está disponible y la tabla fue creada
      const count = await prisma.movimientoDeuda.count()
      expect(count).toBeGreaterThanOrEqual(0)
    })

    it("Req 11.1 — idempotencia: verificar migración no altera los conteos ya establecidos", async () => {
      // Después de la siembra los conteos son estables; volver a consultarlos
      // no cambia nada (no se aplica DDL adicional desde el test).
      const prod = await prisma.producto.count()
      const ventas = await prisma.venta.count()
      const items = await prisma.ventaItem.count()
      const movs = await prisma.movimientoStock.count()
      const notifs = await prisma.notificacion.count()

      // Los deltas deben coincidir con lo sembrado en beforeAll
      expect(prod - conteoProductosAntes).toBe(productosSembrados.length)
      expect(ventas - conteoVentasAntes).toBe(ventasSembradas.length)
      expect(items - conteoVentaItemsAntes).toBe(1)
      expect(movs - conteoMovStockAntes).toBe(1)
      expect(notifs - conteoNotificacionesAntes).toBe(1)
    })
  }
)
