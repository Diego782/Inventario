"use client"

/**
 * components/auth/auth-gate.tsx
 *
 * Compuerta de autenticación. Usa useSesion() para determinar el estado
 * de la sesión y renderiza el contenido apropiado:
 *   - Cargando: muestra un skeleton de pantalla completa
 *   - Sin sesión válida: monta AuthScreens (Login / Registro / Verificación)
 *   - Con sesión válida: renderiza children
 *
 * Cubre la condición R5.6 "mostrar Login en lugar de secciones" y
 * R5.7 "mostrar secciones y ocultar Login cuando hay sesión válida".
 *
 * Validates: Requirements R5.6, R5.7
 */

import { useSesion } from "@/hooks/use-sesion"
import { Skeleton } from "@/components/ui/skeleton"
import { AuthScreens } from "@/components/auth/auth-screens"

interface AuthGateProps {
  children: React.ReactNode
}

export function AuthGate({ children }: AuthGateProps) {
  const { usuario, cargando } = useSesion()

  // Mientras se resuelve la sesión, mostrar skeleton de pantalla completa
  if (cargando) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <Skeleton className="h-12 w-48" />
        <Skeleton className="h-4 w-64" />
        <Skeleton className="h-4 w-56" />
        <div className="mt-4 w-full max-w-sm space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      </div>
    )
  }

  // Sin sesión válida: mostrar pantallas de autenticación
  if (!usuario) {
    return <AuthScreens />
  }

  // Con sesión válida: renderizar el contenido protegido
  return <>{children}</>
}
