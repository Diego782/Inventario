// Feature: dashboard-metricas-notificaciones
// Capa de dominio analítico: cálculo de las métricas del Dashboard_Analitico.
//
// Reglas (ver requirements.md):
// - R2.4 : el filtrado por rango es INCLUSIVO en ambos extremos, interpretado en `tz`.
// - R2.6 : totalSales = SUM(ventas.total) de ventas con estado="completada".
// - R2.7 : totalReturns = SUM(producto.precio_venta × cantidad) de movimientos tipo="devolucion".
// - R2.8 : totalExpenses = SUM(producto.precio_compra × item.cantidad) de ítems de ventas completadas.
// - R2.9 : estimatedProfit = totalSales − totalExpenses.
// - R2.10: todo monto de salida se redondea con `redondearBancario`.
// - R2.11: cada métrica se compara contra el Periodo_Anterior contiguo de igual duración.
// - R2.13: sin registros en el rango, las cuatro métricas valen 0.
import { fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/db"
import { redondearBancario } from "@/lib/money"
import { periodoAnterior, type RangoFechas } from "@/lib/dashboard/rango"
import { agruparPorDia, variacionPorcentual } from "@/lib/dashboard/series"
import type { MetricaConVariacion, MetricasDTO } from "@/lib/api/serializadores"

/** Límites instantáneos del rango civil `[desde, hasta]` en `tz`, inclusivos. */
export type LimitesUtc = { inicio: Date; fin: Date }

/**
 * Convierte un rango de fechas civiles `YYYY-MM-DD` a sus instantes UTC inclusivos
 * en la zona horaria `tz` (R2.4): `inicio` es `desde 00:00:00.000` y `fin` es
 * `hasta 23:59:59.999`, ambos interpretados como horas locales de `tz`.
 */
export function limitesUtc(desde: string, hasta: string, tz: string): LimitesUtc {
  return {
    inicio: fromZonedTime(`${desde}T00:00:00.000`, tz),
    fin: fromZonedTime(`${hasta}T23:59:59.999`, tz),
  }
}

/** Métricas crudas (sin redondear) agregadas para un rango concreto. */
export type MetricasAgregadas = {
  totalSales: number
  totalReturns: number
  totalExpenses: number
  estimatedProfit: number
  // Puntos crudos por instante para construir las series temporales.
  puntosVentas: Array<{ creado_en: string; valor: number }>
  puntosGastos: Array<{ creado_en: string; valor: number }>
}

/**
 * Ejecuta las agregaciones Prisma para el rango delimitado por `limites`
 * (inclusivo en ambos extremos). Devuelve los totales crudos y los puntos por
 * instante de ventas y gastos para alimentar las series por día.
 */
export async function agregarMetricas(limites: LimitesUtc): Promise<MetricasAgregadas> {
  const enRango = { gte: limites.inicio, lte: limites.fin }

  // ── Ventas completadas en el rango (total + creado_en para serie) ──
  const ventas = await prisma.venta.findMany({
    where: { estado: "completada", creado_en: enRango },
    select: { total: true, creado_en: true },
  })

  // ── Ítems de ventas completadas en el rango (precio_compra del PRODUCTO × cantidad) ──
  const items = await prisma.ventaItem.findMany({
    where: { venta: { estado: "completada", creado_en: enRango } },
    select: {
      cantidad: true,
      producto: { select: { precio_compra: true } },
      venta: { select: { creado_en: true } },
    },
  })

  // ── Movimientos de devolución en el rango (precio_venta del producto × cantidad) ──
  const devoluciones = await prisma.movimientoStock.findMany({
    where: { tipo: "devolucion", creado_en: enRango },
    select: {
      cantidad: true,
      producto: { select: { precio_venta: true } },
    },
  })

  let totalSales = 0
  const puntosVentas: Array<{ creado_en: string; valor: number }> = []
  for (const v of ventas) {
    const valor = Number(v.total)
    totalSales += valor
    puntosVentas.push({ creado_en: v.creado_en.toISOString(), valor })
  }

  let totalExpenses = 0
  const puntosGastos: Array<{ creado_en: string; valor: number }> = []
  for (const it of items) {
    const valor = Number(it.producto.precio_compra) * it.cantidad
    totalExpenses += valor
    puntosGastos.push({ creado_en: it.venta.creado_en.toISOString(), valor })
  }

  let totalReturns = 0
  for (const d of devoluciones) {
    totalReturns += Number(d.producto.precio_venta) * d.cantidad
  }

  const estimatedProfit = totalSales - totalExpenses

  return {
    totalSales,
    totalReturns,
    totalExpenses,
    estimatedProfit,
    puntosVentas,
    puntosGastos,
  }
}

/** Construye una `MetricaConVariacion` a partir de los valores crudos actual/anterior. */
function metrica(actualCrudo: number, anteriorCrudo: number): MetricaConVariacion {
  const actual = redondearBancario(actualCrudo)
  const anterior = redondearBancario(anteriorCrudo)
  return {
    actual,
    anterior,
    variacionPorcentual: variacionPorcentual(actual, anterior),
  }
}

/**
 * Calcula las métricas del Dashboard_Analitico para el rango `[desde, hasta]`
 * interpretado en `tz`, comparándolas contra el Periodo_Anterior contiguo de
 * igual duración (R2.11). Aplica redondeo bancario a todos los montos (R2.10) y
 * arma las series por día de ventas y gastos.
 */
export async function calcularMetricas(
  desde: string,
  hasta: string,
  tz: string
): Promise<MetricasDTO> {
  const rango: RangoFechas = { desde, hasta }
  const anterior = periodoAnterior(desde, hasta)

  const actualAgg = await agregarMetricas(limitesUtc(desde, hasta, tz))
  const anteriorAgg = await agregarMetricas(limitesUtc(anterior.desde, anterior.hasta, tz))

  const series = {
    ventas: agruparPorDia(actualAgg.puntosVentas, rango, tz).map((p) => ({
      fecha: p.fecha,
      valor: redondearBancario(p.valor),
    })),
    gastos: agruparPorDia(actualAgg.puntosGastos, rango, tz).map((p) => ({
      fecha: p.fecha,
      valor: redondearBancario(p.valor),
    })),
  }

  return {
    rango,
    periodoAnterior: anterior,
    totalSales: metrica(actualAgg.totalSales, anteriorAgg.totalSales),
    totalReturns: metrica(actualAgg.totalReturns, anteriorAgg.totalReturns),
    totalExpenses: metrica(actualAgg.totalExpenses, anteriorAgg.totalExpenses),
    estimatedProfit: metrica(actualAgg.estimatedProfit, anteriorAgg.estimatedProfit),
    series,
  }
}
