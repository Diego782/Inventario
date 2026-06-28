/**
 * lib/api/serializadores.ts
 * Convierte entidades de Prisma a DTOs seguros para la API.
 * - Convierte Decimal → number (redondeado a 2 decimales)
 * - Convierte DateTime → string ISO 8601
 * - Calcula estado_stock según R7
 */
import type { Producto as PProducto, Venta as PVenta, VentaItem as PVentaItem, MovimientoStock as PMovimiento, VarianteProducto as PVariante, Notificacion as PNotificacion } from "@prisma/client"
import { redondearBancario } from "@/lib/money"

// ---- Tipos DTO ----

export type EstadoStock = "En Stock" | "Bajo Stock" | "Crítico"

export type VarianteDTO = {
  id: string
  talla: string
  stock_actual: number
  codigo_barras: string | null
}

export type ProductoDTO = {
  id: string
  codigo_barras: string | null
  nombre: string
  categoria_id: string | null
  precio_compra: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  unidad: string
  talla: string | null
  activo: boolean
  creado_en: string
  actualizado_en: string
  estado_stock: EstadoStock
  variantes: VarianteDTO[]
}

export type VentaItemDTO = {
  id: string
  venta_id: string
  producto_id: string
  producto_nombre: string | null
  cantidad: number
  precio_unitario: number
  subtotal_linea: number
}

export type VentaDTO = {
  id: string
  folio: string
  subtotal: number
  impuesto: number
  total: number
  metodo_pago: string
  fiador_id: string | null
  usuario_id: string | null
  estado: string
  creado_en: string
  items?: VentaItemDTO[]
}

export type MovimientoDTO = {
  id: string
  producto_id: string
  tipo: string
  cantidad: number
  stock_resultante: number
  motivo: string | null
  usuario_id: string | null
  referencia_id: string | null
  creado_en: string
}

// ---- Cálculo de estado de stock (R7) ----

export function calcularEstadoStock(stock_actual: number, stock_minimo: number): EstadoStock {
  if (stock_actual === 0 || stock_actual <= stock_minimo * 0.3) return "Crítico"
  if (stock_actual <= stock_minimo) return "Bajo Stock"
  return "En Stock"
}

// ---- Serializadores ----

export function toProductoDTO(p: PProducto & { variantes?: PVariante[] }): ProductoDTO {
  const variantes = (p.variantes ?? []).map((v) => ({
    id: v.id,
    talla: v.talla,
    stock_actual: v.stock_actual,
    codigo_barras: v.codigo_barras,
  }))

  // Si tiene variantes, el stock total es la suma de las variantes
  const stockTotal = variantes.length > 0
    ? variantes.reduce((sum, v) => sum + v.stock_actual, 0)
    : p.stock_actual

  return {
    id: p.id,
    codigo_barras: p.codigo_barras,
    nombre: p.nombre,
    categoria_id: p.categoria_id,
    precio_compra: redondearBancario(Number(p.precio_compra)),
    precio_venta: redondearBancario(Number(p.precio_venta)),
    stock_actual: stockTotal,
    stock_minimo: p.stock_minimo,
    unidad: p.unidad,
    talla: p.talla ?? null,
    activo: p.activo,
    creado_en: p.creado_en.toISOString(),
    actualizado_en: p.actualizado_en.toISOString(),
    estado_stock: calcularEstadoStock(stockTotal, p.stock_minimo),
    variantes,
  }
}

export function toVentaItemDTO(item: PVentaItem & { producto?: PProducto | null }): VentaItemDTO {
  return {
    id: item.id,
    venta_id: item.venta_id,
    producto_id: item.producto_id,
    producto_nombre: item.producto?.nombre ?? null,
    cantidad: item.cantidad,
    precio_unitario: redondearBancario(Number(item.precio_unitario)),
    subtotal_linea: redondearBancario(Number(item.subtotal_linea)),
  }
}

export function toVentaDTO(v: PVenta & { items?: (PVentaItem & { producto?: PProducto | null })[] }): VentaDTO {
  return {
    id: v.id,
    folio: v.folio,
    subtotal: redondearBancario(Number(v.subtotal)),
    impuesto: redondearBancario(Number(v.impuesto)),
    total: redondearBancario(Number(v.total)),
    metodo_pago: v.metodo_pago,
    fiador_id: v.fiador_id,
    usuario_id: v.usuario_id,
    estado: v.estado,
    creado_en: v.creado_en.toISOString(),
    items: v.items?.map(toVentaItemDTO),
  }
}

export function toMovimientoDTO(m: PMovimiento): MovimientoDTO {
  return {
    id: m.id,
    producto_id: m.producto_id,
    tipo: m.tipo,
    cantidad: m.cantidad,
    stock_resultante: m.stock_resultante,
    motivo: m.motivo,
    usuario_id: m.usuario_id,
    referencia_id: m.referencia_id,
    creado_en: m.creado_en.toISOString(),
  }
}

// ---- DTOs de Dashboard (métricas) ----

/**
 * Métrica con su valor en el período actual, el valor del Periodo_Anterior
 * y la variación porcentual entre ambos.
 * `variacionPorcentual` es `null` cuando `anterior === 0` (R2.12).
 */
export type MetricaConVariacion = {
  actual: number // redondeado a 2 decimales
  anterior: number // métrica del Periodo_Anterior
  variacionPorcentual: number | null // null si anterior === 0 (R2.12)
}

export type MetricasDTO = {
  rango: { desde: string; hasta: string }
  periodoAnterior: { desde: string; hasta: string }
  totalSales: MetricaConVariacion
  totalReturns: MetricaConVariacion
  totalExpenses: MetricaConVariacion
  estimatedProfit: MetricaConVariacion
  series: {
    ventas: Array<{ fecha: string; valor: number }> // por día, para sparkline y tendencia
    gastos: Array<{ fecha: string; valor: number }> // comparativa ventas vs gastos
  }
}

// ---- DTOs de Dashboard (rankings) ----

export type RankingItemVenta = {
  producto_id: string
  nombre: string
  unidadesVendidas: number
  montoVendido: number // redondeado
}

export type RankingItemMargen = {
  producto_id: string
  nombre: string
  margen: number // precio_venta - precio_compra, redondeado
}

export type RankingItemRotacion = {
  producto_id: string
  nombre: string
  unidadesSalida: number
}

export type RankingsDTO = {
  rango: { desde: string; hasta: string }
  limite: number
  topSelling: RankingItemVenta[] // desc por unidades, desempate id asc (R3.6)
  topMargin: RankingItemMargen[] // desc por margen, desempate id asc (R3.7)
  topRotation: RankingItemRotacion[] // desc por salida, desempate id asc (R3.8)
  lowRotation: RankingItemRotacion[] // asc por salida (incluye ceros), desempate id asc (R3.9)
}

// ---- DTO de Notificaciones ----

export type NotificacionDTO = {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  producto_id: string | null
  leida: boolean
  creado_en: string // ISO 8601 UTC
}

export function toNotificacionDTO(n: PNotificacion): NotificacionDTO {
  return {
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    producto_id: n.producto_id ?? null,
    leida: n.leida,
    creado_en: n.creado_en.toISOString(),
  }
}
