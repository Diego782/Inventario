/**
 * __tests__/integration/venta-rollback-y-no-fiadas.test.ts
 *
 * Tests de ejemplo para:
 *   (a) Rollback de venta fiada: si `crearCargoDeuda` falla dentro de la
 *       transacción, la venta no queda registrada (Req 6.10).
 *   (b) Venta no fiada con cliente del tenant: el cliente se asocia correctamente
 *       a la venta (Req 6.2).
 *   (c) Venta sin cliente: la venta se registra correctamente y queda válida
 *       (Req 6.1, 6.7).
 *
 * Estrategia para el rollback (a):
 *   Se espía `prisma.$transaction` siguiendo el patrón de `notificacion-atomicidad.test.ts`:
 *   se ejecuta la lógica real de `registrarVenta` (incluyendo la inserción de la venta
 *   y sus ítems) y, justo antes de que Prisma confirme la transacción, se lanza un
 *   error. Así el rollback de Prisma deshace todos los cambios con el código real,
 *   sin necesidad de mockear `crearCargoDeuda` directamente.
 *
 * Validates: Requirements 6.1, 6.2, 6.7, 6.10
 */

import { describe, it, expect, vi, beforeAll, afterAll, afterEach } from "vitest"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Organización por defecto creada en la migración multi-tenant.
const ORG_DEFAULT = "00000000-0000-4000-8000-000000000001"

