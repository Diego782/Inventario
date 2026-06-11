"use client"

/**
 * components/organizaciones/organizacion-gate.tsx
 *
 * Compuerta de organización activa.
 * Usa `useOrganizacionActiva()` para determinar el estado:
 *   - Mientras carga: muestra un skeleton/spinner.
 *   - Sin org activa: monta <SeleccionOrganizacion />.
 *   - Con org activa: renderiza children.
 *
 * Validates: Requirements R7.5
 */

import * as React from "react"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { Skeleton } from "@/components/ui/skeleton"
import { SeleccionOrganizacion } from "@/components/organizaciones/seleccion-organizacion"

interface OrganizacionGateProps {
  children: React.ReactNode
}

export function OrganizacionGate({ children }: OrganizacionGateProps) {
  const { organizacion, cargando } = useOrganizacionActiva()

  if (cargando) {
    return (
      <div className="flex min-h-screen items-center justify-center p-8">
        <div className="w-full max-w-md space-y-4">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    )
  }

  if (!organizacion) {
    return <SeleccionOrganizacion />
  }

  return <>{children}</>
}
