"use client"

/**
 * components/auth/verificacion-screen.tsx
 *
 * Pantalla de verificación de correo electrónico.
 * Al montar, hace POST a /api/auth/verificar-correo con el token recibido
 * por props y muestra el estado resultante:
 *   - "verificando": spinner mientras se procesa
 *   - "exito": cuenta activada correctamente
 *   - "invalido": token inválido o expirado, con opción de reenviar
 *
 * Si el estado es "invalido", muestra un formulario para reenviar el correo
 * de verificación a la dirección que el usuario indique.
 *
 * Validates: Requirements R3.4, R3.5, R3.6, R3.7, R3.8, R3.9
 */

import * as React from "react"
import {
  CheckCircle,
  XCircle,
  Loader2,
  Mail,
} from "lucide-react"
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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

type EstadoVerificacion = "verificando" | "exito" | "invalido"

interface VerificacionScreenProps {
  /** Token de verificación extraído de la URL (?token=…) */
  token: string
  /** Callback opcional invocado tras una verificación exitosa */
  onLoginExitoso?: () => void
}

// ---------------------------------------------------------------------------
// Componente
// ---------------------------------------------------------------------------

export function VerificacionScreen({
  token,
  onLoginExitoso,
}: VerificacionScreenProps) {
  const [estado, setEstado] = React.useState<EstadoVerificacion>("verificando")
  const [errorMensaje, setErrorMensaje] = React.useState<string>("")

  // Estado del formulario de reenvío
  const [correoReenvio, setCorreoReenvio] = React.useState("")
  const [correoError, setCorreoError] = React.useState("")
  const [enviando, setEnviando] = React.useState(false)
  const [reenvioExitoso, setReenvioExitoso] = React.useState(false)
  const [reenvioError, setReenvioError] = React.useState("")

  // -------------------------------------------------------------------------
  // Verificar el token al montar
  // -------------------------------------------------------------------------
  React.useEffect(() => {
    if (!token) {
      setEstado("invalido")
      setErrorMensaje("No se proporcionó un token de verificación.")
      return
    }

    let cancelado = false

    async function verificar() {
      try {
        const res = await fetch("/api/auth/verificar-correo", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        })

        if (cancelado) return

        if (res.ok) {
          setEstado("exito")
          // Redirigir automáticamente después de 2 segundos
          setTimeout(() => {
            if (onLoginExitoso) {
              onLoginExitoso()
            } else {
              // Si no hay callback, recargar la página para que vaya al login
              window.location.href = "/"
            }
          }, 2000)
        } else {
          setEstado("invalido")
          try {
            const data = await res.json()
            setErrorMensaje(
              data?.error?.mensaje ??
                "El enlace de verificación no es válido o ha expirado."
            )
          } catch {
            setErrorMensaje(
              "El enlace de verificación no es válido o ha expirado."
            )
          }
        }
      } catch {
        if (!cancelado) {
          setEstado("invalido")
          setErrorMensaje(
            "No se pudo conectar con el servidor. Intenta de nuevo más tarde."
          )
        }
      }
    }

    verificar()

    return () => {
      cancelado = true
    }
  }, [token, onLoginExitoso])

  // -------------------------------------------------------------------------
  // Reenviar verificación
  // -------------------------------------------------------------------------
  async function handleReenviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setCorreoError("")
    setReenvioError("")
    setReenvioExitoso(false)

    const correoNormalizado = correoReenvio.trim().toLowerCase()

    // Validación básica en cliente
    if (!correoNormalizado) {
      setCorreoError("Ingresa tu correo electrónico.")
      return
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correoNormalizado)) {
      setCorreoError("Ingresa un correo electrónico válido.")
      return
    }

    setEnviando(true)
    try {
      const res = await fetch("/api/auth/reenviar-verificacion", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ correo: correoNormalizado }),
      })

      if (res.status === 429) {
        setReenvioError(
          "Has solicitado demasiados reenvíos. Espera un momento antes de intentarlo de nuevo."
        )
      } else {
        // La API siempre responde 200 para no revelar si el correo existe
        setReenvioExitoso(true)
      }
    } catch {
      setReenvioError(
        "No se pudo enviar el correo. Intenta de nuevo más tarde."
      )
    } finally {
      setEnviando(false)
    }
  }

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        {/* ---------------------------------------------------------------- */}
        {/* Estado: verificando                                               */}
        {/* ---------------------------------------------------------------- */}
        {estado === "verificando" && (
          <>
            <CardHeader className="items-center text-center">
              <Loader2
                className="mb-2 h-10 w-10 animate-spin text-primary"
                aria-hidden="true"
              />
              <CardTitle>Verificando tu correo</CardTitle>
              <CardDescription>
                Estamos confirmando tu dirección de correo electrónico. Por
                favor espera un momento…
              </CardDescription>
            </CardHeader>
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Estado: éxito                                                     */}
        {/* ---------------------------------------------------------------- */}
        {estado === "exito" && (
          <>
            <CardHeader className="items-center text-center">
              <CheckCircle
                className="mb-2 h-10 w-10 text-green-600 dark:text-green-400"
                aria-hidden="true"
              />
              <CardTitle>¡Correo verificado!</CardTitle>
              <CardDescription>
                Tu cuenta ha sido activada correctamente. Redirigiendo al inicio de sesión...
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Alert>
                <CheckCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>Cuenta activa</AlertTitle>
                <AlertDescription>
                  Tu correo electrónico ha sido verificado exitosamente. Serás redirigido automáticamente en unos segundos.
                </AlertDescription>
              </Alert>
            </CardContent>
          </>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* Estado: inválido                                                  */}
        {/* ---------------------------------------------------------------- */}
        {estado === "invalido" && (
          <>
            <CardHeader className="items-center text-center">
              <XCircle
                className="mb-2 h-10 w-10 text-destructive"
                aria-hidden="true"
              />
              <CardTitle>Enlace no válido</CardTitle>
              <CardDescription>
                {errorMensaje ||
                  "El enlace de verificación no es válido o ha expirado."}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>No se pudo verificar tu correo</AlertTitle>
                <AlertDescription>
                  El enlace puede haber expirado o ya fue utilizado. Solicita
                  un nuevo correo de verificación a continuación.
                </AlertDescription>
              </Alert>

              {/* Formulario de reenvío */}
              {!reenvioExitoso ? (
                <form
                  onSubmit={handleReenviar}
                  className="space-y-3"
                  noValidate
                >
                  <div className="space-y-1">
                    <Label htmlFor="correo-reenvio">
                      Reenviar verificación
                    </Label>
                    <Input
                      id="correo-reenvio"
                      type="email"
                      placeholder="tu@correo.com"
                      value={correoReenvio}
                      onChange={(e) => setCorreoReenvio(e.target.value)}
                      aria-invalid={!!correoError}
                      aria-describedby={
                        correoError ? "correo-reenvio-error" : undefined
                      }
                      disabled={enviando}
                      autoComplete="email"
                    />
                    {correoError && (
                      <p
                        id="correo-reenvio-error"
                        className="text-sm text-destructive"
                        role="alert"
                      >
                        {correoError}
                      </p>
                    )}
                  </div>

                  {reenvioError && (
                    <p className="text-sm text-destructive" role="alert">
                      {reenvioError}
                    </p>
                  )}

                  <Button
                    type="submit"
                    className="w-full"
                    disabled={enviando}
                  >
                    {enviando ? (
                      <>
                        <Loader2
                          className="mr-2 h-4 w-4 animate-spin"
                          aria-hidden="true"
                        />
                        Enviando…
                      </>
                    ) : (
                      <>
                        <Mail className="mr-2 h-4 w-4" aria-hidden="true" />
                        Reenviar verificación
                      </>
                    )}
                  </Button>
                </form>
              ) : (
                <Alert>
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  <AlertTitle>Correo enviado</AlertTitle>
                  <AlertDescription>
                    Si existe una cuenta con esa dirección, recibirás un nuevo
                    enlace de verificación en breve. Revisa también tu carpeta
                    de spam.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </>
        )}
      </Card>
    </div>
  )
}
