"use client"

// Feature: dashboard-metricas-notificaciones
// Panel del Centro_Notificaciones (R9.4, R9.9, R9.10, R11.6, R11.7, R12.2).
//  - Contenedor Popover que recarga la lista al abrirse invocando
//    `useNotificaciones.recargar` (R11.6).
//  - La cabecera incluye el botón "Marcar todas como leídas" que llama a
//    `useNotificaciones.marcarTodasLeidas` (R9.9, R9.10).
//  - Si la recarga falla, muestra un indicador de error con botón de reintento
//    que vuelve a llamar a `recargar` (R11.7).
//  - Sólo utiliza primitivas shadcn/ui de @/components/ui (R12.2).
import * as React from "react"
import { AlertCircle, RefreshCw } from "lucide-react"

import type { UseNotificaciones } from "@/hooks/use-notificaciones"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"

import { ListaNotificaciones } from "./lista-notificaciones"

export type PanelNotificacionesProps = {
  /** Estado completo del centro de notificaciones (de `useNotificaciones`). */
  notificaciones: UseNotificaciones
  /** Controla si el panel está abierto (manejado externamente, p. ej. desde la campana). */
  abierto: boolean
}

/**
 * Panel de notificaciones: encabezado con "Marcar todas como leídas",
 * lista de notificaciones y manejo de estado de error con reintento.
 *
 * Este componente no incluye el Popover completo (trigger + content) ya que
 * ese nivel lo gestiona `CampanaNotificaciones`. Recibe las props de estado
 * y expone el contenido interior del panel para ser montado dentro del
 * `PopoverContent`.
 */
export function PanelNotificaciones({
  notificaciones,
  abierto,
}: PanelNotificacionesProps) {
  const { items, estado, recargar, marcarTodasLeidas } = notificaciones

  // Recarga la lista cada vez que el panel se abre (R11.6).
  const abiertoPrevRef = React.useRef(false)
  React.useEffect(() => {
    if (abierto && !abiertoPrevRef.current) {
      recargar()
    }
    abiertoPrevRef.current = abierto
  }, [abierto, recargar])

  // Indica si hay alguna notificación no leída para habilitar el botón.
  const hayNoLeidas = items.some((n) => !n.leida)

  return (
    <div className="flex flex-col">
      {/* Cabecera del panel */}
      <div className="flex items-center justify-between px-4 py-3">
        <h2 className="text-sm font-semibold">Notificaciones</h2>
        <Button
          variant="ghost"
          size="sm"
          disabled={!hayNoLeidas || estado === "cargando"}
          onClick={() => marcarTodasLeidas()}
          aria-label="Marcar todas las notificaciones como leídas"
          className="h-auto py-1 text-xs"
        >
          Marcar todas como leídas
        </Button>
      </div>

      <Separator />

      {/* Estado de error con reintento (R11.7) */}
      {estado === "error" ? (
        <div
          role="alert"
          className="flex flex-col items-center gap-3 px-4 py-8 text-center"
        >
          <AlertCircle
            aria-hidden="true"
            className="size-8 text-destructive"
          />
          <p className="text-sm text-muted-foreground">
            No se pudieron cargar las notificaciones.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => recargar()}
            className="gap-1.5"
          >
            <RefreshCw aria-hidden="true" className="size-3.5" />
            Reintentar
          </Button>
        </div>
      ) : (
        /* Lista de notificaciones (incluye estado vacío y estado de carga) */
        <ListaNotificaciones
          items={items}
          onMarcarLeida={notificaciones.marcarLeida}
        />
      )}
    </div>
  )
}
