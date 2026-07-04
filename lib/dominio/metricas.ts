// Feature: dashboard-metricas-notificaciones
// Capa de dominio analítico: cálculo de las métricas del Dashboard_Analitico.
//
// Reglas (ver requirements.md):
// - R2.4 : el filtrado por rango es INCLUSIVO en ambos extremos, interpretado en `tz`.
// - R2.6 : totalSales = SUM(ventas.total) de ventas con estado="completada" y NO fiadas con deuda pendiente.
// - R2.7 : totalReturns = SUM(producto.precio_venta × cantidad) de movimientos tipo="devolucion".
// - R2.8 : totalExpenses = SUM(producto.precio_compra × item.cantidad) de ítems de ventas completadas.
// - R2.9 : estimatedProfit = totalSales − totalExpenses.
// - R2.10: todo monto de salida se redondea con `redondearBancario`.
// - R2.11: cada métrica se compara contra el Periodo_Anterior contiguo de igual duración.
// - R2.13: sin registros en el rango, las cuatro métricas valen 0.
// - Req 9.1–9.3: se excluye de totalSales el monto de ventas fiadas mientras
//   el saldo del cliente asociado sea > 0; se incluye cuando el saldo llega a 0.
// - Req 9.4–9.6: totalDeuda = totalesDeuda(organizacion_id).totalDeudaPendiente.
import { fromZonedTime } from "date-fns-tz"
import { prisma } from "@/lib/db"
import { redondearBancario } from "@/lib/money"
import { periodoAnterior, type RangoFechas } from "@/lib/dashboard/rango"
import { agruparPorDia, variacionPorcentual } from "@/lib/dashboard/series"
import { totalesDeuda } from "@/lib/dominio/deuda"
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
 * (inclusivo en ambos extremos), restringidas al tenant `organizacion_id`.
 * Devuelve los totales crudos y los puntos por instante de ventas y gastos
 * para alimentar las series por día.
 *
 * Req 1.1, 1.3, 1.5: todas las consultas filtran por `organizacion_id`.
 * Req 1.6: sin registros del tenant, las métricas devuelven 0.
 * Req 9.1–9.3: las ventas fiadas se excluyen de totalSales mientras el saldo
 *   del cliente asociado sea > 0 (incluso con abonos parciales); se incluyen
 *   cuando el saldo llega exactamente a 0.
 */
export async function agregarMetricas(
  limites: LimitesUtc,
  organizacion_id: string
): Promise<MetricasAgregadas> {
  const enRango = { gte: limites.inicio, lte: limites.fin }

  // ── Ventas completadas en el rango del tenant (total + creado_en + datos de fiado) ──
  const ventas = await prisma.venta.findMany({
    where: { organizacion_id, estado: "completada", creado_en: enRango },
    select: {
      total: true,
      creado_en: true,
      metodo_pago: true,
      cliente_id: true,
    },
  })

  // ── Recopilar saldos de clientes que tienen ventas fiadas en este lote ──
  // Una venta fiada contribuye a totalSales solo cuando el saldo del cliente es 0.
  // Req 9.1–9.3: se consulta el saldo actual del cliente (no el histórico del rango).
  const clienteIdsFiados = [
    ...new Set(
      ventas
        .filter((v) => v.metodo_pago === "fiado" && v.cliente_id !== null)
        .map((v) => v.cliente_id as string)
    ),
  ]

  // Calcular saldo actual de cada cliente fiado relevante.
  const saldosPorCliente = new Map<string, number>()
  if (clienteIdsFiados.length > 0) {
    const movimientos = await prisma.movimientoDeuda.findMany({
      where: { organizacion_id, cliente_id: { in: clienteIdsFiados } },
      select: { cliente_id: true, tipo: true, monto: true },
    })
    for (const m of movimientos) {
      const prev = saldosPorCliente.get(m.cliente_id) ?? 0
      const monto = Number(m.monto)
      saldosPorCliente.set(
        m.cliente_id,
        m.tipo === "cargo" ? prev + monto : prev - monto
      )
    }
    // Aplicar redondeo bancario a cada saldo acumulado.
    for (const [id, saldo] of saldosPorCliente.entries()) {
      saldosPorCliente.set(id, redondearBancario(saldo))
    }
  }

  // ── Ítems de ventas completadas en el rango del tenant (precio_compra del PRODUCTO × cantidad) ──
  const items = await prisma.ventaItem.findMany({
    where: { organizacion_id, venta: { estado: "completada", creado_en: enRango } },
    select: {
      cantidad: true,
      producto: { select: { precio_compra: true } },
      venta: { select: { creado_en: true } },
    },
  })

  // ── Movimientos de devolución en el rango del tenant (precio_venta del producto × cantidad) ──
  const devoluciones = await prisma.movimientoStock.findMany({
    where: { organizacion_id, tipo: "devolucion", creado_en: enRango },
    select: {
      cantidad: true,
      producto: { select: { precio_venta: true } },
    },
  })

  let totalSales = 0
  const puntosVentas: Array<{ creado_en: string; valor: number }> = []
  for (const v of ventas) {
    const valor = Number(v.total)

    // Req 9.1–9.3: excluir ventas fiadas con saldo > 0.
    if (v.metodo_pago === "fiado") {
      const clienteSaldo =
        v.cliente_id !== null ? (saldosPorCliente.get(v.cliente_id) ?? 0) : 0
      // Solo incluir si el saldo del cliente es exactamente 0 (deuda saldada).
      if (clienteSaldo > 0) {
        continue
      }
    }

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
 * interpretado en `tz`, restringidas al tenant `organizacion_id`. Compara contra
 * el Periodo_Anterior contiguo de igual duración (R2.11). Aplica redondeo
 * bancario a todos los montos (R2.10) y arma las series por día.
 *
 * Req 1.1, 1.3, 1.5: filtra por `organizacion_id` en todas las agregaciones.
 * Req 1.4: si no hay organización activa el guard de `resolverContexto` ya
 *   devuelve error antes de llegar aquí; esta función asume siempre un tenant válido.
 * Req 1.6: sin registros del tenant, todas las métricas devuelven 0.
 * Req 9.4–9.6: incluye `totalDeuda` desde `totalesDeuda(organizacion_id)`.
 *   Si no hay clientes con deuda, `totalDeuda` es 0 (Req 9.6).
 * Req 9.7: redondeo bancario en todos los montos; solo registros del tenant.
 */
export async function calcularMetricas(
  desde: string,
  hasta: string,
  tz: string,
  organizacion_id: string
): Promise<MetricasDTO> {
  const rango: RangoFechas = { desde, hasta }
  const anterior = periodoAnterior(desde, hasta)

  // Ejecutar agregaciones del periodo actual, anterior y totales de deuda en paralelo.
  const [actualAgg, anteriorAgg, deudaTotales] = await Promise.all([
    agregarMetricas(limitesUtc(desde, hasta, tz), organizacion_id),
    agregarMetricas(limitesUtc(anterior.desde, anterior.hasta, tz), organizacion_id),
    totalesDeuda(organizacion_id),
  ])

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
    // Req 9.4–9.6: "Total de dinero en deuda" — mismo origen que la sección Fiadores.
    // Cero si no hay clientes con deuda (Req 9.6). Redondeo bancario ya aplicado en totalesDeuda.
    totalDeuda: deudaTotales.totalDeudaPendiente,
    series,
  }
}
