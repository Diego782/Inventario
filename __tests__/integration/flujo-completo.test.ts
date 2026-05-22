// __tests__/integration/flujo-completo.test.ts
import { describe, it, expect, beforeAll, afterAll } from "vitest"

// Este test requiere BD activa. Se omite si DATABASE_URL no está definida.
const TIENE_BD = !!process.env.DATABASE_URL

describe.skipIf(!TIENE_BD)("Flujo completo: inventario → venta", () => {
  let prisma: import("@prisma/client").PrismaClient
  let productoId: string
  let codigoBarras: string

  beforeAll(async () => {
    const { prisma: p } = await import("@/lib/db")
    prisma = p
  })

  afterAll(async () => {
    // Limpiar datos de prueba
    if (productoId) {
      await prisma.movimientoStock.deleteMany({ where: { producto_id: productoId } })
      await prisma.producto.deleteMany({ where: { id: productoId } })
    }
  })

  it("1. Crear un producto sin código de barras genera EAN-13 automáticamente", async () => {
    const { crearProducto } = await import("@/lib/dominio/inventario")
    const producto = await crearProducto({
      nombre: "Producto Test E2E",
      sku: `TEST-E2E-${Date.now()}`,
      precio_venta: 100,
      precio_compra: 50,
      stock_actual: 10,
      stock_minimo: 2,
      unidad: "unidad",
    })

    expect(producto.id).toBeTruthy()
    expect(producto.codigo_barras).toBeTruthy()
    expect(producto.codigo_barras!.length).toBe(13)
    expect(producto.stock_actual).toBe(10)

    productoId = producto.id
    codigoBarras = producto.codigo_barras!
  })

  it("2. Buscar el producto por código de barras lo resuelve correctamente", async () => {
    const { obtenerPorCodigo } = await import("@/lib/dominio/inventario")
    const encontrado = await obtenerPorCodigo(codigoBarras)

    expect(encontrado).not.toBeNull()
    expect(encontrado!.id).toBe(productoId)
  })

  it("3. Registrar una venta descuenta el stock y crea los registros correctos", async () => {
    const { registrarVenta } = await import("@/lib/dominio/ventas")

    const stockAntes = 10
    const cantidadVenta = 3

    const venta = await registrarVenta({
      items: [
        {
          producto_id: productoId,
          cantidad: cantidadVenta,
          precio_unitario: 100,
        },
      ],
      metodo_pago: "efectivo",
      monto_recibido: 300,
    })

    expect(venta.folio).toMatch(/^VTA-\d{8}-\d{4}$/)
    expect(venta.items).toHaveLength(1)
    expect(Number(venta.total)).toBeCloseTo(300, 1)

    // Verificar que el stock bajó
    const productoActualizado = await prisma.producto.findUnique({
      where: { id: productoId },
    })
    expect(productoActualizado!.stock_actual).toBe(stockAntes - cantidadVenta)

    // Verificar que existe el movimiento de stock
    const movimientos = await prisma.movimientoStock.findMany({
      where: { producto_id: productoId, tipo: "venta" },
    })
    expect(movimientos.length).toBeGreaterThanOrEqual(1)
    expect(movimientos[0].referencia_id).toBe(venta.id)
  })
})
