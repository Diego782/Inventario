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
import type { RankingItemVenta } from "@/lib/api/serializadores"

/**
 * Gráfica de barras horizontales de `topSelling` (máx 10) ordenadas desc por
 * unidades vendidas (R5.4). Colores del tema vía `useTema` (sin hex), re-render
 * al cambiar tema (R5.8, R5.9). Tooltip con nombre + unidades/monto (R5.3).
 */

const MAX_ITEMS = 10

export type GraficaTopSellingProps = {
  topSelling: RankingItemVenta[]
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
  payload?: RankingItemVenta
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
        <span className="text-muted-foreground">Unidades</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {item.unidadesVendidas.toLocaleString("es-MX")}
        </span>
      </div>
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Monto</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {formatearMoneda(item.montoVendido)}
        </span>
      </div>
    </div>
  )
}

export function GraficaTopSelling({
  topSelling,
  titulo = "Productos más vendidos",
  className,
}: GraficaTopSellingProps) {
  const { tema, colores } = useTema()

  // Limita a 10 y asegura orden desc por unidades (R5.4).
  const datos = React.useMemo(
    () =>
      [...topSelling]
        .sort((a, b) => b.unidadesVendidas - a.unidadesVendidas)
        .slice(0, MAX_ITEMS),
    [topSelling],
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
        <CardDescription>Por unidades vendidas (máx. 10)</CardDescription>
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
                allowDecimals={false}
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
                dataKey="unidadesVendidas"
                name="Unidades vendidas"
                fill={colores.chart1}
                radius={[0, 4, 4, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default GraficaTopSelling
