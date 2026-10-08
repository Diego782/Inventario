import { describe, expect, it, vi } from "vitest"
import { crearProductoSchema } from "@/lib/schemas/producto"

const { productoUpdate, productoFindFirst } = vi.hoisted(() => ({
  productoUpdate: vi.fn(),
  productoFindFirst: vi.fn(),
}))

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (callback: (tx: unknown) => Promise<unknown>) => callback({
      producto: { findFirst: productoFindFirst, update: productoUpdate },
    }),
  },
}))

import { editarProducto } from "@/lib/dominio/inventario"

describe("inventario sin variantes y control de vencimiento", () => {
  it("conserva el mínimo nuevo aunque un cliente envíe minimos_variantes vacío", async () => {
    productoFindFirst.mockResolvedValue({ id: "producto", variantes: [], controla_vencimiento: false })
    productoUpdate.mockImplementation(async ({ data }: { data: object }) => ({ id: "producto", ...data }))

    await editarProducto("producto", { stock_minimo: 7, minimos_variantes: [] }, "organizacion")

    expect(productoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "producto" }, data: expect.objectContaining({ stock_minimo: 7 }),
    }))
  })

  it("acepta un producto legado sin fecha y exige cubrir el stock cuando se activa el control", () => {
    const base = { nombre: "Leche", precio_venta: 2000, stock_actual: 5 }
    expect(crearProductoSchema.safeParse(base).success).toBe(true)
    expect(crearProductoSchema.safeParse({ ...base, controla_vencimiento: true }).success).toBe(false)
    expect(crearProductoSchema.safeParse({
      ...base, controla_vencimiento: true,
      lotes_iniciales: [
        { fecha_vencimiento: "2026-11-01", cantidad: 3 },
        { fecha_vencimiento: "2026-12-01", cantidad: 2 },
      ],
    }).success).toBe(true)
  })
})
