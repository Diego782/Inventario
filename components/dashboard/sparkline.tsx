"use client"

/**
 * components/dashboard/sparkline.tsx
 * Mini gráfica de línea (sparkline) para mostrar la Serie_Tendencia de una métrica
 * dentro de una tarjeta KPI.
 *
 * - Muestra "Sin datos suficientes" cuando hay menos de 2 puntos (R4.7, R4.8).
 * - Altura reducida (~48 px) para caber dentro de la tarjeta KPI.
 * - Color configurable vía prop `color` (CSS var o valor de `useTema`).
 */

import * as React from "react"
import { Line, LineChart, ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

export type SparklinePunto = {
  fecha: string
  valor: number
}

export type SparklineProps = {
  /** Serie de puntos `{ fecha, valor }` del período activo. */
  data: SparklinePunto[]
  /** Color de la línea. Acepta CSS var como `var(--chart-1)` o cadenas válidas para SVG. */
  color?: string
  className?: string
}

/**
 * Sparkline — mini `LineChart` de recharts de ~48 px de altura.
 *
 * Si `data.length < 2` renderiza un texto "Sin datos suficientes" en lugar
 * del gráfico (R4.7, R4.8).
 */
export function Sparkline({ data, color, className }: SparklineProps) {
  if (data.length < 2) {
    return (
      <p
        className={cn("text-xs text-muted-foreground", className)}
        aria-label="Sin datos suficientes para mostrar la tendencia"
      >
        Sin datos suficientes
      </p>
    )
  }

  const strokeColor = color ?? "var(--chart-1)"

  return (
    <div
      className={cn("h-12 w-full", className)}
      aria-hidden="true"
      role="img"
      aria-label="Gráfica de tendencia de la métrica"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
          <Line
            type="monotone"
            dataKey="valor"
            stroke={strokeColor}
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

export default Sparkline
