"use client"

// Feature: dashboard-metricas-notificaciones
// Item individual del Centro_Notificaciones (R9.5, R9.6, R9.7, R9.8).
//  - Muestra título, mensaje y el tiempo relativo en español derivado de
//    `creado_en` mediante `tiempoRelativoEs` (R9.5).
//  - Renderiza un indicador visual persistente y observable presente únicamente
//    en las notificaciones no leídas (R9.6).
//  - Al hacer clic sobre una notificación no leída invoca `onMarcarLeida(id)`,
//    que el contenedor enlaza al marcado optimista de `useNotificaciones` (R9.7).
//    Una notificación ya leída no es accionable.
import * as React from "react"

import type { NotificacionDTO } from "@/lib/api/serializadores"
import { tiempoRelativoEs } from "@/lib/notificaciones/tiempo"
import { cn } from "@/lib/utils"

export type NotificacionItemProps = {
  notificacion: NotificacionDTO
  /** Marca la notificación como leída (enlazado a `useNotificaciones.marcarLeida`). */
  onMarcarLeida(id: string): void
}

export function NotificacionItem({
  notificacion,
  onMarcarLeida,
}: NotificacionItemProps) {
  const { id, titulo, mensaje, leida, creado_en } = notificacion

  // El tiempo relativo se recalcula en cada render contra el reloj actual; la
  // función es pura y no muta sus argumentos.
  const tiempo = React.useMemo(
    () => tiempoRelativoEs(new Date(creado_en), new Date()),
    [creado_en],
  )

  const manejarClic = React.useCallback(() => {
    // Sólo las no leídas son accionables (R9.7); las leídas no disparan nada.
    if (!leida) {
      onMarcarLeida(id)
    }
  }, [leida, onMarcarLeida, id])

  return (
    <button
      type="button"
      onClick={manejarClic}
      aria-disabled={leida}
      aria-label={
        leida
          ? `Notificación leída: ${titulo}`
          : `Notificación sin leer: ${titulo}. Marcar como leída`
      }
      className={cn(
        "flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left transition-colors",
        leida
          ? "cursor-default opacity-70"
          : "cursor-pointer bg-accent/40 hover:bg-accent focus-visible:bg-accent",
        "focus-visible:ring-ring/50 outline-none focus-visible:ring-[3px]",
      )}
    >
      {/* Indicador visual persistente presente sólo en no leídas (R9.6). */}
      <span
        aria-hidden="true"
        className={cn(
          "mt-1.5 size-2 shrink-0 rounded-full",
          leida ? "bg-transparent" : "bg-primary",
        )}
      />

      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span
          className={cn(
            "truncate text-sm",
            leida ? "font-normal text-foreground" : "font-semibold text-foreground",
          )}
        >
          {titulo}
        </span>
        <span className="text-sm text-muted-foreground">{mensaje}</span>
        <span className="text-xs text-muted-foreground">{tiempo}</span>
      </span>
    </button>
  )
}
