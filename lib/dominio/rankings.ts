// Capa de dominio de rankings (Flujo A del spec dashboard-metricas-notificaciones).
// Aquí vive la función pura de ordenamiento/tope de los rankings y, más adelante
// (tarea 3.5), `calcularRankings`. Ver design.md § "lib/dominio/rankings.ts".

/**
 * Función pura: ordena `items` por la métrica `claveValor` en la `direccion` dada
 * ("desc" o "asc"), desempata SIEMPRE por `producto_id` ascendente y trunca el
 * resultado a `limite` elementos (R3.6–R3.10). No muta la entrada.
 *
 * Es genérica sobre el nombre de la clave de la métrica para poder reutilizarse en
 * los distintos rankings (más vendidos, mayor margen, mayor rotación, etc.).
 */
export function ordenarRanking<
  K extends string,
  T extends { producto_id: string } & Record<K, number>,
>(items: readonly T[], claveValor: K, direccion: "asc" | "desc", limite: number): T[] {
  return [...items]
    .sort((a, b) => {
      const va = a[claveValor]
      const vb = b[claveValor]
      if (va !== vb) {
        return direccion === "desc" ? vb - va : va - vb
      }
      // Empate en la métrica ⇒ desempate por producto_id ascendente (R3.9).
      if (a.producto_id < b.producto_id) return -1
      if (a.producto_id > b.producto_id) return 1
      return 0
    })
    .slice(0, limite)
}

// ---------------------------------------------------------------------------
// calcularRankings (tarea 3.5) — agregaciones Prisma + ordenarRanking (puro)
// ---------------------------------------------------------------------------
// Reglas (ver requirements.md R3.5–R3.12 y design.md § "Capa de dominio analítico"):
// - R3.6  topSelling : Productos con MÁS unidades vendidas (SUM venta_item.cantidad de
//                      ventas estado="completada" en rango), desc; incluye unidades y
//                      monto vendido (SUM precio_unitario × cantidad). Monto redondeado.
// - R3.7  topMargin  : Productos por margen unitario `precio_venta − precio_compra`,
//                      desc. Margen redondeado.
// - R3.8  topRotation: Productos con MÁS unidades con salida en el rango, desc.
// - R3.9  lowRotation: Productos ACTIVOS con MENOS unidades con salida (incluyendo cero
//                      salidas), asc.
// - R3.6–R3.9 desempatan SIEMPRE por producto_id ascendente (vía ordenarRanking).
// - R3.10 cada lista se trunca a `limite`.
// - R3.11 todo valor monetario se redondea con redondearBancario.
// - R3.12 sin ventas en el período ⇒ topSelling y topRotation vacíos; lowRotation
//          poblado con los Productos activos y cero salidas.
//
// "Unidad con salida" = movimiento que decrementa stock. En el core la magnitud de los
// movimientos de salida (venta/salida/merma/ajuste negativo) se persiste con `cantidad`
// negativa, por lo que el filtro robusto e independiente del tipo es `cantidad < 0`.
import { prisma } from "@/lib/db"
import { redondearBancario } from "@/lib/money"
import { limitesUtc } from "@/lib/dominio/metricas"
import type {
  RankingsDTO,
  RankingItemVenta,
  RankingItemMargen,
  RankingItemRotacion,
} from "@/lib/api/serializadores"

const TZ_DEFAULT = "America/Mexico_City"

/**
 * Calcula los cuatro rankings del Dashboard_Analitico para el rango `[desde, hasta]`
 * interpretado en `tz`, restringidos exclusivamente a registros de `organizacion_id`
 * (Req 1.2, 1.5). Sin registros del tenant → `topSelling` y `topRotation` vacíos;
 * `lowRotation` poblado con los productos activos del tenant y cero salidas (Req 1.6).
 */
