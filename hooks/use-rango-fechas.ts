"use client"

// Feature: dashboard-metricas-notificaciones
// Hook de cliente que gestiona el Rango_Fechas del Dashboard_Analitico (R1.1, R1.2,
// R1.7, R1.8, R1.9). Reutiliza las funciones puras de `lib/dashboard/rango.ts` y no
// contiene lógica de fechas propia: sólo orquesta estado de React.
import * as React from "react"

import {
  etiquetaLegible as etiquetaLegibleRango,
  presetARango,
  validarRangoPersonalizado,
  type PresetRango,
  type RangoFechas,
} from "@/lib/dashboard/rango"

export type { PresetRango, RangoFechas }

export type UseRangoFechas = {
  preset: PresetRango
  rango: RangoFechas
  /** Etiqueta legible del rango activo, p. ej. `"2 abr 2025 – 20 abr 2025"` (R1.9). */
  etiquetaLegible: string
  setPreset(p: PresetRango): void
  /**
   * Confirma un rango personalizado. Valida con `validarRangoPersonalizado`; en
   * fallo conserva el rango previo y expone `mensaje`; en éxito actualiza el rango
   * y limpia el error.
   */
  setPersonalizado(
    desde: string,
    hasta: string
  ): { ok: true } | { ok: false; mensaje: string }
  error: string | null
}

/**
 * Zona horaria del cliente para interpretar los presets. Usa la zona resuelta por
 * el navegador (`Intl`) con respaldo a `America/Mexico_City`, alineada con la `TZ`
 * por defecto del core.
 */
function resolverTz(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/Mexico_City"
  } catch {
    return "America/Mexico_City"
  }
}

const PRESET_INICIAL: PresetRango = "este_mes"

/**
 * Gestiona el Rango_Fechas del dashboard: preset activo, rango calculado, etiqueta
 * legible y el estado de error de la última validación personalizada.
 *
 * Estado inicial: preset `"este_mes"` (R1.1), con su rango calculado sobre `new Date()`.
 */
export function useRangoFechas(): UseRangoFechas {
  const tz = React.useMemo(() => resolverTz(), [])

  const [preset, setPresetState] = React.useState<PresetRango>(PRESET_INICIAL)
  const [rango, setRango] = React.useState<RangoFechas>(() =>
    presetARango(PRESET_INICIAL, new Date(), tz)
  )
  const [error, setError] = React.useState<string | null>(null)

  const setPreset = React.useCallback(
    (p: PresetRango) => {
      setPresetState(p)
      setError(null)
      if (p !== "personalizado") {
        setRango(presetARango(p, new Date(), tz))
      }
    },
    [tz]
  )

  const setPersonalizado = React.useCallback(
    (desde: string, hasta: string): { ok: true } | { ok: false; mensaje: string } => {
      const resultado = validarRangoPersonalizado(desde, hasta, new Date())
      if (!resultado.ok) {
        // Conserva el rango previo y expone el mensaje de error (R1.7, R1.8).
        setError(resultado.mensaje)
        return { ok: false, mensaje: resultado.mensaje }
      }
      setError(null)
      setPresetState("personalizado")
      setRango(resultado.rango)
      return { ok: true }
    },
    []
  )

  const etiquetaLegible = React.useMemo(() => etiquetaLegibleRango(rango), [rango])

  return { preset, rango, etiquetaLegible, setPreset, setPersonalizado, error }
}
