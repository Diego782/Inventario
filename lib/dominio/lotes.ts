import { formatInTimeZone } from "date-fns-tz"
import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/db"
import { cerrarAlertasDeLote, detectarStockCero, detectarStockCritico, estadoStock } from "@/lib/dominio/notificaciones"
import { LoteInvalidoError, ProductoVencidoError } from "@/lib/api/errores"

type Tx = Prisma.TransactionClient
const zona = () => process.env.TZ ?? "America/Mexico_City"
export const hoyCivil = () => formatInTimeZone(new Date(), zona(), "yyyy-MM-dd")
export const fechaCivil = (valor: string) => new Date(`${valor}T00:00:00.000Z`)
export const diaLote = (fecha: Date) => fecha.toISOString().slice(0, 10)

function validarAlcance(variantes: { id: string }[], varianteId: string | null) {
  if (variantes.length ? !varianteId || !variantes.some((v) => v.id === varianteId) : !!varianteId) {
    throw new LoteInvalidoError("Selecciona una variante válida para el lote.")
  }
}

export async function crearLotesIniciales(
  tx: Tx,
  producto: { id: string; stock_actual: number; variantes: { id: string; talla: string; stock_actual: number }[] },
  organizacionId: string,
  lotes: { talla?: string | null; fecha_vencimiento: string; cantidad: number }[],
) {
  const pendientes = new Map<string, number>(producto.variantes.length
    ? producto.variantes.map((v) => [v.id, v.stock_actual])
    : [["__producto__", producto.stock_actual]])
  for (const lote of lotes) {
    const variante = lote.talla ? producto.variantes.find((v) => v.talla === lote.talla) : null
    const clave = variante?.id ?? "__producto__"
    if (!pendientes.has(clave) || (producto.variantes.length > 0 && !variante)) {
      throw new LoteInvalidoError("Un lote no corresponde a una variante del producto.")
    }
    pendientes.set(clave, pendientes.get(clave)! - lote.cantidad)
    await tx.loteProducto.create({ data: {
      organizacion_id: organizacionId,
      producto_id: producto.id,
      variante_id: variante?.id ?? null,
      fecha_vencimiento: fechaCivil(lote.fecha_vencimiento),
      cantidad_inicial: lote.cantidad,
      stock_actual: lote.cantidad,
    } })
  }
  if ([...pendientes.values()].some((cantidad) => cantidad !== 0)) {
    throw new LoteInvalidoError("Asigna fechas de vencimiento a todo el stock inicial.")
  }
}

/** Asigna fechas a stock legado sin modificar ni una unidad del inventario. */
export async function asignarLotesExistentes(
  tx: Tx,
  productoId: string,
  organizacionId: string,
  lotes: { variante_id?: string | null; fecha_vencimiento: string; cantidad: number }[],
) {
  if (!lotes.length) return
  const producto = await tx.producto.findFirst({
    where: { id: productoId, organizacion_id: organizacionId },
    include: { variantes: true, lotes: true },
  })
  if (!producto?.controla_vencimiento) throw new LoteInvalidoError("Activa el control de vencimiento antes de asignar fechas.")
  const disponibles = new Map<string, number>(producto.variantes.length
    ? producto.variantes.map((v) => [v.id, v.stock_actual])
    : [["__producto__", producto.stock_actual]])
  for (const lote of producto.lotes) {
    const clave = lote.variante_id ?? "__producto__"
    if (disponibles.has(clave)) disponibles.set(clave, disponibles.get(clave)! - lote.stock_actual)
  }
  for (const lote of lotes) {
    const varianteId = lote.variante_id ?? null
    validarAlcance(producto.variantes, varianteId)
    const clave = varianteId ?? "__producto__"
    const disponible = disponibles.get(clave) ?? 0
    if (lote.cantidad > disponible) throw new LoteInvalidoError("La cantidad supera el stock sin fecha asignada.")
    disponibles.set(clave, disponible - lote.cantidad)
    await tx.loteProducto.create({ data: {
      organizacion_id: organizacionId,
      producto_id: productoId,
      variante_id: varianteId,
      fecha_vencimiento: fechaCivil(lote.fecha_vencimiento),
      cantidad_inicial: lote.cantidad,
      stock_actual: lote.cantidad,
    } })
  }
}

export async function listarLotes(productoId: string, organizacionId: string) {
  const producto = await prisma.producto.findFirst({
    where: { id: productoId, organizacion_id: organizacionId },
    include: { variantes: true, lotes: { orderBy: [{ fecha_vencimiento: "asc" }, { creado_en: "asc" }] } },
  })
  if (!producto) throw new LoteInvalidoError("Producto no encontrado.")
  const sinFecha = producto.variantes.length
    ? producto.variantes.map((v) => ({
      variante_id: v.id, variante: v.talla,
      cantidad: v.stock_actual - producto.lotes.filter((l) => l.variante_id === v.id).reduce((s, l) => s + l.stock_actual, 0),
    }))
    : [{ variante_id: null, variante: null,
      cantidad: producto.stock_actual - producto.lotes.filter((l) => l.variante_id === null).reduce((s, l) => s + l.stock_actual, 0) }]
  return {
    controla_vencimiento: producto.controla_vencimiento,
    sin_fecha: sinFecha,
    lotes: producto.lotes.map((l) => ({
      id: l.id, variante_id: l.variante_id,
      variante: producto.variantes.find((v) => v.id === l.variante_id)?.talla ?? null,
      fecha_vencimiento: diaLote(l.fecha_vencimiento),
      cantidad_inicial: l.cantidad_inicial, stock_actual: l.stock_actual,
    })),
  }
}

