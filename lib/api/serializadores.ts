/**
 * lib/api/serializadores.ts
 * Convierte entidades de Prisma a DTOs seguros para la API.
 * - Convierte Decimal → number (redondeado a 2 decimales)
 * - Convierte DateTime → string ISO 8601
 * - Calcula estado_stock según R7
 */
import type {
  Producto as PProducto,
  Venta as PVenta,
  VentaItem as PVentaItem,
  MovimientoStock as PMovimiento,
  VarianteProducto as PVariante,
  Notificacion as PNotificacion,
  Cliente as PCliente,
  MovimientoDeuda as PMovimientoDeuda,
} from "@prisma/client"
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
  variante_id: string | null
  variante_talla: string | null
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
  /** ID del cliente asociado; null para ventas sin cliente (retrocompatible). */
  cliente_id: string | null
  /** Plazo de deuda en ISO 8601; null si la venta no es fiada o no tiene plazo. */
  plazo_deuda: string | null
  /** Descuento total aplicado sobre el monto completo de la venta. */
  descuento_total: number
  usuario_id: string | null
  estado: string
  creado_en: string
  items?: VentaItemDTO[]
}

// ---- DTOs de Clientes y Deuda ----

/**
 * DTO de un Cliente (Req 4).
 * Todos los Decimal se presentan como number con redondeo bancario.
 */
export type ClienteDTO = {
  id: string
  organizacion_id: string
  cedula: string
  nombre: string
  telefono: string
  correo: string | null
  direccion: string | null
  creado_en: string
  actualizado_en: string
}

/**
 * DTO de un MovimientoDeuda (Req 5).
 * El campo `saldoResultante` es opcional porque se calcula en `historialDeuda`
 * y no existe en el modelo Prisma directamente.
 */
export type MovimientoDeudaDTO = {
  id: string
  organizacion_id: string
  cliente_id: string
  tipo: string
  monto: number
  venta_id: string | null
  plazo_deuda: string | null
  fecha: string
  creado_en: string
  /** Saldo corrido hasta este movimiento, inclusive (Req 5.2). Null si no se proporcionó. */
  saldo_resultante: number | null
}

/**
 * DTO de un Fiador: cliente con saldo de deuda pendiente > 0 (Req 5.1, 5.4).
 */
export type FiadorDTO = {
  cliente: ClienteDTO
  saldo: number
}

/**
 * DTO del valor de inventario (Req 2.1, 2.8, 2.9).
 */
