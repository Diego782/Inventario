// __tests__/integration/notificacion-atomicidad.test.ts
//
// Pruebas de integración de atomicidad stock + notificación (espejo de la prueba
// de atomicidad de venta del core). Requiere BD activa.
//
// Cubre venta (registrarVenta) y ajuste (ajustarStock):
//   (a) Éxito  ⇒ stock_actual actualizado y exactamente 1 Notificacion creada con
//                clave_deduplicacion `stock_critico:{producto_id}` (R7.6).
//   (b) Fallo inyectado dentro de la $transaction TRAS crear la notificación ⇒
//                la transacción se revierte por completo: 0 notificaciones
//                persistidas y `stock_actual` sin cambios (R7.7).
//
// La inyección de fallo se realiza envolviendo `prisma.$transaction`: se ejecuta
// la lógica de dominio real (que crea la notificación dentro de la tx) y, antes de
// confirmar, se lanza un error. Así el rollback de Prisma deshace la notificación y
// el descuento de stock con el código real, sin mockear la lógica interna.
//
// Validates: Requirements R7.6, R7.7
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from "vitest"
import { claveDedupStockCritico } from "@/lib/dominio/notificaciones"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Organización por defecto creada por la migración multi-tenant.
const ORG_DEFAULT = "00000000-0000-4000-8000-000000000001"

