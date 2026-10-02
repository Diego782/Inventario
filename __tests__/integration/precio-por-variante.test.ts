import { describe, expect, it, vi } from "vitest"

const contexto = vi.hoisted(() => ({ organizacionId: "" }))
vi.mock("@/lib/auth/contexto-request", () => ({
  resolverContexto: async () => ({ ctx: { organizacionActiva: { id: contexto.organizacionId } } }),
}))

describe.skipIf(!process.env.DATABASE_URL)("compra, venta y stock mínimo por variante", () => {
  it("conserva productos existentes y alinea carrito, venta, etiqueta e inventario", async () => {
    const { prisma } = await import("@/lib/db")
    const { crearProducto, editarProducto, calcularValorInventario } = await import("@/lib/dominio/inventario")
    const { agregarMetricas } = await import("@/lib/dominio/metricas")
    const { registrarVenta, eliminarVenta } = await import("@/lib/dominio/ventas")
    const { PrecioDesactualizadoError, PrecioVarianteInvalidoError } = await import("@/lib/api/errores")
    const { toProductoDTO } = await import("@/lib/api/serializadores")
    const { agregarConVariante, calcularTotales, serializarParaApi } = await import("@/lib/carrito")
    const { calcularTotalesConDescuentos } = await import("@/components/ventas/carrito-table")
    const { POST: imprimirEtiqueta } = await import("@/app/api/productos/[id]/imprimir-etiqueta/route")
    const { POST: agregarVariante, PUT: editarVariante } = await import("@/app/api/productos/[id]/variantes/route")

    const org = await prisma.organizacion.findFirst({ select: { id: true } })
    if (!org) throw new Error("Se necesita una organización local para la prueba")
    contexto.organizacionId = org.id
    const valorInicial = await calcularValorInventario(org.id)
    const productos: string[] = []
    let ventaId: string | undefined

    try {
      const simpleExistente = await crearProducto({
        nombre: "Prueba conversión a variantes",
        precio_compra: 30, precio_venta: 70,
        stock_actual: 4, stock_minimo: 3, unidad: "unidad",
      }, org.id)
      productos.push(simpleExistente.id)
      const conversion = await agregarVariante(
        new Request("http://localhost/api/productos/variante", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talla: "S" }),
        }) as any,
        { params: Promise.resolve({ id: simpleExistente.id }) },
      )
      expect(conversion.status).toBe(201)
      const convertido = await prisma.producto.findUniqueOrThrow({
        where: { id: simpleExistente.id }, include: { variantes: true },
      })
      expect(convertido.stock_actual).toBe(4)
      expect(convertido.stock_minimo).toBe(3)
      expect(convertido.variantes[0].stock_actual).toBe(4)
      expect(convertido.variantes[0].stock_minimo).toBe(3)
      await prisma.producto.delete({ where: { id: simpleExistente.id } })

      const comun = await crearProducto({
        nombre: "Prueba precio común",
        precio_venta: 100,
        precio_compra: 40,
        stock_actual: 0,
        stock_minimo: 0,
        unidad: "unidad",
        variantes_stock: [{ talla: "S", stock: 2 }, { talla: "M", stock: 3 }],
      }, org.id)
      productos.push(comun.id)
      const comunGuardado = await prisma.producto.findUniqueOrThrow({
        where: { id: comun.id }, include: { variantes: true },
      })
      expect(comunGuardado.precio_por_variante).toBe(false)
      expect(comunGuardado.variantes.every((v) => v.precio_venta === null)).toBe(true)
      expect(comunGuardado.variantes.every((v) => v.precio_compra === null)).toBe(true)
      expect(comunGuardado.stock_actual).toBe(5)
      await expect(editarProducto(comun.id, {
        precio_por_variante: true,
        precios_variantes: [{ variante_id: comunGuardado.variantes[0].id, precio_venta: 110 }],
      }, org.id)).rejects.toBeInstanceOf(PrecioVarianteInvalidoError)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: comun.id } })).precio_por_variante).toBe(false)

      const distinto = await crearProducto({
        nombre: "Prueba precios por variante",
        precio_venta: 0,
        precio_por_variante: true,
        precio_compra: 50,
        stock_actual: 0,
        stock_minimo: 0,
        unidad: "unidad",
        variantes_stock: [
          { talla: "S", stock: 2, stock_minimo: 1, precio_compra: 60, precio_venta: 120 },
          { talla: "M", stock: 3, stock_minimo: 2, precio_compra: 80, precio_venta: 150 },
        ],
      }, org.id)
      productos.push(distinto.id)
      const distintoGuardado = await prisma.producto.findUniqueOrThrow({
        where: { id: distinto.id }, include: { variantes: true },
      })
      expect(distintoGuardado.stock_actual).toBe(5)
      expect(distintoGuardado.stock_minimo).toBe(3)
      expect(Number(distintoGuardado.precio_compra)).toBe(60)
      expect(Number(distintoGuardado.precio_venta)).toBe(120)
      const varianteS = distintoGuardado.variantes.find((v) => v.talla === "S")!
      const varianteM = distintoGuardado.variantes.find((v) => v.talla === "M")!
      const dto = toProductoDTO(distintoGuardado)
      const s = dto.variantes.find((v) => v.id === varianteS.id)!
      const m = dto.variantes.find((v) => v.id === varianteM.id)!
      const conS = agregarConVariante([], dto, s, 1, false)
      const carrito = agregarConVariante(conS.items, dto, m, 1, false).items
      expect(calcularTotales(carrito, 0).subtotal).toBe(270)
      expect(calcularTotalesConDescuentos(carrito, {}, 0, 0).subtotal).toBe(270)
      expect(calcularTotalesConDescuentos(carrito, { [`${dto.id}::${s.id}`]: 20 }, 0, 0).subtotal).toBe(250)
      expect(serializarParaApi(carrito).map((i) => i.precio_unitario)).toEqual([120, 150])

      const valorConProductos = await calcularValorInventario(org.id)
      expect(valorConProductos.inversion - valorInicial.inversion).toBe(560)
      expect(valorConProductos.recaudacionPotencial - valorInicial.recaudacionPotencial).toBe(1190)

      await expect(registrarVenta({
        organizacion_id: org.id,
        metodo_pago: "tarjeta",
        items: [{ producto_id: distinto.id, variante_id: varianteS.id, cantidad: 1, precio_unitario: 100 }],
      })).rejects.toBeInstanceOf(PrecioDesactualizadoError)
      expect((await prisma.varianteProducto.findUniqueOrThrow({ where: { id: varianteS.id } })).stock_actual).toBe(2)

      const limites = { inicio: new Date(Date.now() - 60_000), fin: new Date(Date.now() + 60_000) }
      const gastosPrevios = (await agregarMetricas(limites, org.id)).totalExpenses

      const venta = await registrarVenta({
        organizacion_id: org.id,
        metodo_pago: "tarjeta",
        items: serializarParaApi(carrito),
      })
      ventaId = venta.id
      expect(venta.items.map((item) => Number(item.precio_unitario))).toEqual([120, 150])
      expect(venta.items.map((item) => Number(item.precio_compra_unitario))).toEqual([60, 80])
      expect((await agregarMetricas(limites, org.id)).totalExpenses - gastosPrevios).toBe(140)
      await prisma.varianteProducto.update({ where: { id: varianteS.id }, data: { precio_compra: 75 } })
      expect((await agregarMetricas(limites, org.id)).totalExpenses - gastosPrevios).toBe(140)
      await prisma.varianteProducto.update({ where: { id: varianteS.id }, data: { precio_compra: 60 } })
      expect((await prisma.varianteProducto.findUniqueOrThrow({ where: { id: varianteS.id } })).stock_actual).toBe(1)
      expect(await eliminarVenta(venta.id, org.id)).toBe(true)
      ventaId = undefined
      expect((await prisma.varianteProducto.findUniqueOrThrow({ where: { id: varianteS.id } })).stock_actual).toBe(2)

      const solicitarEtiqueta = (variante_id?: string) => imprimirEtiqueta(
        new Request("http://localhost/api/productos/etiqueta", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cantidad: 1, variante_id }),
        }) as any,
        { params: Promise.resolve({ id: distinto.id }) },
      )
      const sinVariante = await solicitarEtiqueta()
      expect(sinVariante.ok).toBe(false)
      const etiqueta = await solicitarEtiqueta(varianteM.id)
      expect(etiqueta.status).toBe(200)
      const html = await etiqueta.text()
      expect(html).toContain("$150")
      expect(html).toContain("Variante: M")
      const etiquetaComun = await imprimirEtiqueta(
        new Request("http://localhost/api/productos/etiqueta", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ cantidad: 1 }),
        }) as any,
        { params: Promise.resolve({ id: comun.id }) },
      )
      expect((await etiquetaComun.text())).toContain("$100")

      await editarProducto(distinto.id, { precio_por_variante: false, precio_compra: 55, precio_venta: 110 }, org.id)
      const comunDeNuevo = await prisma.producto.findUniqueOrThrow({
        where: { id: distinto.id }, include: { variantes: true },
      })
      expect(comunDeNuevo.variantes.every((v) => v.precio_venta === null)).toBe(true)
      expect(comunDeNuevo.variantes.every((v) => v.precio_compra === null)).toBe(true)
      expect(comunDeNuevo.stock_actual).toBe(5)
      expect(comunDeNuevo.stock_minimo).toBe(3)
      expect((await calcularValorInventario(org.id)).inversion - valorInicial.inversion).toBe(475)
      expect((await calcularValorInventario(org.id)).recaudacionPotencial - valorInicial.recaudacionPotencial).toBe(1050)

      await editarProducto(distinto.id, {
        precio_por_variante: true,
        precios_variantes: [
          { variante_id: varianteS.id, precio_compra: 65, precio_venta: 125 },
          { variante_id: varianteM.id, precio_compra: 85, precio_venta: 160 },
        ],
        minimos_variantes: [
          { variante_id: varianteS.id, stock_minimo: 2 },
          { variante_id: varianteM.id, stock_minimo: 1 },
        ],
      }, org.id)
      const reactivado = await prisma.producto.findUniqueOrThrow({
        where: { id: distinto.id }, include: { variantes: true },
      })
      expect(reactivado.precio_por_variante).toBe(true)
      expect(reactivado.stock_actual).toBe(5)
      expect(reactivado.stock_minimo).toBe(3)
      expect(reactivado.variantes.map((v) => v.stock_minimo).sort()).toEqual([1, 2])
      expect(reactivado.variantes.map((v) => Number(v.precio_compra)).sort()).toEqual([65, 85])
      expect(reactivado.variantes.map((v) => Number(v.precio_venta)).sort()).toEqual([125, 160])
      expect((await calcularValorInventario(org.id)).inversion - valorInicial.inversion).toBe(585)

      const respuestaNuevaVariante = await agregarVariante(
        new Request("http://localhost/api/productos/variante", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ talla: "L", stock_actual: 1, stock_minimo: 1, precio_compra: 90, precio_venta: 180 }),
        }) as any,
        { params: Promise.resolve({ id: distinto.id }) },
      )
      expect(respuestaNuevaVariante.status).toBe(201)
      const nuevaVariante = await respuestaNuevaVariante.json()
      expect(nuevaVariante.precio_compra).toBe(90)
      expect(nuevaVariante.stock_minimo).toBe(1)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: distinto.id } })).stock_minimo).toBe(4)

      const respuestaEditada = await editarVariante(
        new Request("http://localhost/api/productos/variante", {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ variante_id: nuevaVariante.id, stock_minimo: 2, precio_compra: 95 }),
        }) as any,
        { params: Promise.resolve({ id: distinto.id }) },
      )
      expect(respuestaEditada.status).toBe(200)
      expect((await prisma.producto.findUniqueOrThrow({ where: { id: distinto.id } })).stock_minimo).toBe(5)
      expect((await calcularValorInventario(org.id)).inversion - valorInicial.inversion).toBe(680)
    } finally {
      if (ventaId) await prisma.venta.deleteMany({ where: { id: ventaId } })
      await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: productos } } })
      await prisma.notificacion.deleteMany({ where: { producto_id: { in: productos } } })
      await prisma.producto.deleteMany({ where: { id: { in: productos } } })
    }
  }, 30_000)
})
