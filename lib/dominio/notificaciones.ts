// Capa de dominio de notificaciones (Flujo B del spec dashboard-metricas-notificaciones).
// Detección de stock crítico con deduplicación lógica + creación transaccional, y la
// función pura de ordenamiento/tope del listado. Ver design.md § "Capa de dominio de
// notificaciones y enganche transaccional".
//
// Req 8.1 — notificación stock_cero dentro de la transacción de ajustarStock/registrarVenta.
// Req 8.5 — notificación stock_critico (existente).
// Req 8.7 — generarNotificacionesVencimiento (evaluación perezosa desde el listado).
// Req 8.8, 8.9 — extenderDeuda valida nueva fecha > plazo vigente.
// Req 8.11, 8.12 — clave de deduplicación + dedupe por notificación no leída.
import type { Prisma } from "@prisma/client"
import type { NotificacionDTO } from "@/lib/api/serializadores"
import { prisma } from "@/lib/db"
import { PlazoExtensionInvalidoError } from "@/lib/api/errores"
import { saldoCliente } from "@/lib/dominio/deuda"

export type EstadoStock = "En Stock" | "Bajo Stock" | "Crítico"

// Misma regla que el core (R Estado_Stock): Crítico si stock=0 o stock<=minimo*0.3.
export function estadoStock(stockActual: number, stockMinimo: number): EstadoStock {
  if (stockActual === 0 || stockActual <= stockMinimo * 0.3) return "Crítico"
  if (stockActual <= stockMinimo) return "Bajo Stock"
  return "En Stock"
}

// Formato exacto de la clave de deduplicación de stock crítico (Req 8.11).
export function claveDedupStockCritico(productoId: string): string {
  return `stock_critico:${productoId}`
}

// Formato exacto de la clave de deduplicación de stock cero (Req 8.11).
export function claveDedupStockCero(productoId: string): string {
  return `stock_cero:${productoId}`
}

// Formato exacto de la clave de deduplicación de vencimiento de deuda (Req 8.11).
export function claveDedupVencimientoDeuda(ventaId: string): string {
  return `vencimiento_deuda:${ventaId}`
}

// ---------------------------------------------------------------------------
// Helper interno: crea una notificación deduplicada dentro de una transacción.
//
// Lógica:
//  1. Si ya existe una notificación NO leída con la misma clave → dedupe, no crea.
//  2. Si hay notificaciones YA leídas con la clave → libera su clave (NULL) para
//     que la unicidad de MySQL no bloquee la creación de una nueva (patrón existente).
// ---------------------------------------------------------------------------
async function crearNotificacionDeduplicada(
  tx: Prisma.TransactionClient,
  params: {
    organizacion_id: string
    tipo: string
    titulo: string
    mensaje: string
    clave: string
    producto_id?: string | null
    venta_id?: string | null
  }
): Promise<void> {
  const yaExiste = await tx.notificacion.findFirst({
    where: { clave_deduplicacion: params.clave, leida: false },
    select: { id: true },
  })
  if (yaExiste) return // Req 8.12 — dedupe: no crea duplicado

  // Liberar claves de notificaciones ya leídas para no chocar con la unicidad MySQL.
  await tx.notificacion.updateMany({
    where: { clave_deduplicacion: params.clave },
    data: { clave_deduplicacion: null },
  })

  await tx.notificacion.create({
    data: {
      organizacion_id: params.organizacion_id,
      tipo: params.tipo,
      titulo: params.titulo,
      mensaje: params.mensaje,
      producto_id: params.producto_id ?? null,
      clave_deduplicacion: params.clave,
      leida: false,
    },
  })
}

/**
 * Se invoca DENTRO de una $transaction existente (misma `tx`).
 * Crea la notificación sólo si el producto ACABA de entrar a Crítico (transición
 * no-Crítico ⇒ Crítico, Req 8.5) y no hay ya una notificación no leída con la misma
 * clave (dedupe lógica, Req 8.12). El mensaje incluye nombre, stock actual y mínimo.
 * La unicidad parcial sobre `clave_deduplicacion` actúa como red de seguridad.
 */
export async function detectarStockCritico(
  tx: Prisma.TransactionClient,
  params: { producto_id: string; nombre: string; stock_actual: number; stock_minimo: number; organizacion_id: string },
  estadoPrevio: EstadoStock,
): Promise<void> {
  const estadoNuevo = estadoStock(params.stock_actual, params.stock_minimo)
  // Sólo en la transición a Crítico.
  if (estadoPrevio === "Crítico" || estadoNuevo !== "Crítico") return

  // Si el stock es exactamente 0, la notificación de stock_cero toma precedencia
  // (se genera en detectarStockCero). Aquí solo creamos stock_critico cuando el
  // producto está en Crítico sin ser cero (Req 8.5, 8.6).
  if (params.stock_actual === 0) return

  await crearNotificacionDeduplicada(tx, {
    organizacion_id: params.organizacion_id,
    tipo: "stock_critico",
    titulo: "Stock crítico",
    mensaje:
      `${params.nombre} alcanzó stock crítico. Stock actual: ` +
      `${params.stock_actual}, mínimo: ${params.stock_minimo}.`,
    clave: claveDedupStockCritico(params.producto_id),
    producto_id: params.producto_id,
  })
}