export type ValorInventarioDTO = {
  /** Suma de precio_compra × stock_actual sobre productos activos del tenant. */
  inversion: number
  /** Suma de precio_venta × stock_actual sobre productos activos del tenant. */
  recaudacion_potencial: number
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

export function toVentaItemDTO(item: PVentaItem & { producto?: PProducto | null; variante?: PVariante | null }): VentaItemDTO {
  return {
    id: item.id,
    venta_id: item.venta_id,
    producto_id: item.producto_id,
    producto_nombre: item.producto?.nombre ?? null,
    variante_id: item.variante_id ?? null,
    variante_talla: item.variante?.talla ?? null,
    cantidad: item.cantidad,
    precio_unitario: redondearBancario(Number(item.precio_unitario)),
    subtotal_linea: redondearBancario(Number(item.subtotal_linea)),
  }
}

export function toVentaDTO(v: PVenta & { items?: (PVentaItem & { producto?: PProducto | null; variante?: PVariante | null })[] }): VentaDTO {
  return {
    id: v.id,
    folio: v.folio,
    subtotal: redondearBancario(Number(v.subtotal)),
    impuesto: redondearBancario(Number(v.impuesto)),
    total: redondearBancario(Number(v.total)),
    metodo_pago: v.metodo_pago,
    fiador_id: v.fiador_id,
    cliente_id: v.cliente_id ?? null,
    plazo_deuda: v.plazo_deuda ? v.plazo_deuda.toISOString() : null,
    descuento_total: 0, // legacy ventas no tienen este campo; campo calculado por calcularTotalesVenta
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

// ---- Serializadores de Clientes y Deuda ----

/**
 * Serializa un Cliente de Prisma al DTO de la API.
 */
export function toClienteDTO(c: PCliente): ClienteDTO {
  return {
    id: c.id,
    organizacion_id: c.organizacion_id,
    cedula: c.cedula,
    nombre: c.nombre,
    telefono: c.telefono,
    correo: c.correo ?? null,
    direccion: c.direccion ?? null,
    creado_en: c.creado_en.toISOString(),
    actualizado_en: c.actualizado_en.toISOString(),
  }
}

/**
 * Serializa un MovimientoDeuda de Prisma al DTO de la API.
 * El campo `saldoResultante` se pasa opcionalmente desde `historialDeuda`.
 */
export function toMovimientoDeudaDTO(
  m: PMovimientoDeuda & { saldoResultante?: number }
): MovimientoDeudaDTO {
  return {
    id: m.id,
    organizacion_id: m.organizacion_id,
    cliente_id: m.cliente_id,
    tipo: m.tipo,
    monto: redondearBancario(Number(m.monto)),
    venta_id: m.venta_id ?? null,
    plazo_deuda: m.plazo_deuda ? m.plazo_deuda.toISOString() : null,
    fecha: m.fecha.toISOString(),
    creado_en: m.creado_en.toISOString(),
    saldo_resultante:
      m.saldoResultante !== undefined
        ? redondearBancario(m.saldoResultante)
        : null,
  }
}

/**
 * Serializa un par { cliente, saldo } al DTO de Fiador.
 * El saldo ya viene calculado como number desde la capa de dominio,
 * pero se aplica redondeo bancario para garantizar presentación correcta.
 */
export function toFiadorDTO({
  cliente,
  saldo,
}: {
  cliente: PCliente
  saldo: number
}): FiadorDTO {
  return {
    cliente: toClienteDTO(cliente),
    saldo: redondearBancario(saldo),
  }
}

/**
 * Serializa los resultados de `calcularValorInventario` al DTO de la API.
 * Los valores de inversión y recaudación potencial ya vienen redondeados
 * desde el dominio, pero se aplica redondeo bancario de nuevo para
 * garantizar presentación correcta ante cualquier ruta de llamada.
 */
export function toValorInventarioDTO({
  inversion,
  recaudacionPotencial,
}: {
  inversion: number
  recaudacionPotencial: number
}): ValorInventarioDTO {
  return {
    inversion: redondearBancario(inversion),
    recaudacion_potencial: redondearBancario(recaudacionPotencial),
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
  /** Total de dinero en deuda: suma de saldos pendientes de todos los clientes del tenant (Req 9.4–9.6). */
  totalDeuda: number
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

/**
 * Acciones rápidas disponibles en una notificación (Req 8.2–8.7).
 * El dominio no ejecuta la acción; solo expone el conjunto para que la UI
 * renderice los botones correspondientes.
 */
export type AccionRapida = "Ajustar stock" | "Eliminar producto" | "Extender deuda"

/**
 * Mapa canónico de tipo de notificación → conjunto de acciones rápidas (Property 19).
 * - stock_cero:        {"Ajustar stock", "Eliminar producto"}  (Req 8.2)
 * - stock_critico:     {"Ajustar stock"}                       (Req 8.5, 8.6)
 * - vencimiento_deuda: {"Extender deuda"}                      (Req 8.7)
 * - Cualquier otro tipo: sin acciones (array vacío).
 */
const ACCIONES_POR_TIPO: Record<string, AccionRapida[]> = {
  stock_cero: ["Ajustar stock", "Eliminar producto"],
  stock_critico: ["Ajustar stock"],
  vencimiento_deuda: ["Extender deuda"],
}

/**
 * Devuelve el conjunto de AccionRapida para un tipo de notificación dado.
 * Función pura y determinista — no ejecuta ninguna acción de dominio.
 * Usa hasOwnProperty para evitar que propiedades heredadas de Object.prototype
 * (como 'valueOf', 'toString') sean interpretadas como tipos válidos.
 */
export function accionesPorTipo(tipo: string): AccionRapida[] {
  if (Object.prototype.hasOwnProperty.call(ACCIONES_POR_TIPO, tipo)) {
    return ACCIONES_POR_TIPO[tipo]
  }
  return []
}

export type NotificacionDTO = {
  id: string
  tipo: string
  titulo: string
  mensaje: string
  /** ID del producto asociado; presente en notificaciones de stock. */
  producto_id: string | null
  /**
   * ID de la venta fiada asociada; presente en notificaciones `vencimiento_deuda`.
   * Null para tipos que no tienen venta asociada.
   */
  venta_id: string | null
  leida: boolean
  creado_en: string // ISO 8601 UTC
  /**
   * Acciones rápidas determinadas por el tipo (Req 8.2–8.7).
   * La UI usa esta lista para renderizar los botones; el dominio no ejecuta ninguna.
   */
  acciones_rapidas: AccionRapida[]
}

/**
 * Serializa una entidad Notificacion de Prisma al DTO de la API.
 *
 * Acepta un campo opcional `venta_id` además de los campos del modelo Prisma
 * (el modelo se extenderá en tarea 10.1 con esa columna; hasta entonces es null).
 */
export function toNotificacionDTO(
  n: PNotificacion & { venta_id?: string | null }
): NotificacionDTO {
  return {
    id: n.id,
    tipo: n.tipo,
    titulo: n.titulo,
    mensaje: n.mensaje,
    producto_id: n.producto_id ?? null,
    venta_id: n.venta_id ?? null,
    leida: n.leida,
    creado_en: n.creado_en.toISOString(),
    acciones_rapidas: accionesPorTipo(n.tipo),
  }
}
