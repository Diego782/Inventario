"use client"

// Feature: dashboard-metricas-notificaciones
// Hook de cliente que carga las métricas y rankings del Dashboard_Analitico para el
// Rango_Fechas activo (R5.10–R5.13, R14.4, R14.5). Lanza ambas peticiones al cambiar
// el rango con un timeout de 10 s vía AbortController (R5.11). En fallo o timeout pasa
// a estado `error` conservando el estado previo sin renderizar datos parciales (R5.12).
// Cuando ambas respuestas no traen datos, el estado es `vacio` (R5.13).
import * as React from "react"

import type { MetricasDTO, RankingsDTO } from "@/lib/api/serializadores"

/** Estados posibles de la carga del dashboard. */
export type EstadoCarga = "inicial" | "cargando" | "listo" | "error" | "vacio"

export type RangoConsulta = { desde: string; hasta: string }

export type UseDashboardData = {
  estado: EstadoCarga
  metricas: MetricasDTO | null
  rankings: RankingsDTO | null
  /** Re-lanza la carga para el rango actual conservando el estado previo sin datos parciales. */
  reintentar(): void
}

/** Tiempo máximo de espera por petición antes de abortar (R5.11). */
const TIMEOUT_MS = 10_000

/**
 * Considera unas métricas "sin datos" cuando las cuatro métricas principales valen 0
 * en el período actual. Las series y la variación no aportan datos por sí solas.
 */
function metricasSinDatos(m: MetricasDTO): boolean {
  return (
    m.totalSales.actual === 0 &&
    m.totalReturns.actual === 0 &&
    m.totalExpenses.actual === 0 &&
    m.estimatedProfit.actual === 0
  )
}

/** Considera unos rankings "sin datos" cuando las cuatro listas están vacías. */
function rankingsSinDatos(r: RankingsDTO): boolean {
  return (
    r.topSelling.length === 0 &&
    r.topMargin.length === 0 &&
    r.topRotation.length === 0 &&
    r.lowRotation.length === 0
  )
}

/**
 * Realiza un `fetch` con timeout por `AbortController`. Lanza si la respuesta no es
 * `ok`, si el cuerpo no es JSON válido o si se excede el tiempo límite.
 */
async function fetchConTimeout<T>(url: string, signal: AbortSignal): Promise<T> {
  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  // Aborta también si el efecto se desmonta o el rango cambia (signal externa).
  const alAbortar = () => controlador.abort()
  signal.addEventListener("abort", alAbortar)

  try {
    const res = await fetch(url, { signal: controlador.signal })
    if (!res.ok) {
      throw new Error(`Petición fallida (${res.status}) en ${url}`)
    }
    return (await res.json()) as T
  } finally {
    clearTimeout(temporizador)
    signal.removeEventListener("abort", alAbortar)
  }
}

/**
 * Carga métricas y rankings del dashboard para el `rango` dado.
 *
 * Vuelve a lanzar las peticiones cada vez que cambian `rango.desde` o `rango.hasta`.
 * Mientras carga, expone `estado === "cargando"`; al completar, `"listo"` (o `"vacio"`
 * si ambas respuestas no traen datos); ante fallo/timeout, `"error"` conservando los
 * datos previos sin renderizar resultados parciales.
 */
export function useDashboardData(rango: RangoConsulta): UseDashboardData {
  const [estado, setEstado] = React.useState<EstadoCarga>("inicial")
  const [metricas, setMetricas] = React.useState<MetricasDTO | null>(null)
  const [rankings, setRankings] = React.useState<RankingsDTO | null>(null)

  // Contador para forzar una recarga manual sin cambiar el rango (reintentar).
  const [intento, setIntento] = React.useState(0)

  const { desde, hasta } = rango

  React.useEffect(() => {
    const controlador = new AbortController()
    let cancelado = false

    async function cargar() {
      setEstado("cargando")

      const params = new URLSearchParams({ desde, hasta }).toString()
      try {
        const [m, r] = await Promise.all([
          fetchConTimeout<MetricasDTO>(
            `/api/dashboard/metricas?${params}`,
            controlador.signal
          ),
          fetchConTimeout<RankingsDTO>(
            `/api/dashboard/rankings?${params}`,
            controlador.signal
          ),
        ])

        if (cancelado) return

        setMetricas(m)
        setRankings(r)
        setEstado(metricasSinDatos(m) && rankingsSinDatos(r) ? "vacio" : "listo")
      } catch {
        if (cancelado) return
        // Conserva los datos previos: no se renderizan resultados parciales (R5.12).
        setEstado("error")
      }
    }

    void cargar()

    return () => {
      cancelado = true
      controlador.abort()
    }
  }, [desde, hasta, intento])

  const reintentar = React.useCallback(() => {
    setIntento((n) => n + 1)
  }, [])

  return { estado, metricas, rankings, reintentar }
}
