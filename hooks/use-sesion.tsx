"use client"

/**
 * hooks/use-sesion.ts
 * Context global de sesión montado en SesionProvider.
 * Hace GET /api/auth/sesion al montar y cachea el resultado.
 * Expone { usuario, cargando, refetch, logout }.
 *
 * Validates: Requirements R4.6, R5.6, R5.7
 */
import * as React from "react"
import type { UsuarioDTO } from "@/lib/api/serializadores-auth"

export type SesionState = {
  usuario: UsuarioDTO | null
  cargando: boolean
  refetch: () => Promise<void>
  logout: () => Promise<void>
}

const SesionContext = React.createContext<SesionState | null>(null)

export function SesionProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = React.useState<UsuarioDTO | null>(null)
  const [cargando, setCargando] = React.useState(true)

  const refetch = React.useCallback(async () => {
    setCargando(true)
    try {
      const res = await fetch("/api/auth/sesion", { credentials: "include" })
      if (res.ok) {
        const data: UsuarioDTO = await res.json()
        setUsuario(data)
      } else {
        setUsuario(null)
      }
    } catch {
      setUsuario(null)
    } finally {
      setCargando(false)
    }
  }, [])

  const logout = React.useCallback(async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      })
    } finally {
      setUsuario(null)
    }
  }, [])

  React.useEffect(() => {
    refetch()
  }, [refetch])

  const value = React.useMemo<SesionState>(
    () => ({ usuario, cargando, refetch, logout }),
    [usuario, cargando, refetch, logout]
  )

  return (
    <SesionContext.Provider value={value}>{children}</SesionContext.Provider>
  )
}

export function useSesion(): SesionState {
  const ctx = React.useContext(SesionContext)
  if (!ctx) {
    throw new Error("useSesion debe usarse dentro de <SesionProvider>")
  }
  return ctx
}
