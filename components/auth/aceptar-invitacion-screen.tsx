"use client"

/**
 * components/auth/aceptar-invitacion-screen.tsx
 *
 * Pantalla de aceptación de invitación. Muestra el nombre de la Organización
 * y el Rol ofrecido antes de confirmar (R10.1). Si el invitado no tiene cuenta,
 * redirige a Registro conservando el token (R10.6).
 *
 * Flujo:
 * 1. Al montar: GET /api/invitaciones/info?token=<token> para obtener org+rol.
 * 2. Si el usuario no está autenticado: muestra botón "Regístrate para aceptar".
 * 3. Si está autenticado: muestra org+rol y botón "Aceptar invitación".
 * 4. Al aceptar: POST /api/invitaciones/aceptar con el token.
 * 5. En éxito: llama onAceptado() o redirige a selección de org.
 *
 * Validates: Requirements R10.1, R10.6
 */

import * as React from "react"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { useSesion } from "@/hooks/use-sesion"
import { Building2, ShieldCheck, AlertCircle, CheckCircle2 } from "lucide-react"

interface InfoInvitacion {
  organizacion: string
  rol: string
  correo: string
}

type Estado =
  | { tipo: "cargando" }
  | { tipo: "info"; info: InfoInvitacion }
  | { tipo: "error"; mensaje: string }
  | { tipo: "aceptada" }

interface AceptarInvitacionScreenProps {
  token: string
  onAceptado?: () => void
  onCambiarPantalla?: (p: "registro" | "login") => void
}

export function AceptarInvitacionScreen({
  token,
  onAceptado,
  onCambiarPantalla,
}: AceptarInvitacionScreenProps) {
  const { usuario, cargando: cargandoSesion } = useSesion()
  const [estado, setEstado] = React.useState<Estado>({ tipo: "cargando" })
  const [aceptando, setAceptando] = React.useState(false)

  // Cargar información de la invitación al montar
  React.useEffect(() => {
    if (!token) {
      setEstado({ tipo: "error", mensaje: "Token de invitación no válido." })
      return
    }

    let cancelado = false

    async function cargarInfo() {
      setEstado({ tipo: "cargando" })
      try {
        const res = await fetch(
          `/api/invitaciones/info?token=${encodeURIComponent(token)}`,
          { credentials: "include" }
        )

        if (cancelado) return

        if (res.ok) {
          const data: InfoInvitacion = await res.json()
          setEstado({ tipo: "info", info: data })
        } else if (res.status === 400) {
          setEstado({
            tipo: "error",
            mensaje:
              "Esta invitación no es válida, ha expirado o ya fue utilizada.",
          })
        } else {
          setEstado({
            tipo: "error",
            mensaje: "No se pudo cargar la información de la invitación.",
          })
        }
      } catch {
        if (!cancelado) {
          setEstado({
            tipo: "error",
            mensaje: "Error de conexión. Intenta de nuevo más tarde.",
          })
        }
      }
    }

    cargarInfo()
    return () => {
      cancelado = true
    }
  }, [token])

  async function handleAceptar() {
    setAceptando(true)
    try {
      const res = await fetch("/api/invitaciones/aceptar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token }),
      })

      if (res.ok) {
        setEstado({ tipo: "aceptada" })
        onAceptado?.()
      } else {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo ?? ""
        if (codigo === "INVITACION_INVALIDA") {
          setEstado({
            tipo: "error",
            mensaje:
              "Esta invitación no es válida, ha expirado o ya fue utilizada.",
          })
        } else if (codigo === "INVITACION_OTRO_CORREO") {
          setEstado({
            tipo: "error",
            mensaje:
              "Esta invitación fue enviada a otro correo electrónico. Inicia sesión con la cuenta correcta.",
          })
        } else {
          setEstado({
            tipo: "error",
            mensaje: "No se pudo aceptar la invitación. Intenta de nuevo.",
          })
        }
      }
    } catch {
      setEstado({
        tipo: "error",
        mensaje: "Error de conexión. Intenta de nuevo más tarde.",
      })
    } finally {
      setAceptando(false)
    }
  }

  function handleRegistrarse() {
    if (onCambiarPantalla) {
      onCambiarPantalla("registro")
    }
  }

  // Mientras se resuelve la sesión, mostrar skeleton
  if (cargandoSesion) {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <Skeleton className="h-6 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
        <CardFooter>
          <Skeleton className="h-10 w-full" />
        </CardFooter>
      </Card>
    )
  }

  // Estado: cargando información de la invitación
  if (estado.tipo === "cargando") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Invitación</CardTitle>
          <CardDescription>Cargando información de la invitación…</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    )
  }

  // Estado: error
  if (estado.tipo === "error") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">Invitación</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Invitación no disponible</AlertTitle>
            <AlertDescription>{estado.mensaje}</AlertDescription>
          </Alert>
        </CardContent>
        <CardFooter>
          <Button
            variant="outline"
            className="w-full"
            onClick={() => onCambiarPantalla?.("login")}
          >
            Volver al inicio
          </Button>
        </CardFooter>
      </Card>
    )
  }

  // Estado: aceptada con éxito
  if (estado.tipo === "aceptada") {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">¡Bienvenido!</CardTitle>
          <CardDescription>
            Te has unido a la organización correctamente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Invitación aceptada</AlertTitle>
            <AlertDescription>
              Ya eres miembro de la organización. Puedes comenzar a usar
              Dego.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    )
  }

  // Estado: info cargada — mostrar org+rol y opciones
  const { info } = estado

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle className="text-xl">Invitación a organización</CardTitle>
        <CardDescription>
          Has sido invitado a unirte a una organización en Dego.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Información de la organización */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <Building2 className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Organización
            </p>
            <p className="truncate font-semibold text-foreground">
              {info.organizacion}
            </p>
          </div>
        </div>

        {/* Información del rol ofrecido */}
        <div className="flex items-start gap-3 rounded-lg border border-border bg-card p-4">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Rol asignado
            </p>
            <p className="truncate font-semibold text-foreground">{info.rol}</p>
          </div>
        </div>

        {/* Correo al que fue enviada la invitación */}
        <p className="text-center text-sm text-muted-foreground">
          Esta invitación fue enviada a{" "}
          <span className="font-medium text-foreground">{info.correo}</span>
        </p>

        {/* Si el usuario no está autenticado: R10.6 */}
        {!usuario && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Necesitas una cuenta</AlertTitle>
            <AlertDescription>
              Para aceptar esta invitación debes iniciar sesión o crear una
              cuenta con el correo al que fue enviada.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex flex-col gap-2">
        {usuario ? (
          /* Usuario autenticado: puede aceptar directamente */
          <Button
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            onClick={handleAceptar}
            disabled={aceptando}
          >
            {aceptando ? "Aceptando…" : "Aceptar invitación"}
          </Button>
        ) : (
          /* Usuario no autenticado: R10.6 — redirigir a registro conservando el token */
          <>
            <Button
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              onClick={handleRegistrarse}
            >
              Regístrate para aceptar
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              ¿Ya tienes cuenta?{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => onCambiarPantalla?.("login")}
              >
                Inicia sesión
              </button>
            </p>
          </>
        )}
      </CardFooter>
    </Card>
  )
}
