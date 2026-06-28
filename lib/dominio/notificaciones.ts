// Capa de dominio de notificaciones (Flujo B del spec dashboard-metricas-notificaciones).
// Detección de stock crítico con deduplicación lógica + creación transaccional, y la
// función pura de ordenamiento/tope del listado. Ver design.md § "Capa de dominio de
// notificaciones y enganche transaccional".
import type { Prisma } from "@prisma/client"
import type { NotificacionDTO } from "@/lib/api/serializadores"

export type EstadoStock = "En Stock" | "Bajo Stock" | "Crítico"

// Misma regla que el core (R Estado_Stock): Crítico si stock=0 o stock<=minimo*0.3.
export function estadoStock(stockActual: number, stockMinimo: number): EstadoStock {
  if (stockActual === 0 || stockActual <= stockMinimo * 0.3) return "Crítico"
  if (stockActual <= stockMinimo) return "Bajo Stock"
  return "En Stock"
}

// Formato exacto de la clave de deduplicación de stock crítico (R7.3).
export function claveDedupStockCritico(productoId: string): string {
  return `stock_critico:${productoId}`
}

/**
 * Se invoca DENTRO de una $transaction existente (misma `tx`).
 * Crea la notificación sólo si el producto ACABA de entrar a Crítico (transición
 * no-Crítico ⇒ Crítico, R7.1) y no hay ya una notificación no leída con la misma
 * clave (dedupe lógica, R7.4/R7.5). El mensaje incluye nombre, stock actual y mínimo
 * (R7.2). La unicidad parcial sobre `clave_deduplicacion` actúa como red de seguridad.
 */
export async function detectarStockCritico(
  tx: Prisma.TransactionClient,
  params: { producto_id: string; nombre: string; stock_actual: number; stock_minimo: number; organizacion_id: string },
  estadoPrevio: EstadoStock,
): Promise<void> {
  const estadoNuevo = estadoStock(params.stock_actual, params.stock_minimo)
  // Sólo en la transición a Crítico (R7.1).
  if (estadoPrevio === "Crítico" || estadoNuevo !== "Crítico") return

  const clave = claveDedupStockCritico(params.producto_id)
  const yaExiste = await tx.notificacion.findFirst({
    where: { clave_deduplicacion: clave, leida: false },
    select: { id: true },
  })
  if (yaExiste) return // dedupe: no incrementa conteo (R7.4)

  // No hay ninguna notificación NO leída con esta clave. Si quedaran notificaciones
  // YA leídas con la misma clave (porque salió de Crítico y la anterior se marcó como
  // leída), liberamos su `clave_deduplicacion` (NULL) para poder volver a crear una
  // nueva notificación no leída sin chocar con la unicidad global de MySQL (R6.5 sólo
  // aplica a valores no nulos). Esto cumple R7.5 conservando la notificación histórica.
  await tx.notificacion.updateMany({
    where: { clave_deduplicacion: clave },
    data: { clave_deduplicacion: null },
  })

  await tx.notificacion.create({
    data: {
      organizacion_id: params.organizacion_id,
      tipo: "stock_critico",
      titulo: "Stock crítico",
      mensaje:
        `${params.nombre} alcanzó stock crítico. Stock actual: ` +
        `${params.stock_actual}, mínimo: ${params.stock_minimo}.`, // R7.2
      producto_id: params.producto_id,
      clave_deduplicacion: clave, // R7.3
      leida: false,
    },
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
