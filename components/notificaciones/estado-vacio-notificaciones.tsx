"use client"

// Feature: dashboard-metricas-notificaciones
// Estado vacío del panel de notificaciones (R9.11): cuando no existen
// notificaciones se muestra el texto "No tienes notificaciones".
import * as React from "react"
import { BellOff } from "lucide-react"

export function EstadoVacioNotificaciones() {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <BellOff aria-hidden="true" className="size-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">No tienes notificaciones</p>
    </div>
  )
}
