import { prisma } from "@/lib/db"
import { limitesUtc } from "@/lib/dominio/metricas"
import { redondearBancario } from "@/lib/money"

export type FlujoProducto = {
  producto_id: string
  nombre: string
  unidad: string
  activo: boolean
  stock_actual: number
  unidadesEntrada: number
  operacionesEntrada: number
  unidadesVendidas: number
  montoVendido: number
  unidadesSalida: number
}

/** Incluye todos los productos del tenant, aun cuando no tuvieron movimientos. */
export async function calcularFlujosProducto(desde: string, hasta: string, organizacion_id: string): Promise<FlujoProducto[]> {
  const { inicio, fin } = limitesUtc(desde, hasta, process.env.TZ ?? "America/Mexico_City")
  const rango = { gte: inicio, lte: fin }
  const [productos, entradas, salidas, ventas] = await Promise.all([
    prisma.producto.findMany({
      where: { organizacion_id },
      select: { id: true, nombre: true, unidad: true, activo: true, stock_actual: true },
      orderBy: [{ nombre: "asc" }, { id: "asc" }],
    }),
    prisma.movimientoStock.findMany({
      where: { organizacion_id, creado_en: rango, tipo: "entrada", cantidad: { gt: 0 } },
      select: { producto_id: true, cantidad: true },
    }),
    prisma.movimientoStock.findMany({
      where: { organizacion_id, creado_en: rango, cantidad: { lt: 0 } },
      select: { producto_id: true, cantidad: true },
    }),
    prisma.ventaItem.findMany({
      where: { organizacion_id, venta: { organizacion_id, estado: "completada", creado_en: rango } },
      select: { producto_id: true, cantidad: true, subtotal_linea: true },
    }),
  ])

  const porId = new Map<string, FlujoProducto>(productos.map((p) => [p.id, {
    producto_id: p.id,
    nombre: p.nombre,
    unidad: p.unidad,
    activo: p.activo,
    stock_actual: p.stock_actual,
    unidadesEntrada: 0,
    operacionesEntrada: 0,
    unidadesVendidas: 0,
    montoVendido: 0,
    unidadesSalida: 0,
  }]))
  for (const entrada of entradas) {
    const fila = porId.get(entrada.producto_id)
    if (fila) { fila.unidadesEntrada += entrada.cantidad; fila.operacionesEntrada++ }
  }
  for (const salida of salidas) {
    const fila = porId.get(salida.producto_id)
    if (fila) fila.unidadesSalida += Math.abs(salida.cantidad)
  }
  for (const venta of ventas) {
    const fila = porId.get(venta.producto_id)
    if (fila) {
      fila.unidadesVendidas += venta.cantidad
      fila.montoVendido += Number(venta.subtotal_linea)
    }
  }
  return [...porId.values()].map((fila) => ({ ...fila, montoVendido: redondearBancario(fila.montoVendido) }))
}
