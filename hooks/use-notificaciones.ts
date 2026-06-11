"use client"

// Feature: dashboard-metricas-notificaciones
// Hook de cliente del Centro_Notificaciones (R9.4, R9.7, R9.8, R9.9, R9.10, R9.11,
// R11.6, R11.7). Orquesta el estado de React del panel de notificaciones:
//  - `recargar()` consulta `GET /api/notificaciones` con un límite de 10 s; ante
//    fallo o timeout deja `estado = "error"` para que el panel muestre el indicador
//    de error y ofrezca reintentar (R11.6, R11.7).
//  - `marcarLeida(id)` aplica una actualización optimista (marca leída + decrementa
//    el Badge_Conteo) y revierte por completo ante un fallo del PATCH (R9.7, R9.8).
//  - `marcarTodasLeidas()` marca todo como leído de forma optimista (Badge_Conteo a
//    cero) y revierte ante un fallo del POST (R9.9, R9.10).
// El conteo de no leídas se deriva de `items`, de modo que cada cambio optimista
// actualiza el badge automáticamente.
import * as React from "react"
import { toast } from "sonner"

import type { NotificacionDTO } from "@/lib/api/serializadores"

export type EstadoNotificaciones = "inicial" | "cargando" | "listo" | "error"

export type UseNotificaciones = {
  items: NotificacionDTO[]
  /** Cantidad de notificaciones con `leida = false` (deriva de `items`). */
  conteo: number
  estado: EstadoNotificaciones
  /** Recarga la lista vía `GET /api/notificaciones` (R11.6, R11.7). */
  recargar(): Promise<void>
  /** Marca una notificación como leída de forma optimista con rollback (R9.7, R9.8). */
  marcarLeida(id: string): Promise<void>
  /** Marca todas como leídas de forma optimista con rollback (R9.9, R9.10). */
  marcarTodasLeidas(): Promise<void>
}

/** Límite de espera para la recarga de la lista al abrir el panel (R11.7). */
const TIMEOUT_RECARGA_MS = 10_000

/** Mensaje de error cuando falla el marcado individual (R9.8). */
const MENSAJE_ERROR_MARCAR_LEIDA = "No se pudo marcar la notificación como leída."

/** Mensaje de error cuando falla el marcado masivo (R9.10). */
const MENSAJE_ERROR_MARCAR_TODAS =
  "No se pudieron marcar las notificaciones como leídas."

/** Cuenta las notificaciones no leídas de una lista. */
function contarNoLeidas(items: NotificacionDTO[]): number {
  return items.reduce((acc, n) => (n.leida ? acc : acc + 1), 0)
}

/**
 * Gestiona el estado del Centro_Notificaciones: lista, conteo de no leídas,
 * estado de carga y las acciones de marcado optimista.
 */
export function useNotificaciones(): UseNotificaciones {
  const [items, setItems] = React.useState<NotificacionDTO[]>([])
  const [estado, setEstado] = React.useState<EstadoNotificaciones>("inicial")

  // Ref que siempre refleja el valor actual de `items`, para capturar snapshots
  // de rollback sin depender del comportamiento de los updaters en React 19 dev mode.
  const itemsRef = React.useRef<NotificacionDTO[]>(items)
  React.useEffect(() => {
    itemsRef.current = items
  }, [items])

  // El Badge_Conteo deriva siempre de la lista vigente; las actualizaciones
  // optimistas sobre `items` se reflejan automáticamente en el conteo.
  const conteo = React.useMemo(() => contarNoLeidas(items), [items])

  const recargar = React.useCallback(async (): Promise<void> => {
    setEstado("cargando")

    const controlador = new AbortController()
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_RECARGA_MS)

    try {
      const res = await fetch("/api/notificaciones", {
        credentials: "include",
        signal: controlador.signal,
      })
      if (!res.ok) {
        throw new Error("Respuesta no satisfactoria")
      }
      const lista = (await res.json()) as NotificacionDTO[]
      setItems(lista)
      setEstado("listo")
    } catch {
      // Fallo o timeout (R11.7): deja el estado en error para que el panel
      // muestre el indicador y ofrezca reintentar mediante `recargar`.
      setEstado("error")
    } finally {
      clearTimeout(temporizador)
    }
  }, [])

  const marcarLeida = React.useCallback(async (id: string): Promise<void> => {
    // Snapshot del estado actual antes del cambio optimista (ref siempre actualizada).
    const prevItems = itemsRef.current
    const objetivo = prevItems.find((n) => n.id === id)

    // Idempotente: si no existe o ya está leída, no hay cambio optimista.
    if (!objetivo || objetivo.leida) return

    // Aplicar el cambio optimista.
    setItems(prevItems.map((n) => (n.id === id ? { ...n, leida: true } : n)))

    try {
      const res = await fetch(`/api/notificaciones/${id}`, {
        method: "PATCH",
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error("Respuesta no satisfactoria")
      }
    } catch {
      // Rollback completo: restaura el item a no leída y conserva el Badge_Conteo
      // sin cambios, mostrando el error (R9.8).
      setItems(prevItems)
      toast.error(MENSAJE_ERROR_MARCAR_LEIDA)
    }
  }, [])

  const marcarTodasLeidas = React.useCallback(async (): Promise<void> => {
    // Snapshot del estado actual antes del cambio optimista (ref siempre actualizada).
    const prevItems = itemsRef.current

    // Si no hay no leídas, no hay nada que hacer.
    if (!prevItems.some((n) => !n.leida)) return

    // Aplicar el cambio optimista.
    setItems(prevItems.map((n) => (n.leida ? n : { ...n, leida: true })))

    try {
      const res = await fetch("/api/notificaciones/marcar-todas-leidas", {
        method: "POST",
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error("Respuesta no satisfactoria")
      }
    } catch {
      // Rollback completo: restaura el estado no leído y el Badge_Conteo (R9.10).
      setItems(prevItems)
      toast.error(MENSAJE_ERROR_MARCAR_TODAS)
    }
  }, [])

  return { items, conteo, estado, recargar, marcarLeida, marcarTodasLeidas }
}