/**
 * Se invoca DENTRO de una $transaction existente (misma `tx`).
 * Crea la notificación `stock_cero` cuando `stock_actual` llega a 0 (Req 8.1).
 * Clave de dedupe: `stock_cero:{producto_id}` (Req 8.11, 8.12).
 * No requiere transición de estado: basta con que el nuevo stock sea 0.
 */
export async function detectarStockCero(
  tx: Prisma.TransactionClient,
  params: { producto_id: string; nombre: string; stock_actual: number; organizacion_id: string },
): Promise<void> {
  if (params.stock_actual !== 0) return

  await crearNotificacionDeduplicada(tx, {
    organizacion_id: params.organizacion_id,
    tipo: "stock_cero",
    titulo: "Sin stock",
    mensaje: `${params.nombre} se quedó sin stock.`,
    clave: claveDedupStockCero(params.producto_id),
    producto_id: params.producto_id,
  })
}

/**
 * Genera notificaciones de vencimiento de deuda de forma perezosa.
 *
 * Para cada Venta fiada cuyo `plazo_deuda <= now` y cuyo cliente tiene saldo > 0,
 * crea una notificación `vencimiento_deuda` con clave `vencimiento_deuda:{venta_id}`
 * si no existe ya una no leída con esa clave (Req 8.7, 8.11, 8.12).
 *
 * Se invoca desde el endpoint de listado de notificaciones (evaluación perezosa)
 * para no requerir un cron (Req 8.7).
 *
 * Aislamiento: solo evalúa ventas fiadas de la organización dada (Req 8.10).
 */
export async function generarNotificacionesVencimiento(
  organizacion_id: string
): Promise<void> {
  const ahora = new Date()

  // Ventas fiadas con plazo vencido, del tenant actual.
  const ventasVencidas = await prisma.venta.findMany({
    where: {
      organizacion_id,
      metodo_pago: "fiado",
      plazo_deuda: { lte: ahora },
      cliente_id: { not: null },
    },
    select: { id: true, cliente_id: true },
  })

  for (const venta of ventasVencidas) {
    if (!venta.cliente_id) continue

    // Verificar que el cliente todavía tiene saldo pendiente (Req 8.7).
    const saldo = await saldoCliente(venta.cliente_id, organizacion_id)
    if (saldo <= 0) continue

    // Crear notificación si no existe una no leída con la misma clave (Req 8.12).
    const clave = claveDedupVencimientoDeuda(venta.id)
    const yaExiste = await prisma.notificacion.findFirst({
      where: { clave_deduplicacion: clave, leida: false },
      select: { id: true },
    })
    if (yaExiste) continue

    // Liberar claves de notificaciones ya leídas.
    await prisma.notificacion.updateMany({
      where: { clave_deduplicacion: clave },
      data: { clave_deduplicacion: null },
    })

    await prisma.notificacion.create({
      data: {
        organizacion_id,
        tipo: "vencimiento_deuda",
        titulo: "Deuda vencida",
        mensaje: `Una deuda fiada ha vencido y tiene saldo pendiente.`,
        clave_deduplicacion: clave,
        leida: false,
      },
    })
  }
}

/**
 * Extiende el plazo de la deuda asociada a una venta fiada (Req 8.8, 8.9).
 *
 * Valida que `nuevaFecha` sea estrictamente posterior al `plazo_deuda` vigente
 * de la venta. Si no lo es, lanza `PlazoExtensionInvalidoError` (422, Req 8.9).
 *
 * Actualiza `plazo_deuda` en la `Venta` y en el `MovimientoDeuda` de cargo
 * asociado a esa venta (si existe), de forma atómica.
 *
 * Aislamiento: solo opera sobre ventas de la organización dada (Req 8.10).
 */
export async function extenderDeuda(
  venta_id: string,
  nuevaFecha: Date,
  organizacion_id: string
): Promise<void> {
  const venta = await prisma.venta.findFirst({
    where: { id: venta_id, organizacion_id, metodo_pago: "fiado" },
    select: { id: true, plazo_deuda: true },
  })

  if (!venta) {
    // La venta no existe o no pertenece al tenant — se trata como no encontrada.
    throw new PlazoExtensionInvalidoError()
  }

  // Req 8.9 — la nueva fecha debe ser estrictamente posterior al plazo vigente.
  if (!venta.plazo_deuda || nuevaFecha <= venta.plazo_deuda) {
    throw new PlazoExtensionInvalidoError()
  }

  await prisma.$transaction(async (tx) => {
    // Actualizar el plazo en la venta.
    await tx.venta.update({
      where: { id: venta_id },
      data: { plazo_deuda: nuevaFecha },
    })

    // Actualizar también el plazo en el MovimientoDeuda de cargo vinculado,
    // si existe (para mantener la trazabilidad del plazo original).
    await tx.movimientoDeuda.updateMany({
      where: { venta_id, organizacion_id, tipo: "cargo" },
      data: { plazo_deuda: nuevaFecha },
    })
  })
}

/**
 * Función pura: ordena el listado descendente por `creado_en`, desempata descendente
 * por `id` y trunca a un máximo de 100 elementos (R8.1). No muta la entrada.
 */
export function ordenarNotificaciones(items: NotificacionDTO[]): NotificacionDTO[] {
  return [...items]
    .sort((a, b) => {
      if (a.creado_en !== b.creado_en) {
        return a.creado_en < b.creado_en ? 1 : -1
      }
      if (a.id !== b.id) return a.id < b.id ? 1 : -1
      return 0
    })
    .slice(0, 100)
}
