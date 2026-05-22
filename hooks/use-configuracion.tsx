"use client"
/**
 * hooks/use-configuracion.ts
 * Context y Provider para la configuración de InvenPro.
 * Carga la configuración desde /api/configuracion al montar y la cachea
 * en memoria durante la sesión. Las mutaciones invalidan el caché local.
 */
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react"
import type { ConfiguracionMap } from "@/lib/schemas/configuracion"
import { CONFIG_DEFAULTS } from "@/lib/schemas/configuracion"

type ConfiguracionContextValue = {
  data: ConfiguracionMap
  loading: boolean
  refetch: () => void
  actualizar: (parcial: Partial<ConfiguracionMap>) => Promise<void>
}

const ConfiguracionContext = createContext<ConfiguracionContextValue>({
  data: CONFIG_DEFAULTS,
  loading: false,
  refetch: () => {},
  actualizar: async () => {},
})

export function ConfiguracionProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<ConfiguracionMap>(CONFIG_DEFAULTS)
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/configuracion")
      if (res.ok) {
        const config = await res.json() as ConfiguracionMap
        setData(config)
        // Actualizar CSS variables
        if (typeof document !== "undefined") {
          document.documentElement.style.setProperty("--etiqueta-ancho", `${config.etiqueta_ancho_mm}mm`)
          document.documentElement.style.setProperty("--etiqueta-alto", `${config.etiqueta_alto_mm}mm`)
          document.documentElement.style.setProperty("--ticket-ancho", `${config.ticket_ancho_mm}mm`)
        }
      }
    } catch {
      // En caso de error, mantener los defaults
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    cargar()
  }, [cargar])

  const actualizar = useCallback(async (parcial: Partial<ConfiguracionMap>) => {
    const res = await fetch("/api/configuracion", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(parcial),
    })
    if (res.ok) {
      const config = await res.json() as ConfiguracionMap
      setData(config)
      if (typeof document !== "undefined") {
        document.documentElement.style.setProperty("--etiqueta-ancho", `${config.etiqueta_ancho_mm}mm`)
        document.documentElement.style.setProperty("--etiqueta-alto", `${config.etiqueta_alto_mm}mm`)
        document.documentElement.style.setProperty("--ticket-ancho", `${config.ticket_ancho_mm}mm`)
      }
    }
  }, [])

  return (
    <ConfiguracionContext.Provider value={{ data, loading, refetch: cargar, actualizar }}>
      {children}
    </ConfiguracionContext.Provider>
  )
}

export function useConfiguracion(): ConfiguracionContextValue {
  return useContext(ConfiguracionContext)
}
