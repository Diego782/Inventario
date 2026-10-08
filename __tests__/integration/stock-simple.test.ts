import { describe, expect, it, vi } from "vitest"

const contexto = vi.hoisted(() => ({ organizacionId: "" }))
vi.mock("@/lib/auth/contexto-request", () => ({
  resolverContexto: async () => ({ ctx: { organizacionActiva: { id: contexto.organizacionId } } }),
}))

describe.skipIf(!process.env.DATABASE_URL)("ajuste directo de stock sin variantes", () => {
  it("guarda stock y mínimo juntos y conserva el stock al quitar la última variante", async () => {
    const { prisma } = await import("@/lib/db")
    const { crearProducto } = await import("@/lib/dominio/inventario")
    const { PUT: guardarStock } = await import("@/app/api/productos/[id]/ajuste-stock/route")
    const { POST: crearVariante, DELETE: eliminarVariante } = await import("@/app/api/productos/[id]/variantes/route")
    const org = await prisma.organizacion.findFirst({ select: { id: true } })
    if (!org) throw new Error("Se necesita una organización local para la prueba")
    contexto.organizacionId = org.id
    const producto = await crearProducto({
      nombre: `Prueba stock simple ${Date.now()}`, precio_compra: 10, precio_venta: 20,
      stock_actual: 5, stock_minimo: 2, unidad: "unidad",
    }, org.id)
    const url = `http://localhost/api/productos/${producto.id}/ajuste-stock`
    const params = { params: Promise.resolve({ id: producto.id }) }
    const solicitar = (stock_actual: number, stock_minimo: number, stock_esperado: number) => guardarStock(
      new Request(url, { method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_actual, stock_minimo, stock_esperado }) }) as any, params,
    )

    try {
      expect((await solicitar(9, 4, 5)).status).toBe(200)
      const guardado = await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })
      expect([guardado.stock_actual, guardado.stock_minimo]).toEqual([9, 4])
      expect(await prisma.movimientoStock.count({ where: { producto_id: producto.id, tipo: "entrada", cantidad: 4 } })).toBe(1)

      expect((await solicitar(12, 5, 5)).status).toBe(409)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: producto.id } })).stock_actual).toBe(9)

      const creada = await crearVariante(new Request(`${url}/variantes`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ talla: "L" }),
      }) as any, params)
      expect(creada.status).toBe(201)
      const variante = await creada.json()
      expect((await solicitar(10, 4, 9)).status).toBe(422)
      const eliminada = await eliminarVariante(new Request(`${url}/variantes`, {
        method: "DELETE", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variante_id: variante.id }),
      }) as any, params)
      expect(eliminada.status).toBe(200)
      const sinVariante = await prisma.producto.findUniqueOrThrow({
        where: { id: producto.id }, include: { variantes: true },
      })
      expect(sinVariante.variantes).toHaveLength(0)
      expect([sinVariante.stock_actual, sinVariante.stock_minimo]).toEqual([9, 4])

      expect((await solicitar(7, 1, 9)).status).toBe(200)
      expect(await prisma.movimientoStock.count({ where: { producto_id: producto.id, tipo: "ajuste", cantidad: -2 } })).toBe(1)
    } finally {
      await prisma.movimientoStock.deleteMany({ where: { producto_id: producto.id } })
      await prisma.notificacion.deleteMany({ where: { producto_id: producto.id } })
      await prisma.producto.delete({ where: { id: producto.id } })
    }
  })
})