export async function calcularRankings(
  desde: string,
  hasta: string,
  limite: number,
  organizacion_id: string,
  tz: string = process.env.TZ ?? TZ_DEFAULT,
): Promise<RankingsDTO> {
  const limites = limitesUtc(desde, hasta, tz)
  const enRango = { gte: limites.inicio, lte: limites.fin }

  // ── topSelling: ítems de ventas completadas en el rango, del tenant, agregados por producto ──
  const itemsVenta = await prisma.ventaItem.findMany({
    where: {
      organizacion_id,
      venta: { estado: "completada", creado_en: enRango, organizacion_id },
    },
    select: {
      producto_id: true,
      cantidad: true,
      precio_unitario: true,
      producto: { select: { nombre: true } },
    },
  })

  const ventaPorProducto = new Map<
    string,
    { producto_id: string; nombre: string; unidadesVendidas: number; montoVendido: number }
  >()
  for (const it of itemsVenta) {
    const prev =
      ventaPorProducto.get(it.producto_id) ??
      { producto_id: it.producto_id, nombre: it.producto.nombre, unidadesVendidas: 0, montoVendido: 0 }
    prev.unidadesVendidas += it.cantidad
    prev.montoVendido += Number(it.precio_unitario) * it.cantidad
    ventaPorProducto.set(it.producto_id, prev)
  }

  const topSelling: RankingItemVenta[] = ordenarRanking(
    [...ventaPorProducto.values()],
    "unidadesVendidas",
    "desc",
    limite,
  ).map((r) => ({
    producto_id: r.producto_id,
    nombre: r.nombre,
    unidadesVendidas: r.unidadesVendidas,
    montoVendido: redondearBancario(r.montoVendido), // R3.11
  }))

  // ── topMargin: margen unitario por producto del tenant (precio_venta − precio_compra) ──
  const productos = await prisma.producto.findMany({
    where: { organizacion_id },
    select: { id: true, nombre: true, precio_compra: true, precio_venta: true, activo: true },
  })

  const margenItems = productos.map((p) => ({
    producto_id: p.id,
    nombre: p.nombre,
    margen: redondearBancario(Number(p.precio_venta) - Number(p.precio_compra)), // R3.7 + R3.11
  }))
  const topMargin: RankingItemMargen[] = ordenarRanking(margenItems, "margen", "desc", limite)

  // ── Salidas por producto en el rango, del tenant (movimientos que decrementan stock) ──
  const movimientos = await prisma.movimientoStock.findMany({
    where: { organizacion_id, creado_en: enRango, cantidad: { lt: 0 } },
    select: {
      producto_id: true,
      cantidad: true,
      producto: { select: { nombre: true } },
    },
  })

  const salidaPorProducto = new Map<string, { nombre: string; unidadesSalida: number }>()
  for (const m of movimientos) {
    const prev = salidaPorProducto.get(m.producto_id) ?? { nombre: m.producto.nombre, unidadesSalida: 0 }
    prev.unidadesSalida += Math.abs(m.cantidad)
    salidaPorProducto.set(m.producto_id, prev)
  }

  // ── topRotation: productos del tenant con mayor salida, desc (R3.8) ──
  const rotacionItems: RankingItemRotacion[] = [...salidaPorProducto.entries()].map(
    ([producto_id, v]) => ({ producto_id, nombre: v.nombre, unidadesSalida: v.unidadesSalida }),
  )
  const topRotation: RankingItemRotacion[] = ordenarRanking(
    rotacionItems,
    "unidadesSalida",
    "desc",
    limite,
  )

  // ── lowRotation: productos ACTIVOS del tenant con menor salida, asc, incluyendo ceros (R3.9, R3.12, Req 1.6) ──
  const lowRotationItems: RankingItemRotacion[] = productos
    .filter((p) => p.activo)
    .map((p) => ({
      producto_id: p.id,
      nombre: p.nombre,
      unidadesSalida: salidaPorProducto.get(p.id)?.unidadesSalida ?? 0,
    }))
  const lowRotation: RankingItemRotacion[] = ordenarRanking(
    lowRotationItems,
    "unidadesSalida",
    "asc",
    limite,
  )

  return {
    rango: { desde, hasta },
    limite,
    topSelling,
    topMargin,
    topRotation,
    lowRotation,
  }
}