// Plazo de deuda válido: mañana (para ventas fiadas)
function plazoManana(): Date {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  d.setHours(0, 0, 0, 0)
  return d
}

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Venta fiada: rollback y ventas no fiadas",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    let ORG: string = ORG_DEFAULT

    const productoIds: string[] = []
    const ventaIds: string[] = []
    const clienteIds: string[] = []

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p
      const org = await prisma.organizacion.findFirst({ select: { id: true } })
      if (org) ORG = org.id
    })

    afterEach(() => {
      vi.restoreAllMocks()
    })

    afterAll(async () => {
      if (!prisma) return
      // Limpiar en orden para respetar FK:
      //   movimientos_deuda → venta_item → venta → cliente → movimiento_stock → producto
      if (clienteIds.length > 0) {
        await prisma.movimientoDeuda.deleteMany({ where: { cliente_id: { in: clienteIds } } })
      }
      if (ventaIds.length > 0) {
        await prisma.ventaItem.deleteMany({ where: { venta_id: { in: ventaIds } } })
        await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } })
      }
      if (productoIds.length > 0) {
        await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: productoIds } } })
        await prisma.ventaItem.deleteMany({ where: { producto_id: { in: productoIds } } })
        await prisma.notificacion.deleteMany({ where: { producto_id: { in: productoIds } } })
        await prisma.producto.deleteMany({ where: { id: { in: productoIds } } })
      }
      if (clienteIds.length > 0) {
        await prisma.cliente.deleteMany({ where: { id: { in: clienteIds } } })
      }
    })

    // ── Helpers ─────────────────────────────────────────────────────────────

    async function seedProducto(tag = "") {
      const cod = `ROLL-${Date.now()}-${Math.random().toString(36).slice(2, 6)}${tag}`
      const producto = await prisma.producto.create({
        data: {
          organizacion_id: ORG,
          codigo_barras: cod,
          nombre: `Producto Rollback ${cod}`,
          precio_compra: 40,
          precio_venta: 80,
          stock_actual: 20,
          stock_minimo: 2,
          unidad: "unidad",
        },
      })
      productoIds.push(producto.id)
      return producto
    }

    async function seedCliente(tag = "") {
      const ced = `CLI${Date.now()}${Math.random().toString(36).slice(2, 5)}${tag}`.slice(0, 20)
      const cliente = await prisma.cliente.create({
        data: {
          organizacion_id: ORG,
          cedula: ced,
          nombre: `Cliente Rollback ${ced}`,
          telefono: "0414" + String(Math.floor(Math.random() * 9_000_000 + 1_000_000)),
        },
      })
      clienteIds.push(cliente.id)
      return cliente
    }

    // ── (a) ROLLBACK: fallo inyectado en la transacción de venta fiada ──────
    //
    // Se espía $transaction para ejecutar la lógica real (que incluye insertar la
    // Venta, los ítems y el cargo de deuda) y luego lanzar un error artificial
    // justo antes de que Prisma confirme. El rollback deshace todo.

    it(
      "(a) Req 6.10: fallo dentro de la transacción revierte la venta fiada completa",
      async () => {
        const { registrarVenta } = await import("@/lib/dominio/ventas")
        const producto = await seedProducto("a")
        const cliente = await seedCliente("a")
        const stockAntes = producto.stock_actual

        // Inyectar fallo: ejecutar el cuerpo de la transacción real pero lanzar
        // un error antes de la confirmación para provocar el rollback de Prisma.
        let ventaInsertadaEnTx: string | null = null
        const realTx = prisma.$transaction.bind(prisma)
        vi.spyOn(prisma, "$transaction").mockImplementation(((fn: any, opts: any) =>
          realTx(async (tx: any) => {
            // Ejecuta la lógica completa de registrarVenta (inserta venta, items, cargo)
            const resultado = await fn(tx)
            // Captura el ID de la venta creada dentro de la TX (antes del rollback)
            if (resultado && typeof resultado === "object" && "id" in resultado) {
              ventaInsertadaEnTx = resultado.id
            }
            // Lanzar error DESPUÉS de ejecutar la lógica real → Prisma revierte todo
            throw new Error("FALLO_INYECTADO_VENTA_FIADA")
          }, opts)) as typeof prisma.$transaction)

        // La llamada debe fallar porque se inyectó el error.
        await expect(
          registrarVenta({
            items: [{ producto_id: producto.id, cantidad: 2, precio_unitario: 80 }],
            metodo_pago: "fiado",
            cliente_id: cliente.id,
            plazo_deuda: plazoManana(),
            organizacion_id: ORG,
          })
        ).rejects.toThrow()

        // Req 6.10: la venta NO debe haber quedado persistida en la BD.
        const ventas = await prisma.venta.findMany({
          where: { cliente_id: cliente.id, organizacion_id: ORG },
        })
        expect(ventas).toHaveLength(0)

        // Si el ID fue capturado dentro de la TX, confirmamos que ya no existe.
        if (ventaInsertadaEnTx) {
          const ventaHuerfana = await prisma.venta.findUnique({
            where: { id: ventaInsertadaEnTx },
          })
          expect(ventaHuerfana).toBeNull()
        }

        // Req 6.10: el stock no debe haberse reducido (rollback completo).
        const productoActualizado = await prisma.producto.findUnique({
          where: { id: producto.id },
        })
        expect(productoActualizado!.stock_actual).toBe(stockAntes)

        // Req 6.10: el cargo de deuda tampoco debe existir.
        const movimientos = await prisma.movimientoDeuda.findMany({
          where: { cliente_id: cliente.id },
        })
        expect(movimientos).toHaveLength(0)
      }
    )

    // ── (b) Venta no fiada con cliente: asociación correcta ─────────────────

    it(
      "(b) Req 6.2: venta no fiada con cliente del tenant asocia el cliente_id correctamente",
      async () => {
        const { registrarVenta } = await import("@/lib/dominio/ventas")
        const producto = await seedProducto("b")
        const cliente = await seedCliente("b")

        const venta = await registrarVenta({
          items: [{ producto_id: producto.id, cantidad: 1, precio_unitario: 80 }],
          metodo_pago: "efectivo",
          monto_recibido: 80,
          cliente_id: cliente.id,
          organizacion_id: ORG,
        })
        ventaIds.push(venta.id)

        // Req 6.2: la venta debe estar asociada al cliente del tenant.
        expect(venta.cliente_id).toBe(cliente.id)

        // Confirmación directa en BD.
        const ventaBD = await prisma.venta.findUnique({ where: { id: venta.id } })
        expect(ventaBD).not.toBeNull()
        expect(ventaBD!.cliente_id).toBe(cliente.id)
        expect(ventaBD!.organizacion_id).toBe(ORG)
        expect(ventaBD!.metodo_pago).toBe("efectivo")

        // No debe haberse creado cargo de deuda (la venta no es fiada).
        const movimientos = await prisma.movimientoDeuda.findMany({
          where: { cliente_id: cliente.id },
        })
        expect(movimientos).toHaveLength(0)
      }
    )

    // ── (c) Venta sin cliente: válida y retrocompatible ─────────────────────

    it(
      "(c) Req 6.1 y 6.7: venta sin cliente se registra y queda válida (retrocompatibilidad)",
      async () => {
        const { registrarVenta } = await import("@/lib/dominio/ventas")
        const producto = await seedProducto("c")
        const stockAntes = producto.stock_actual

        const venta = await registrarVenta({
          items: [{ producto_id: producto.id, cantidad: 3, precio_unitario: 80 }],
          metodo_pago: "tarjeta",
          organizacion_id: ORG,
        })
        ventaIds.push(venta.id)

        // Req 6.1: la venta se completó sin cliente, sin error.
        expect(venta.id).toBeTruthy()
        expect(venta.folio).toMatch(/^VTA-\d{8}-\d{4}$/)
        expect(venta.metodo_pago).toBe("tarjeta")
        expect(venta.estado).toBe("completada")

        // Req 6.7: cliente_id debe ser null (retrocompatibilidad de ventas sin cliente).
        const ventaBD = await prisma.venta.findUnique({ where: { id: venta.id } })
        expect(ventaBD).not.toBeNull()
        expect(ventaBD!.cliente_id).toBeNull()
        expect(ventaBD!.organizacion_id).toBe(ORG)

        // El stock fue descontado correctamente.
        const productoActualizado = await prisma.producto.findUnique({
          where: { id: producto.id },
        })
        expect(productoActualizado!.stock_actual).toBe(stockAntes - 3)
      }
    )
  }
)
