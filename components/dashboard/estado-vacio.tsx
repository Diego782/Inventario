'use client'

import { Inbox } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface EstadoVacioProps {
  /** Texto a mostrar. Por defecto el requerido por R5.13. */
  mensaje?: string
}

/**
 * Estado vacío del Dashboard: se muestra cuando el Rango_Fechas no contiene
 * datos.
 *
 * Requisitos: R5.13 (texto "No hay datos para el período seleccionado").
 */
export function EstadoVacio({ mensaje }: EstadoVacioProps) {
  return (
    <Card data-slot="dashboard-estado-vacio">
      <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
        <Inbox className="size-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-sm text-muted-foreground">
          {mensaje ?? 'No hay datos para el período seleccionado'}
        </p>
      </CardContent>
    </Card>
  )
}

export default EstadoVacio
