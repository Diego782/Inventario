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
 * Gráfica de la Serie_Tendencia de Ventas (línea) con ejes fecha (X) y monto (Y)
 * y leyenda (R5.1, R5.3). Los colores provienen del tema activo vía `useTema`
 * (sin hex hardcodeados) y la gráfica vuelve a renderizar al cambiar de tema
 * (R5.8, R5.9).
 */

export type GraficaTendenciaProps = {
  /** Serie de ventas por día (`MetricasDTO.series.ventas`). */
  ventas: MetricasDTO["series"]["ventas"]
  /** Título opcional de la tarjeta. */
  titulo?: string
  className?: string
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
  value?: number
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
  const punto = payload[0]
  const fecha = punto.payload?.fecha
  return (
    <div className="rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl">
      {fecha ? (
        <div className="mb-1 font-medium">{formatearFechaCompleta(fecha)}</div>
      ) : null}
      <div className="flex items-center justify-between gap-4">
        <span className="text-muted-foreground">Ventas</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {formatearMoneda(punto.value ?? 0)}
        </span>
      </div>
    </div>
  )
}

export function GraficaTendencia({
  ventas,
  titulo = "Tendencia de ventas",
  className,
}: GraficaTendenciaProps) {
  const { tema, colores } = useTema()

  if (!ventas.length) {
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
        <CardDescription>Ventas por día del período</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          {/* `key={tema}` fuerza un remount al alternar tema para repintar la paleta (R5.9). */}
          <ResponsiveContainer key={tema} width="100%" height="100%">
            <LineChart
              data={ventas}
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
                dataKey="valor"
                name="Ventas"
                stroke={colores.chart1}
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

export default GraficaTendencia
