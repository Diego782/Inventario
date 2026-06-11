"use client"

/**
 * components/dashboard/kpi-grid.tsx
 * Contenedor de las 4 tarjetas KPI del Dashboard en orden fijo (R4.1):
 *   1. Ventas Totales
 *   2. Devoluciones
 *   3. Gastos
 *   4. Ganancia Estimada
 *
 * Props:
 *   - `metricas: MetricasDTO`  — resultado del endpoint /api/dashboard/metricas.
 *   - `series: MetricasDTO["series"]` — series de tendencia por métrica.
 *
 * Si `metricas` es `null` todas las tarjetas muestran el estado de error (R4.9).
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import { KpiCard } from "./kpi-card"
import type { MetricasDTO, MetricaConVariacion } from "@/lib/api/serializadores"

export type KpiGridProps = {
  /**
   * DTO completo de métricas. Si es `null` se muestra el estado de error
   * en todas las tarjetas (R4.9).
   */
  metricas: MetricasDTO | null
  /**
   * Series de tendencia para los sparklines (puede pasarse separadamente
   * para control fino, o se lee de `metricas.series` cuando `metricas` no
   * es null).
   */
  series?: MetricasDTO["series"] | null
  className?: string
}

type DefinicionKpi = {
  titulo: string
  obtenerMetrica: (m: MetricasDTO) => MetricaConVariacion
  obtenerSerie: (s: MetricasDTO["series"]) => Array<{ fecha: string; valor: number }>
}

/** Orden canónico de las 4 tarjetas KPI según R4.1. */
const KPIS: DefinicionKpi[] = [
  {
    titulo: "Ventas Totales",
    obtenerMetrica: (m) => m.totalSales,
    obtenerSerie: (s) => s.ventas,
  },
  {
    titulo: "Devoluciones",
    obtenerMetrica: (m) => m.totalReturns,
    // Las devoluciones comparten la serie de ventas (refleja movimientos del mismo período)
    obtenerSerie: (s) => s.ventas,
  },
  {
    titulo: "Gastos",
    obtenerMetrica: (m) => m.totalExpenses,
    obtenerSerie: (s) => s.gastos,
  },
  {
    titulo: "Ganancia Estimada",
    obtenerMetrica: (m) => m.estimatedProfit,
    obtenerSerie: (s) => s.ventas,
  },
]

export function KpiGrid({ metricas, series, className }: KpiGridProps) {
  const seriesActivas = series ?? metricas?.series ?? null

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4",
        className
      )}
      role="region"
      aria-label="Indicadores clave de desempeño"
    >
      {KPIS.map((kpi) => (
        <KpiCard
          key={kpi.titulo}
          titulo={kpi.titulo}
          metrica={metricas ? kpi.obtenerMetrica(metricas) : null}
          series={seriesActivas ? kpi.obtenerSerie(seriesActivas) : []}
        />
      ))}
    </div>
  )
}

export default KpiGrid
