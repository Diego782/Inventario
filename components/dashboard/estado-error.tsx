'use client'

import { AlertCircle, RotateCw } from 'lucide-react'

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'

interface EstadoErrorProps {
  /** Callback invocado al pulsar el botón de reintento. */
  onReintentar: () => void
  /** Mensaje de error en español. Si se omite, se usa el texto por defecto. */
  mensaje?: string
}

/**
 * Estado de error del Dashboard: muestra un mensaje en español y un control
 * para reintentar la carga, conservando la estructura sin mostrar datos
 * parciales.
 *
 * Requisitos: R5.11 (carga fallida), R5.12 (mensaje + reintento sin datos
 * parciales), R4.9 (no mostrar valores numéricos al fallar).
 */
export function EstadoError({ onReintentar, mensaje }: EstadoErrorProps) {
  return (
    <div className="flex flex-col gap-4" data-slot="dashboard-estado-error">
      <Alert variant="destructive">
        <AlertCircle />
        <AlertTitle>No se pudieron cargar los datos del dashboard</AlertTitle>
        <AlertDescription>
          {mensaje ??
            'Ocurrió un error al cargar los datos del dashboard. Inténtalo de nuevo.'}
        </AlertDescription>
      </Alert>

      <div>
        <Button variant="outline" onClick={onReintentar}>
          <RotateCw />
          Reintentar
        </Button>
      </div>
    </div>
  )
}

export default EstadoError
