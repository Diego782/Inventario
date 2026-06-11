"use client"

/**
 * components/dashboard/kpi-card.tsx
 * Tarjeta KPI individual del Dashboard.
 *
 * Muestra:
 * - Valor monetario formateado: símbolo $, separador de miles, exactamente 2 decimales (R4.2).
 * - Variación porcentual con signo (+/-), 1 decimal y % (R4.3).
 *   - Positiva/cero → estilo positivo (text-green-600) + icono TrendingUp (R4.4).
 *   - Negativa → estilo negativo (text-destructive) + icono TrendingDown (R4.5).
 *   - null (anterior === 0) → texto "Sin datos previos" sin icono (R4.6).
 * - Sparkline cuando data.length ≥ 2 (R4.7, R4.8).
 * - Estado de error (metrica === null) → estructura con mensaje, sin números (R4.9).
 *
 * Reutiliza el patrón visual de `components/stat-card.tsx`.
 */

import * as React from "react"
import { TrendingUp, TrendingDown, AlertTriangle } from "lucide-react"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Sparkline, type SparklinePunto } from "./sparkline"
import type { MetricaConVariacion } from "@/lib/api/serializadores"

export type KpiCardProps = {
  /** Nombre de la métrica que se muestra en el encabezado. */
  titulo: string
  /**
   * Datos de la métrica. Si es `null` se muestra el estado de error (R4.9).
   */
  metrica: MetricaConVariacion | null
  /**
   * Serie de puntos para el sparkline interno.
   * Si tiene menos de 2 puntos se muestra "Sin datos suficientes" (R4.7, R4.8).
   */
  series: SparklinePunto[]
  className?: string
}

/**
 * Formatea un número como monto en pesos (MXN) con símbolo $,
 * separador de miles y exactamente 2 decimales (R4.2).
 * Rango admitido por la spec: 0.00 – 999,999,999.99.
 */
function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(valor)
}

/**
 * Formatea la variación porcentual con signo explícito y 1 decimal (R4.3).
 * Ejemplos: "+3.5 %" / "-12.0 %".
 */
function formatearVariacion(variacion: number): string {
  const signo = variacion >= 0 ? "+" : ""
  return `${signo}${variacion.toFixed(1)} %`
}

export function KpiCard({ titulo, metrica, series, className }: KpiCardProps) {
  // Estado de error (R4.9): metrica es null
  if (metrica === null) {
    return (
      <Card
        className={cn("flex flex-col gap-4", className)}
        aria-label={`${titulo}: métricas no disponibles`}
      >
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">
            {titulo}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <div className="flex items-center gap-2 text-muted-foreground">
            <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden="true" />
            <span className="text-sm">Métricas no disponibles</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  const { actual, variacionPorcentual } = metrica
  const tieneVariacion = variacionPorcentual !== null

  return (
    <Card
      className={cn("flex flex-col gap-4", className)}
      aria-label={`${titulo}: ${formatearMoneda(actual)}`}
    >
      <CardHeader className="pb-0">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {titulo}
        </CardTitle>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        {/* Valor principal */}
        <p className="text-2xl font-bold text-foreground tabular-nums">
          {formatearMoneda(actual)}
        </p>

        {/* Variación porcentual o "Sin datos previos" */}
        {tieneVariacion ? (
          <div className="flex items-center gap-1">
            {variacionPorcentual >= 0 ? (
              <>
                <TrendingUp
                  className="h-3.5 w-3.5 text-green-600"
                  aria-hidden="true"
                />
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent text-xs font-medium",
                    "text-green-600 bg-green-50 dark:bg-green-950/30"
                  )}
                >
                  {formatearVariacion(variacionPorcentual)}
                </Badge>
              </>
            ) : (
              <>
                <TrendingDown
                  className="h-3.5 w-3.5 text-destructive"
                  aria-hidden="true"
                />
                <Badge
                  variant="outline"
                  className={cn(
                    "border-transparent text-xs font-medium",
                    "text-destructive bg-destructive/10"
                  )}
                >
                  {formatearVariacion(variacionPorcentual)}
                </Badge>
              </>
            )}
          </div>
        ) : (
          /* anterior === 0 → sin datos previos (R4.6) */
          <p className="text-xs text-muted-foreground" aria-label="Sin datos del período anterior">
            Sin datos previos
          </p>
        )}

        {/* Sparkline (R4.7, R4.8) */}
        <Sparkline
          data={series}
          color={variacionPorcentual !== null && variacionPorcentual >= 0
            ? "var(--chart-1)"
            : "var(--chart-2)"}
          className="mt-1"
        />
      </CardContent>
    </Card>
  )
}

export default KpiCard
