"use client"

/**
 * components/auth/invitacion-gate.tsx
 *
 * Compuerta de invitación. Se monta dentro del subárbol autenticado de
 * AuthGate (es decir, siempre hay un usuario válido en contexto). Lee los
 * parámetros ?token= y ?accion= de la URL y, si corresponde a una invitación
 * pendiente, intercepta el flujo mostrando AceptarInvitacionScreen en lugar
 * de dejar pasar a OrganizacionGate.
 *
 * Flujo:
 *   1. Lee token y accion con leerParamsInvitacion().
 *   2. Calcula debeInterceptar = Boolean(token) && accion === "invitacion".
 *   3. Si NO debe interceptar → renderiza children (OrganizacionGate sigue normal).
 *   4. Si debe interceptar → monta AceptarInvitacionScreen centrada en pantalla
 *      completa (mismo contenedor visual que AuthScreens).
 *   5. onAceptado: limpia la URL, recarga el contexto de organizaciones y pone
 *      interceptado = false para que el siguiente render delegue en children.
 *   6. "Volver al inicio" (cierre/error): limpia la URL y deja de interceptar.
 *
 * Validates: Requirements 2.1, 2.2, 2.4
 */

import * as React from "react"
import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { AceptarInvitacionScreen } from "@/components/auth/aceptar-invitacion-screen"
import {
  leerParamsInvitacion,
  limpiarParamsInvitacion,
} from "@/lib/auth/params-invitacion"

interface InvitacionGateProps {
  children: React.ReactNode
}

export function InvitacionGate({ children }: InvitacionGateProps) {
  // El usuario siempre existe aquí (montado dentro del subárbol autenticado)
  const { usuario } = useSesion()
  const { recargar } = useOrganizacionActiva()

  // Leer params una sola vez al montar (cliente únicamente)
  const { token, accion } = React.useMemo(() => leerParamsInvitacion(), [])

  // La condición de intercepción: token presente y accion = "invitacion"
  const debeInterceptar = Boolean(token) && accion === "invitacion"

  // Estado local: sigue interceptando mientras no se resuelva el flujo
  const [interceptado, setInterceptado] = React.useState(debeInterceptar)

  // Si no hay usuario (no debería ocurrir aquí) o no interceptamos: delegar en children
  if (!usuario || !interceptado) {
    return <>{children}</>
  }

  /** Callback: invitación aceptada con éxito. */
  async function handleAceptado() {
    limpiarParamsInvitacion()
    await recargar()
    setInterceptado(false)
  }

  /** Callback: "Volver al inicio" — el usuario cierra o abandona el estado de error.
   *  Recibe la pantalla destino (ignorada: en el subárbol autenticado no hay
   *  pantallas de login/registro que mostrar). */
  function handleVolver(_destino: "registro" | "login") {
    limpiarParamsInvitacion()
    setInterceptado(false)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <AceptarInvitacionScreen
        token={token!}
        onAceptado={handleAceptado}
        onCambiarPantalla={handleVolver}
      />
    </div>
  )
}