// stock_minimo=10 ⇒ umbral Crítico = floor-ish 10*0.3 = 3. Con stock_actual=4 el
// producto está en "Bajo Stock"; al descontar 1 unidad cae a 3 ⇒ "Crítico", lo que
// dispara la creación de la notificación (transición no-Crítico ⇒ Crítico).
const STOCK_INICIAL = 4
const STOCK_MINIMO = 10
const STOCK_CRITICO_ESPERADO = 3

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Atomicidad stock + notificación (venta y ajuste)",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    let ORG = ORG_DEFAULT
    const productIds: string[] = []
    const ventaIds: string[] = []

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p
      // Usa la primera organización existente si la default no estuviera presente.
      const org = await prisma.organizacion.findFirst({ select: { id: true } })
      if (org) ORG = org.id
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    afterAll(async () => {
      if (!prisma) return
      if (productIds.length > 0) {
        await prisma.notificacion.deleteMany({ where: { producto_id: { in: productIds } } })
        await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: productIds } } })
        await prisma.ventaItem.deleteMany({ where: { producto_id: { in: productIds } } })
      }
      if (ventaIds.length > 0) {
        await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } })
      }
      if (productIds.length > 0) {
        await prisma.producto.deleteMany({ where: { id: { in: productIds } } })
      }
    })

    async function seedProducto() {
      const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      const producto = await prisma.producto.create({
        data: {
          organizacion_id: ORG,
          codigo_barras: `ATOM-${sufijo}`,
          nombre: "Producto Atomicidad",
          precio_compra: 50,
          precio_venta: 100,
          stock_actual: STOCK_INICIAL,
          stock_minimo: STOCK_MINIMO,
          unidad: "unidad",
        },
      })
      productIds.push(producto.id)
      return producto
    }

    function contarNotificaciones(productoId: string) {
      return prisma.notificacion.count({
        where: { clave_deduplicacion: claveDedupStockCritico(productoId), leida: false },
      })
    }

    // ── (a) ÉXITO: venta deja el producto en Crítico ⇒ stock baja + 1 notificación ──

    it("(a) venta exitosa: descuenta stock y crea exactamente 1 notificación de stock crítico", async () => {
      const { registrarVenta } = await import("@/lib/dominio/ventas")
      const producto = await seedProducto()

      const venta = await registrarVenta({
        items: [{ producto_id: producto.id, cantidad: 1, precio_unitario: 100 }],
        metodo_pago: "efectivo",
        monto_recibido: 100,
        organizacion_id: ORG,
      })
      ventaIds.push(venta.id)

      const actualizado = await prisma.producto.findUnique({ where: { id: producto.id } })
      expect(actualizado!.stock_actual).toBe(STOCK_CRITICO_ESPERADO)

      const notifs = await prisma.notificacion.findMany({
        where: { clave_deduplicacion: claveDedupStockCritico(producto.id) },
      })
      expect(notifs).toHaveLength(1)
      expect(notifs[0].tipo).toBe("stock_critico")
      expect(notifs[0].producto_id).toBe(producto.id)
      expect(notifs[0].leida).toBe(false)
    })

    // ── (a) ÉXITO: ajuste (salida) deja el producto en Crítico ⇒ stock baja + 1 notif ──

    it("(a) ajuste exitoso: descuenta stock y crea exactamente 1 notificación de stock crítico", async () => {
      const { ajustarStock } = await import("@/lib/dominio/inventario")
      const producto = await seedProducto()

      await ajustarStock(
        producto.id,
        { tipo: "salida", cantidad: 1, motivo: "test atomicidad" },
        ORG
      )

      const actualizado = await prisma.producto.findUnique({ where: { id: producto.id } })
      expect(actualizado!.stock_actual).toBe(STOCK_CRITICO_ESPERADO)

      const notifs = await prisma.notificacion.findMany({
        where: { clave_deduplicacion: claveDedupStockCritico(producto.id) },
      })
      expect(notifs).toHaveLength(1)
      expect(notifs[0].tipo).toBe("stock_critico")
      expect(notifs[0].producto_id).toBe(producto.id)
    })

    // ── (b) ROLLBACK venta: fallo inyectado tras crear la notificación ──

    it("(b) venta: fallo tras crear la notificación revierte stock y no persiste notificaciones", async () => {
      const { registrarVenta } = await import("@/lib/dominio/ventas")
      const producto = await seedProducto()
      const clave = claveDedupStockCritico(producto.id)

      // Confirma que la notificación SÍ se crea dentro de la tx antes del rollback.
      let notifCreadaEnTx = false
      const realTx = prisma.$transaction.bind(prisma)
      vi.spyOn(prisma, "$transaction").mockImplementation(((fn: any, opts: any) =>
        realTx(async (tx: any) => {
          await fn(tx) // ejecuta la lógica real (crea la notificación + descuenta stock)
          const dentro = await tx.notificacion.findFirst({
            where: { clave_deduplicacion: clave },
            select: { id: true },
          })
          notifCreadaEnTx = !!dentro
          // Fallo inyectado DESPUÉS de crear la notificación, antes de confirmar.
          throw new Error("FALLO_INYECTADO_POST_NOTIFICACION")
        }, opts)) as typeof prisma.$transaction)

      await expect(
        registrarVenta({
          items: [{ producto_id: producto.id, cantidad: 1, precio_unitario: 100 }],
          metodo_pago: "efectivo",
          monto_recibido: 100,
          organizacion_id: ORG,
        })
      ).rejects.toThrow()

      expect(notifCreadaEnTx).toBe(true)

      // Rollback: stock intacto y ninguna notificación persistida.
      const actualizado = await prisma.producto.findUnique({ where: { id: producto.id } })
      expect(actualizado!.stock_actual).toBe(STOCK_INICIAL)
      expect(await contarNotificaciones(producto.id)).toBe(0)
    })

    // ── (b) ROLLBACK ajuste: fallo inyectado tras crear la notificación ──

    it("(b) ajuste: fallo tras crear la notificación revierte stock y no persiste notificaciones", async () => {
      const { ajustarStock } = await import("@/lib/dominio/inventario")
      const producto = await seedProducto()
      const clave = claveDedupStockCritico(producto.id)

      let notifCreadaEnTx = false
      const realTx = prisma.$transaction.bind(prisma)
      vi.spyOn(prisma, "$transaction").mockImplementation(((fn: any, opts: any) =>
        realTx(async (tx: any) => {
          await fn(tx)
          const dentro = await tx.notificacion.findFirst({
            where: { clave_deduplicacion: clave },
            select: { id: true },
          })
          notifCreadaEnTx = !!dentro
          throw new Error("FALLO_INYECTADO_POST_NOTIFICACION")
        }, opts)) as typeof prisma.$transaction)

      await expect(
        ajustarStock(
          producto.id,
          { tipo: "salida", cantidad: 1, motivo: "test rollback" },
          ORG
        )
      ).rejects.toThrow()

      expect(notifCreadaEnTx).toBe(true)

      const actualizado = await prisma.producto.findUnique({ where: { id: producto.id } })
      expect(actualizado!.stock_actual).toBe(STOCK_INICIAL)
      expect(await contarNotificaciones(producto.id)).toBe(0)
    })
  }
)
