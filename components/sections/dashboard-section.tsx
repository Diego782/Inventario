"use client"

// Punto de montaje del Dashboard_Analitico (R12.6).
// Elimina los datos mock y conecta los componentes reales del dashboard con
// useRangoFechas + useDashboardData. Renderiza skeleton/error/vacío/datos
// según el estado de carga.

import { useRangoFechas } from "@/hooks/use-rango-fechas"
import { useDashboardData } from "@/hooks/use-dashboard-data"

import { RangoFechasSelector } from "@/components/dashboard/rango-fechas-selector"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { EstadoError } from "@/components/dashboard/estado-error"
import { EstadoVacio } from "@/components/dashboard/estado-vacio"
import { KpiGrid } from "@/components/dashboard/kpi-grid"
import { GraficaTendencia } from "@/components/dashboard/grafica-tendencia"
import { GraficaVentasGastos } from "@/components/dashboard/grafica-ventas-gastos"
import { GraficaTopSelling } from "@/components/dashboard/grafica-top-selling"
import { VisualTopMargin } from "@/components/dashboard/visual-top-margin"
import { ListaRotacion } from "@/components/dashboard/lista-rotacion"

export function DashboardSection() {
  const rangoFechas = useRangoFechas()
  const { estado, metricas, rankings, reintentar } = useDashboardData(rangoFechas.rango)

  return (
    <div className="space-y-6">
      {/* Selector de rango de fechas (R1.1–R1.10) */}
      <RangoFechasSelector control={rangoFechas} />

      {/* Estado: cargando → skeleton (R5.10, R1.4) */}
      {(estado === "inicial" || estado === "cargando") && <DashboardSkeleton />}

      {/* Estado: error → mensaje + reintento (R5.11, R5.12) */}
      {estado === "error" && <EstadoError onReintentar={reintentar} />}

      {/* Estado: vacío → texto informativo (R5.13) */}
      {estado === "vacio" && <EstadoVacio />}

      {/* Estado: listo → dashboard completo */}
      {estado === "listo" && metricas && rankings && (
        <>
          {/* Cuatro tarjetas KPI con variación y sparkline (R4.1–R4.9) */}
          <KpiGrid metricas={metricas} />

          {/* Gráficas de tendencia y comparativa (R5.1, R5.2) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GraficaTendencia ventas={metricas.series.ventas} />
            <GraficaVentasGastos series={metricas.series} />
          </div>

          {/* Rankings: más vendidos y mayor margen (R5.4, R5.5) */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <GraficaTopSelling topSelling={rankings.topSelling} />
            <VisualTopMargin topMargin={rankings.topMargin} />
          </div>

          {/* Rankings de rotación: mayor y menor (R5.6, R5.7) */}
          <ListaRotacion
            topRotation={rankings.topRotation}
            lowRotation={rankings.lowRotation}
          />
        </>
      )}
    </div>
  )
}