export async function registrarLote(
  productoId: string, organizacionId: string,
  input: { variante_id?: string | null; fecha_vencimiento: string; cantidad: number; modo: "entrada" | "asignar" },
) {
  if (input.modo === "asignar") {
    await prisma.$transaction((tx) => asignarLotesExistentes(tx, productoId, organizacionId, [input]))
    return
  }
  await prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findFirst({
      where: { id: productoId, organizacion_id: organizacionId, activo: true }, include: { variantes: true },
    })
    if (!producto?.controla_vencimiento) throw new LoteInvalidoError("Este producto no controla vencimientos.")
    const varianteId = input.variante_id ?? null
    validarAlcance(producto.variantes, varianteId)
    await tx.loteProducto.create({ data: {
      organizacion_id: organizacionId, producto_id: productoId, variante_id: varianteId,
      fecha_vencimiento: fechaCivil(input.fecha_vencimiento),
      cantidad_inicial: input.cantidad, stock_actual: input.cantidad,
    } })
    if (varianteId) await tx.varianteProducto.update({ where: { id: varianteId }, data: { stock_actual: { increment: input.cantidad } } })
    const actualizado = await tx.producto.update({
      where: { id: productoId }, data: { stock_actual: { increment: input.cantidad } },
    })
    await tx.movimientoStock.create({ data: {
      organizacion_id: organizacionId, producto_id: productoId, tipo: "entrada",
      cantidad: input.cantidad, stock_resultante: actualizado.stock_actual,
      motivo: `Entrada de lote con vencimiento ${input.fecha_vencimiento}`,
    } })
  })
}

export async function descartarLote(productoId: string, organizacionId: string, loteId: string) {
  await prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findFirst({ where: { id: productoId, organizacion_id: organizacionId } })
    const lote = await tx.loteProducto.findFirst({ where: { id: loteId, producto_id: productoId, organizacion_id: organizacionId } })
    if (!producto || !lote || lote.stock_actual <= 0) throw new LoteInvalidoError("El lote no tiene stock para descartar.")
    const cantidad = lote.stock_actual
    await tx.loteProducto.update({ where: { id: loteId }, data: { stock_actual: 0 } })
    await cerrarAlertasDeLote(tx, loteId)
    if (lote.variante_id) await tx.varianteProducto.update({ where: { id: lote.variante_id }, data: { stock_actual: { decrement: cantidad } } })
    const actualizado = await tx.producto.update({ where: { id: productoId }, data: { stock_actual: { decrement: cantidad } } })
    await tx.movimientoStock.create({ data: {
      organizacion_id: organizacionId, producto_id: productoId, tipo: "merma",
      cantidad: -cantidad, stock_resultante: actualizado.stock_actual,
      motivo: `Descarte de lote con vencimiento ${diaLote(lote.fecha_vencimiento)}`,
    } })
    await detectarStockCritico(tx, {
      organizacion_id: organizacionId, producto_id: productoId, nombre: producto.nombre,
      stock_actual: actualizado.stock_actual, stock_minimo: producto.stock_minimo,
    }, estadoStock(producto.stock_actual, producto.stock_minimo))
    await detectarStockCero(tx, {
      organizacion_id: organizacionId, producto_id: productoId, nombre: producto.nombre,
      stock_actual: actualizado.stock_actual,
    })
  })
}

/** FEFO: primero el lote vigente que vence antes; luego stock legado sin fecha. */
export async function consumirLotesVenta(
  tx: Tx,
  params: { producto_id: string; variante_id: string | null; cantidad: number; stock_disponible: number; venta_item_id: string },
) {
  await tx.$queryRaw`SELECT id FROM lotes_producto WHERE producto_id = ${params.producto_id} AND variante_id <=> ${params.variante_id} FOR UPDATE`
  const lotes = await tx.loteProducto.findMany({
    where: { producto_id: params.producto_id, variante_id: params.variante_id, stock_actual: { gt: 0 } },
    orderBy: [{ fecha_vencimiento: "asc" }, { creado_en: "asc" }, { id: "asc" }],
  })
  const sinFecha = Math.max(0, params.stock_disponible - lotes.reduce((s, l) => s + l.stock_actual, 0))
  const vigentes = lotes.filter((l) => diaLote(l.fecha_vencimiento) >= hoyCivil())
  if (params.cantidad > sinFecha + vigentes.reduce((s, l) => s + l.stock_actual, 0)) {
    throw new ProductoVencidoError()
  }
  let pendiente = params.cantidad
  for (const lote of vigentes) {
    const cantidad = Math.min(pendiente, lote.stock_actual)
    if (!cantidad) continue
    await tx.loteProducto.update({ where: { id: lote.id }, data: { stock_actual: { decrement: cantidad } } })
    if (cantidad === lote.stock_actual) await cerrarAlertasDeLote(tx, lote.id)
    await tx.ventaItemLote.create({ data: { venta_item_id: params.venta_item_id, lote_id: lote.id, cantidad } })
    pendiente -= cantidad
    if (!pendiente) break
  }
  // El remanente sale de stock histórico sin fecha, que no tiene un lote físico.
}

export async function restaurarLotesVenta(tx: Tx, ventaItemId: string) {
  const asignaciones = await tx.ventaItemLote.findMany({ where: { venta_item_id: ventaItemId } })
  for (const asignacion of asignaciones) {
    await tx.loteProducto.update({ where: { id: asignacion.lote_id }, data: { stock_actual: { increment: asignacion.cantidad } } })
  }
}
