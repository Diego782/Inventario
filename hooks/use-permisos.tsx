"use client"
/**
 * hooks/use-permisos.ts
 * Context y Provider para los permisos del Usuario_Actual en la Organizacion_Activa.
 * Carga los permisos desde GET /api/permisos al montar y cada vez que cambia
 * la organización activa. Expone `puede()` que envuelve `tienePermiso()` puro
 * de `@/lib/auth/permisos`, manteniendo una sola fuente de verdad para la
 * lógica de permisos en cliente y servidor.
 *
 * Validates: Requirements R12.1, R12.3
 */
import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react"
import { tienePermiso } from "@/lib/auth/permisos"
import type { Seccion, Accion } from "@/lib/auth/secciones"

export type PermisosState = {
  permisos: Array<{ seccion: string; accion: string }>
  cargando: boolean
  puede: (seccion: Seccion, accion: Accion) => boolean
}

const PermisosContext = createContext<PermisosState>({
  permisos: [],
  cargando: false,
  puede: () => false,
})

type PermisosProviderProps = {
  children: ReactNode
  /**
   * ID de la organización activa. Cuando cambia, se re-fetcha GET /api/permisos.
   * Pásalo desde `useOrganizacionActiva().organizacion?.id` para mantener los
   * permisos sincronizados con la organización seleccionada.
   */
  organizacionId?: string | null
}

export function PermisosProvider({ children, organizacionId }: PermisosProviderProps) {
  const [permisos, setPermisos] = useState<Array<{ seccion: string; accion: string }>>([])
  const [cargando, setCargando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      setCargando(true)
      const res = await fetch("/api/permisos")
      if (res.ok) {
        const data = (await res.json()) as { permisos: Array<{ seccion: string; accion: string }> }
        setPermisos(data.permisos ?? [])
      } else {
        setPermisos([])
      }
    } catch {
      setPermisos([])
    } finally {
      setCargando(false)
    }
  }, [])

  // Re-fetch cuando cambia la organización activa
  useEffect(() => {
    cargar()
  }, [cargar, organizacionId])

  const puede = useCallback(
    (seccion: Seccion, accion: Accion): boolean => {
      return tienePermiso(
        permisos as Array<{ seccion: Seccion; accion: Accion }>,
        seccion,
        accion,
      )
    },
    [permisos],
  )

  return (
    <PermisosContext.Provider value={{ permisos, cargando, puede }}>
      {children}
    </PermisosContext.Provider>
  )
}

export function usePermisos(): PermisosState {
  return useContext(PermisosContext)
}
