import { describe, expect, it } from "vitest"

describe.skipIf(!process.env.DATABASE_URL)("folios de ventas por organización", () => {
  it("permite el mismo consecutivo diario en organizaciones distintas", async () => {
    const { prisma } = await import("@/lib/db")
    const { registrarVenta } = await import("@/lib/dominio/ventas")
    const usuario = await prisma.usuario.findFirst({ select: { id: true } })
    if (!usuario) throw new Error("Se necesita un usuario local para la prueba")

    const sufijo = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const organizaciones: string[] = []
    const productos: string[] = []
    const ventas: string[] = []
    try {
      for (const indice of [1, 2]) {
        const org = await prisma.organizacion.create({
          data: { nombre: `Prueba folio ${indice}`, slug: `prueba-folio-${sufijo}-${indice}`, creado_por: usuario.id },
        })
        organizaciones.push(org.id)
        const producto = await prisma.producto.create({
          data: {
            organizacion_id: org.id,
            codigo_barras: `FOLIO-${sufijo}-${indice}`,
            nombre: `Producto folio ${indice}`,
            precio_compra: 10,
            precio_venta: 20,
            stock_actual: 2,
          },
        })
        productos.push(producto.id)
        const venta = await registrarVenta({
          organizacion_id: org.id,
          metodo_pago: "efectivo",
          items: [{ producto_id: producto.id, cantidad: 1, precio_unitario: 20 }],
        })
        ventas.push(venta.id)
      }
      const guardadas = await prisma.venta.findMany({ where: { id: { in: ventas } } })
      expect(guardadas).toHaveLength(2)
      expect(guardadas[0].folio).toBe(guardadas[1].folio)
      expect(guardadas[0].organizacion_id).not.toBe(guardadas[1].organizacion_id)
    } finally {
      await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: productos } } })
      await prisma.notificacion.deleteMany({ where: { producto_id: { in: productos } } })
      await prisma.ventaItem.deleteMany({ where: { venta_id: { in: ventas } } })
      await prisma.venta.deleteMany({ where: { id: { in: ventas } } })
      await prisma.producto.deleteMany({ where: { id: { in: productos } } })
      await prisma.configuracion.deleteMany({ where: { organizacion_id: { in: organizaciones } } })
      await prisma.organizacion.deleteMany({ where: { id: { in: organizaciones } } })
    }
  })
})
