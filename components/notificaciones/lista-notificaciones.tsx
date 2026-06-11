"use client"

// Feature: dashboard-metricas-notificaciones
// Lista del Centro_Notificaciones (R9.4, R9.11). Renderiza las notificaciones
// ordenadas de forma descendente por `creado_en` (de la más reciente a la más
// antigua) dentro de un `ScrollArea`, o el estado vacío cuando no hay items.
// El backend ya devuelve el listado ordenado; aquí se ordena de forma defensiva
// (desc por `creado_en`, desempate desc por `id`) para no depender del orden de
// entrada.
import * as React from "react"

import type { NotificacionDTO } from "@/lib/api/serializadores"
import { ScrollArea } from "@/components/ui/scroll-area"

import { NotificacionItem } from "./notificacion-item"
import { EstadoVacioNotificaciones } from "./estado-vacio-notificaciones"

export type ListaNotificacionesProps = {
  items: NotificacionDTO[]
  /** Marca una notificación como leída (enlazado a `useNotificaciones.marcarLeida`). */
  onMarcarLeida(id: string): void
}

/** Ordena desc por `creado_en` y desempata desc por `id` sin mutar la entrada. */
function ordenarDesc(items: NotificacionDTO[]): NotificacionDTO[] {
  return [...items].sort((a, b) => {
    if (a.creado_en !== b.creado_en) {
      return a.creado_en < b.creado_en ? 1 : -1
    }
    if (a.id === b.id) return 0
    return a.id < b.id ? 1 : -1
  })
}

export function ListaNotificaciones({
  items,
  onMarcarLeida,
}: ListaNotificacionesProps) {
  const ordenadas = React.useMemo(() => ordenarDesc(items), [items])

  if (ordenadas.length === 0) {
    return <EstadoVacioNotificaciones />
  }

  return (
    <ScrollArea className="h-80">
      <ul className="flex flex-col gap-1 p-1">
        {ordenadas.map((notificacion) => (
          <li key={notificacion.id}>
            <NotificacionItem
              notificacion={notificacion}
              onMarcarLeida={onMarcarLeida}
            />
          </li>
        ))}
      </ul>
    </ScrollArea>
  )
}
