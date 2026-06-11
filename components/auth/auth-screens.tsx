"use client"

/**
 * components/auth/auth-screens.tsx
 *
 * Conmutador de pantallas de autenticación (login | registro | verificación |
 * aceptar-invitación) por estado local, sin cambiar la URL.
 *
 * Detecta `?token=&accion=` en la URL al montar (via el helper compartido
 * `leerParamsInvitacion`):
 *   - accion=verificar  → VerificacionScreen (con el token)
 *   - accion=invitacion → AceptarInvitacionScreen (con el token)
 *   - sin token         → LoginScreen
 *
 * Pasa `onCambiarPantalla` a cada pantalla para la navegación entre ellas.
 * Pasa `onLoginExitoso` a LoginScreen, RegistroScreen y VerificacionScreen
 * para disparar useSesion().refetch() tras un login o registro exitoso.
 * Tras el refetch, AuthGate montará el subárbol autenticado donde
 * InvitacionGate interceptará y mostrará feedback explícito de la invitación
 * (cláusulas 2.2, 3.1, 3.2).
 *
 * Validates: Requirements R5, R10.6, 2.2, 3.1, 3.2
 */

import * as React from "react"
import { useTheme } from "next-themes"
import { useSesion } from "@/hooks/use-sesion"
import { leerParamsInvitacion } from "@/lib/auth/params-invitacion"
import { LoginScreen } from "@/components/auth/login-screen"
import { RegistroScreen } from "@/components/auth/registro-screen"
import { VerificacionScreen } from "@/components/auth/verificacion-screen"
import { AceptarInvitacionScreen } from "@/components/auth/aceptar-invitacion-screen"

// ─── Tipos ────────────────────────────────────────────────────────────────────

type Pantalla = "login" | "registro" | "verificacion" | "aceptar-invitacion"

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Determina la pantalla inicial según los parámetros de la URL. */
function pantallaInicial(): Pantalla {
  const { token, accion } = leerParamsInvitacion()
  if (token && accion === "verificar") return "verificacion"
  if (token && accion === "invitacion") return "aceptar-invitacion"
  return "login"
}

// ─── Componente ───────────────────────────────────────────────────────────────

export function AuthScreens() {
  const { refetch } = useSesion()
  const { theme, setTheme } = useTheme()

  const [pantalla, setPantalla] = React.useState<Pantalla>(pantallaInicial)

  // Las pantallas de autenticación (Marca Dego) siempre se muestran en modo
  // claro, sin importar el modo que dejó la sesión anterior. Se guarda la
  // preferencia previa y se restaura al desmontar (tras login exitoso), de modo
  // que el usuario recupera su modo (claro/oscuro) dentro de la app.
  const temaPrevioRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
    // Capturar la preferencia previa solo una vez, al montar.
    if (temaPrevioRef.current === undefined) {
      temaPrevioRef.current = theme ?? "light"
    }
    setTheme("light")
    return () => {
      const previo = temaPrevioRef.current
      if (previo && previo !== "light") {
        setTheme(previo)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setTheme])

  // Leer el token de la URL una sola vez al montar usando el helper compartido
  const tokenUrl = React.useMemo(() => leerParamsInvitacion().token ?? "", [])

  /**
   * Callback que dispara refetch() de la sesión tras login/registro exitoso.
   * La aceptación de la invitación se delega a InvitacionGate (subárbol
   * autenticado), eliminando la aceptación automática silenciosa previa
   * (cláusula 2.2).
   */
  const handleLoginExitoso = React.useCallback(async () => {
    await refetch()
  }, [refetch])

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      {pantalla === "login" && (
        <LoginScreen
          onCambiarPantalla={setPantalla}
          onLoginExitoso={handleLoginExitoso}
        />
      )}

      {pantalla === "registro" && (
        <RegistroScreen
          onCambiarPantalla={setPantalla}
          onLoginExitoso={handleLoginExitoso}
        />
      )}

      {pantalla === "verificacion" && (
        <VerificacionScreen
          token={tokenUrl}
          onLoginExitoso={handleLoginExitoso}
        />
      )}

      {pantalla === "aceptar-invitacion" && (
        <AceptarInvitacionScreen
          token={tokenUrl}
          onCambiarPantalla={setPantalla}
        />
      )}
    </div>
  )
}
