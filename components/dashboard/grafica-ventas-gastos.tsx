"use client"

import * as React from "react"
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useTema } from "@/hooks/use-tema"
import { cn } from "@/lib/utils"
import type { MetricasDTO } from "@/lib/api/serializadores"

/**
 * Gráfica comparativa Ventas vs Gastos por día, con leyenda y ejes fecha (X) /
 * monto (Y) (R5.2, R5.3). Combina las dos series de `MetricasDTO.series` en un
 * único conjunto de puntos por fecha. Colores del tema vía `useTema` (sin hex),
 * re-render al cambiar tema (R5.8, R5.9).
 */

export type GraficaVentasGastosProps = {
  series: MetricasDTO["series"]
  titulo?: string
  className?: string
}

type PuntoComparativo = {
  fecha: string
  ventas: number
  gastos: number
}

function combinarSeries(series: MetricasDTO["series"]): PuntoComparativo[] {
  const porFecha = new Map<string, PuntoComparativo>()
  for (const p of series.ventas) {
    porFecha.set(p.fecha, { fecha: p.fecha, ventas: p.valor, gastos: 0 })
  }
  for (const p of series.gastos) {
    const existente = porFecha.get(p.fecha)
    if (existente) {
      existente.gastos = p.valor
    } else {
      porFecha.set(p.fecha, { fecha: p.fecha, ventas: 0, gastos: p.valor })
    }
  }
  return Array.from(porFecha.values()).sort((a, b) =>
    a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0,
  )
}

function formatearFechaEje(fecha: string): string {
  try {
    return format(parseISO(fecha), "d MMM", { locale: es })
  } catch {
    return fecha
  }
}

function formatearFechaCompleta(fecha: string): string {
  try {
    return format(parseISO(fecha), "d 'de' MMMM 'de' yyyy", { locale: es })
  } catch {
    return fecha
  }
}

function formatearMoneda(valor: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(valor)
}

type TooltipPayloadItem = {
  name?: string
  value?: number
  color?: string
  payload?: { fecha?: string }
}

function ContenidoTooltip({
  active,
  payload,
}: {
  active?: boolean
  payload?: TooltipPayloadItem[]
}) {
  if (!active || !payload?.length) return null
  const fecha = payload[0]?.payload?.fecha
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      {fecha ? (
        <div className="mb-1 font-medium">{formatearFechaCompleta(fecha)}</div>
      ) : null}
      <div className="grid gap-1">
        {payload.map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-4"
          >
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ backgroundColor: item.color }}
              />
              {item.name}
            </span>
            <span className="font-mono font-medium tabular-nums text-foreground">
              {formatearMoneda(item.value ?? 0)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

export function GraficaVentasGastos({
  series,
  titulo = "Ventas vs Gastos",
  className,
}: GraficaVentasGastosProps) {
  const { tema, colores } = useTema()
  const datos = React.useMemo(() => combinarSeries(series), [series])

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
        <CardDescription>Comparativa diaria del período</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer key={tema} width="100%" height="100%">
            <LineChart
              data={datos}
              margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke={colores.muted} />
              <XAxis
                dataKey="fecha"
                tickFormatter={formatearFechaEje}
                stroke={colores.foreground}
                fontSize={12}
                tickLine={false}
              />
              <YAxis
                stroke={colores.foreground}
                fontSize={12}
                tickLine={false}
                width={72}
                tickFormatter={(v: number) => formatearMoneda(v)}
              />
              <Tooltip content={<ContenidoTooltip />} />
              <Legend />
              <Line
                type="monotone"
                dataKey="ventas"
                name="Ventas"
                stroke={colores.chart1}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="gastos"
                name="Gastos"
                stroke={colores.chart2}
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}

export default GraficaVentasGastos
