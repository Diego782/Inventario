import { describe, expect, it } from "vitest"

const dia = (desplazamiento: number) => {
  const fecha = new Date()
  fecha.setUTCDate(fecha.getUTCDate() + desplazamiento)
  return fecha.toISOString().slice(0, 10)
}

describe.skipIf(!process.env.DATABASE_URL)("lotes de vencimiento y venta FEFO", () => {
  it("preserva inventario legado, vende primero el lote próximo y revierte al eliminar", async () => {
    const { prisma } = await import("@/lib/db")
    const { crearProductoSchema } = await import("@/lib/schemas/producto")
    const { crearProducto, editarProducto } = await import("@/lib/dominio/inventario")
    const { registrarVenta, eliminarVenta } = await import("@/lib/dominio/ventas")
    const { registrarLote } = await import("@/lib/dominio/lotes")
    const { generarNotificacionesVencimientoProducto } = await import("@/lib/dominio/notificaciones")
    const { calcularFlujosProducto } = await import("@/lib/dominio/flujos-producto")
    const { ProductoVencidoError } = await import("@/lib/api/errores")
    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const usuario = await prisma.usuario.create({ data: {
      correo: `prueba-lotes-${sufijo}@example.invalid`, nombre: "Prueba lotes",
      hash_contrasena: "sin-acceso", correo_verificado: true, estado: "activo",
    } })
    const org = await prisma.organizacion.create({ data: {
      nombre: "Prueba vencimiento", slug: `prueba-lotes-${sufijo}`, creado_por: usuario.id,
    } })
    const productos: string[] = []
    try {
      const producto = await crearProducto(crearProductoSchema.parse({
        nombre: "Producto con dos lotes", codigo_barras: `LOTE-${sufijo}-1`,
        precio_compra: 10, precio_venta: 20, stock_actual: 5, stock_minimo: 1,
        controla_vencimiento: true,
        lotes_iniciales: [
          { fecha_vencimiento: dia(40), cantidad: 3 },
          { fecha_vencimiento: dia(80), cantidad: 2 },
        ],
      }), org.id)
      productos.push(producto.id)

      const venta = await registrarVenta({
        organizacion_id: org.id, metodo_pago: "efectivo",
        items: [{ producto_id: producto.id, cantidad: 4, precio_unitario: 20 }],
      })
      const lotesVendidos = await prisma.ventaItemLote.findMany({
        where: { venta_item_id: venta.items[0].id }, include: { lote: true },
      })
      expect(lotesVendidos.map((fila) => [fila.lote.fecha_vencimiento.toISOString().slice(0, 10), fila.cantidad]).sort())
        .toEqual([[dia(40), 3], [dia(80), 1]])
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })).stock_actual).toBe(1)
      const filaVendida = (await calcularFlujosProducto(dia(-2), dia(2), org.id))
        .find((fila) => fila.producto_id === producto.id)
      expect(filaVendida?.unidadesVendidas).toBe(4)
      expect(filaVendida?.unidadesSalida).toBe(4)

      await eliminarVenta(venta.id, org.id)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })).stock_actual).toBe(5)
      expect((await prisma.loteProducto.aggregate({ where: { producto_id: producto.id }, _sum: { stock_actual: true } }))._sum.stock_actual).toBe(5)
      await registrarLote(producto.id, org.id, { modo: "entrada", fecha_vencimiento: dia(100), cantidad: 2 })
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })).stock_actual).toBe(7)

      const sinVariante = await crearProducto(crearProductoSchema.parse({
        nombre: "Producto legado", codigo_barras: `LOTE-${sufijo}-2`,
        precio_venta: 20, stock_actual: 2, stock_minimo: 0,
      }), org.id)
      productos.push(sinVariante.id)
      const flujos = await calcularFlujosProducto(dia(-2), dia(2), org.id)
      expect(flujos).toHaveLength(2)
      expect(flujos.find((fila) => fila.producto_id === producto.id)?.unidadesEntrada).toBe(2)
      expect(flujos.find((fila) => fila.producto_id === sinVariante.id)?.unidadesEntrada).toBe(0)
      await editarProducto(sinVariante.id, { stock_minimo: 7, minimos_variantes: [] }, org.id)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: sinVariante.id } })).stock_minimo).toBe(7)
      await editarProducto(sinVariante.id, { controla_vencimiento: true,
        lotes_asignacion: [{ fecha_vencimiento: dia(-3), cantidad: 2 }] }, org.id)
      await generarNotificacionesVencimientoProducto(org.id)
      await generarNotificacionesVencimientoProducto(org.id)
      expect(await prisma.notificacion.count({ where: { organizacion_id: org.id, producto_id: sinVariante.id, tipo: "lote_vencido" } })).toBe(1)
      await expect(registrarVenta({
        organizacion_id: org.id, metodo_pago: "efectivo",
        items: [{ producto_id: sinVariante.id, cantidad: 1, precio_unitario: 20 }],
      })).rejects.toBeInstanceOf(ProductoVencidoError)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: sinVariante.id } })).stock_actual).toBe(2)
    } finally {
      await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: productos } } })
      await prisma.notificacion.deleteMany({ where: { producto_id: { in: productos } } })
      const ventasAisladas = await prisma.venta.findMany({ where: { organizacion_id: org.id }, select: { id: true } })
      const idsVenta = ventasAisladas.map((venta) => venta.id)
      await prisma.ventaItem.deleteMany({ where: { venta_id: { in: idsVenta } } })
      await prisma.venta.deleteMany({ where: { id: { in: idsVenta } } })
      await prisma.producto.deleteMany({ where: { id: { in: productos } } })
      await prisma.configuracion.deleteMany({ where: { organizacion_id: org.id } })
      await prisma.organizacion.delete({ where: { id: org.id } })
      await prisma.usuario.delete({ where: { id: usuario.id } })
    }
  })
})
