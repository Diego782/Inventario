'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

/**
 * Estado de carga tipo esqueleto del Dashboard: reemplaza las tarjetas KPI y
 * las gráficas mientras los datos se están cargando.
 *
 * Requisitos: R5.10 (estado de carga tipo esqueleto), R1.4 (carga inicial).
 */
export function DashboardSkeleton() {
  return (
    <div
      className="flex flex-col gap-6"
      role="status"
      aria-busy="true"
      aria-live="polite"
      aria-label="Cargando datos del dashboard"
      data-slot="dashboard-skeleton"
    >
      <span className="sr-only">Cargando datos del dashboard…</span>

      {/* Esqueleto de las cuatro tarjetas KPI */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} aria-hidden="true">
            <CardHeader>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-10 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Esqueleto de las gráficas principales */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i} aria-hidden="true">
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-64 w-full" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}

export default DashboardSkeleton
