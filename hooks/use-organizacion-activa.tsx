"use client"

/**
 * hooks/use-organizacion-activa.ts
 * Context global de organización activa.
 * Fetches GET /api/organizaciones para la lista y
 * GET /api/auth/organizacion-activa para la org activa actual.
 * seleccionar(id) llama POST /api/auth/organizacion-activa.
 * Expone { organizacion, organizaciones, cargando, error, seleccionar, recargar }.
 *
 * Validates: Requirements R7.1, R7.3, R7.5
 */
import * as React from "react"
import { useSesion } from "@/hooks/use-sesion"
import type {
  OrganizacionDTO,
  OrganizacionConRolDTO,
} from "@/lib/api/serializadores-auth"

export type OrganizacionActivaState = {
  organizacion: OrganizacionDTO | null
  organizaciones: OrganizacionConRolDTO[]
  cargando: boolean
  error: string | null
  seleccionar: (id: string) => Promise<void>
  actualizar: (cambios: {
    nombre?: string
    logo?: string | null
    logo_aspecto?: string | null
  }) => Promise<OrganizacionDTO>
  recargar: () => Promise<void>
}

const OrganizacionActivaContext =
  React.createContext<OrganizacionActivaState | null>(null)

export function OrganizacionActivaProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const { usuario, cargando: cargandoSesion } = useSesion()
  const [organizacion, setOrganizacion] =
    React.useState<OrganizacionDTO | null>(null)
  const [organizaciones, setOrganizaciones] = React.useState<
    OrganizacionConRolDTO[]
  >([])
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const recargar = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      // Fetch lista de organizaciones y org activa en paralelo
      const [listaRes, activaRes] = await Promise.all([
        fetch("/api/organizaciones", { credentials: "include" }),
        fetch("/api/auth/organizacion-activa", { credentials: "include" }),
      ])

      if (!listaRes.ok) {
        throw new Error("No se pudieron cargar las organizaciones")
      }

      const lista: OrganizacionConRolDTO[] = await listaRes.json()
      setOrganizaciones(lista)

      if (activaRes.ok) {
        const data: { organizacion_activa: OrganizacionDTO | null } =
          await activaRes.json()
        setOrganizacion(data.organizacion_activa)
      } else {
        setOrganizacion(null)
      }
    } catch (err) {
      const mensaje =
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las organizaciones"
      setError(mensaje)
      setOrganizaciones([])
      setOrganizacion(null)
    } finally {
      setCargando(false)
    }
  }, [])

  const seleccionar = React.useCallback(
    async (id: string) => {
      setError(null)
      const res = await fetch("/api/auth/organizacion-activa", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ organizacion_id: id }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const mensaje =
          data?.error?.mensaje ?? "No se pudo seleccionar la organización"
        setError(mensaje)
        throw new Error(mensaje)
      }

      const data: { organizacion_activa: OrganizacionDTO } = await res.json()
      setOrganizacion(data.organizacion_activa)
    },
    []
  )

  const actualizar = React.useCallback(
    async (cambios: {
      nombre?: string
      logo?: string | null
      logo_aspecto?: string | null
    }): Promise<OrganizacionDTO> => {
      if (!organizacion) {
        throw new Error("No hay organización activa para actualizar")
      }
      setError(null)
      const res = await fetch(`/api/organizaciones/${organizacion.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cambios),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const mensaje =
          data?.error?.mensaje ?? "No se pudo actualizar la organización"
        setError(mensaje)
        throw new Error(mensaje)
      }

      const actualizada: OrganizacionDTO = await res.json()
      setOrganizacion(actualizada)
      // Reflejar el nuevo nombre/logo en la lista de organizaciones
      setOrganizaciones((prev) =>
        prev.map((o) =>
          o.id === actualizada.id ? { ...o, ...actualizada } : o
        )
      )
      return actualizada
    },
    [organizacion]
  )

  React.useEffect(() => {
    // Esperar a que la sesión se resuelva antes de decidir.
    if (cargandoSesion) return

    // Sin sesión: limpiar el estado y no consultar la API (evita 401/403).
    if (!usuario) {
      setOrganizacion(null)
      setOrganizaciones([])
      setError(null)
      setCargando(false)
      return
    }

    // Con sesión: (re)cargar la lista y la organización activa.
    recargar()
    // Se vuelve a ejecutar cuando cambia el usuario (login/logout).
  }, [usuario, cargandoSesion, recargar])

  const value = React.useMemo<OrganizacionActivaState>(
    () => ({ organizacion, organizaciones, cargando, error, seleccionar, actualizar, recargar }),
    [organizacion, organizaciones, cargando, error, seleccionar, actualizar, recargar]
  )

  return (
    <OrganizacionActivaContext.Provider value={value}>
      {children}
    </OrganizacionActivaContext.Provider>
  )
}

export function useOrganizacionActiva(): OrganizacionActivaState {
  const ctx = React.useContext(OrganizacionActivaContext)
  if (!ctx) {
    throw new Error(
      "useOrganizacionActiva debe usarse dentro de <OrganizacionActivaProvider>"
    )
  }
  return ctx
}
