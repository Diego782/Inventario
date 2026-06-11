"use client"

import * as React from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useTema } from "@/hooks/use-tema"
import { cn } from "@/lib/utils"
import type { RankingItemMargen } from "@/lib/api/serializadores"

/**
 * Visual de barras de `topMargin` (máx 10) por margen, ordenado desc (R5.5).
 * Colores del tema vía `useTema` (sin hex), re-render al cambiar tema
 * (R5.8, R5.9). Tooltip con nombre + margen (R5.3).
 */

const MAX_ITEMS = 10

export type VisualTopMarginProps = {
  topMargin: RankingItemMargen[]
  titulo?: string
  className?: string
}

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(valor)
}

type TooltipPayloadItem = {
  value?: number
  payload?: RankingItemMargen
}

function ContenidoTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload?.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      <div className="mb-1 font-medium">{item.nombre}</div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Margen</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {formatearMoneda(item.margen)}
        </span>
      </div>
    </div>
  )
}

export function VisualTopMargin({
  topMargin,
  titulo = "Mayor margen por producto",
  className,
}: VisualTopMarginProps) {
  const { tema, colores } = useTema()

  // Limita a 10 y asegura orden desc por margen (R5.5).
  const datos = React.useMemo(
    () =>
      [...topMargin]
        .sort((a, b) => b.margen - a.margen)
        .slice(0, MAX_ITEMS),
    [topMargin],
  )

  if (!datos.length) {
    return (
      <Card className={cn(className)}>
        <CardHeader>
          <CardTitle>{titulo}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="py-12 text-center text-sm text-muted-foreground">
            No hay datos para el período seleccionado
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={cn(className)}>
      <CardHeader>
        <CardTitle>{titulo}</CardTitle>
        <CardDescription>Por margen unitario (máx. 10)</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-80 w-full">
          <ResponsiveContainer key={tema} width="100%" height="100%">
            <BarChart
              data={datos}
              layout="vertical"
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid
                horizontal={false}
                strokeDasharray="3 3"
                stroke={colores.muted}
              />
              <XAxis
                type="number"
                stroke={colores.foreground}
                fontSize={12}
                tickLine={false}
                tickFormatter={(v: number) => formatearMoneda(v)}
              />
              <YAxis
                type="category"
                dataKey="nombre"
                stroke={colores.foreground}
                fontSize={12}
                tickLine={false}
                width={120}
              />
              <Tooltip
                cursor={{ fill: colores.muted, opacity: 0.3 }}
                content={<ContenidoTooltip />}
              />
              <Legend />
              <Bar
                dataKey="margen"
                name="Margen"
                fill={colores.chart2}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default VisualTopMargin
