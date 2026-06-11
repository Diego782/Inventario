"use client"

/**
 * components/auth/login-screen.tsx
 *
 * Pantalla de inicio de sesión (Pantalla_Login) con Layout_Split:
 *   - Panel de marca (Marca_Dego): nombre "Dego", logo, título
 *     "Sistema de Inventario" y subtítulo profesional (SUBTITULO_LOGIN).
 *   - Panel de formulario: correo + contraseña gestionado con
 *     react-hook-form + zodResolver(loginSchema). Sin inicio de sesión
 *     con Google ni proveedores de terceros.
 *
 * Responsive: grid de 2 columnas en >=lg, una sola columna por debajo
 * manteniendo visibles título, subtítulo y formulario (R3.8).
 *
 * Paleta aplicada exclusivamente vía tokens de tema (bg-primary,
 * text-primary-foreground, bg-background, text-foreground, border-input,
 * bg-accent, text-accent-foreground); sin literales de color (R4.1).
 * El Color_Acento usa el token `accent` (hue fuera del rango azul) en los
 * elementos destacados del panel de marca (R4.2). Los tokens responden a
 * next-themes y al tema por defecto cuando aún no está resuelto (R4.3, R4.5).
 *
 * Todo el texto en español. Errores inline que conservan los valores
 * previamente ingresados (R3.7).
 *
 * Validates: Requirements R3.1, R3.2, R3.3, R3.4, R3.5, R3.7, R3.8, R3.9,
 *            R4.1, R4.2, R4.3, R4.5
 */

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import type { z } from "zod"
import { Boxes } from "lucide-react"

import { MARCA } from "@/lib/marca"
import { loginSchema } from "@/lib/schemas/auth"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"

type LoginFormValues = z.infer<typeof loginSchema>

/**
 * Subtítulo profesional de la Pantalla_Login (R3.3).
 * En español, no vacío, longitud entre 20 y 160 caracteres, y menciona
 * la gestión de inventario y de ventas de la organización.
 */
export const SUBTITULO_LOGIN =
  "Gestiona el inventario y las ventas de tu organización desde un solo lugar, de forma simple y segura."

/** Nombre de marca visible con respaldo neutral (R1.7). */
const NOMBRE_MARCA = MARCA.nombre || MARCA.fallback

/** Título del panel de marca (R3.2). */
const TITULO_LOGIN = "Sistema de Inventario"

/** Mensajes de error del servidor en español, indexados por código de API */
const MENSAJES_ERROR: Record<string, string> = {
  CREDENCIALES_INVALIDAS:
    "Correo o contraseña incorrectos. Verifica tus datos e intenta de nuevo.",
  CORREO_NO_VERIFICADO:
    "Tu correo aún no ha sido verificado. Revisa tu bandeja de entrada.",
  DEMASIADOS_INTENTOS:
    "Demasiados intentos fallidos. Espera 15 minutos antes de intentarlo de nuevo.",
  SESION_INVALIDA: "La sesión no es válida. Por favor inicia sesión de nuevo.",
}

/**
 * Marca de identidad (logo + nombre "Dego").
 * El recuadro del logo usa el Color_Acento (token `accent`, hue fuera del
 * rango azul) como elemento destacado (R4.2).
 */
function BrandMark({ className }: { className?: string }) {
  return (
    <div className={className}>
      <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Boxes className="size-6" aria-hidden="true" />
      </span>
      <span className="text-xl font-bold tracking-tight">{NOMBRE_MARCA}</span>
    </div>
  )
}

export interface LoginScreenProps {
  /** Cambia la pantalla activa dentro de AuthScreens */
  onCambiarPantalla: (pantalla: "registro" | "verificacion") => void
  /** Callback invocado tras un login exitoso */
  onLoginExitoso: () => void
}

export function LoginScreen({
  onCambiarPantalla,
  onLoginExitoso,
}: LoginScreenProps) {
  const [errorServidor, setErrorServidor] = React.useState<string | null>(null)
  const [cargando, setCargando] = React.useState(false)

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      correo: "",
      contrasena: "",
    },
  })

  async function onSubmit(valores: LoginFormValues) {
    setErrorServidor(null)
    setCargando(true)

    try {
      const respuesta = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valores),
      })

      if (respuesta.ok) {
        onLoginExitoso()
        return
      }

      // Extraer código de error del cuerpo JSON
      let codigo = "CREDENCIALES_INVALIDAS"
      try {
        const cuerpo = await respuesta.json()
        codigo = cuerpo?.error?.codigo ?? codigo
      } catch {
        // Si el cuerpo no es JSON válido, usar el código por defecto
      }

      setErrorServidor(
        MENSAJES_ERROR[codigo] ??
          "Ocurrió un error inesperado. Intenta de nuevo más tarde."
      )
    } catch {
      setErrorServidor(
        "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo."
      )
    } finally {
      setCargando(false)
    }
  }

  const mostrarReenvioVerificacion =
    errorServidor === MENSAJES_ERROR.CORREO_NO_VERIFICADO

  return (
    <Card className="w-full max-w-4xl overflow-hidden p-0">
      <div className="grid lg:grid-cols-2">
        {/* ── Panel de marca (visible en >=lg) ──────────────────────────── */}
        <section className="hidden flex-col justify-between gap-8 bg-primary p-10 text-primary-foreground lg:flex">
          <BrandMark className="flex items-center gap-3" />

          <div className="space-y-3">
            <h1 className="text-3xl font-bold tracking-tight">{TITULO_LOGIN}</h1>
            <p className="max-w-sm text-sm leading-relaxed text-primary-foreground/80">
              {SUBTITULO_LOGIN}
            </p>
          </div>

          <p className="text-xs text-primary-foreground/60">
            {NOMBRE_MARCA} · {TITULO_LOGIN}
          </p>
        </section>

        {/* ── Panel de formulario ───────────────────────────────────────── */}
        <section className="bg-background text-foreground p-8 lg:p-10">
          <CardHeader className="space-y-4 pb-4 px-0 pt-0">
            {/* Encabezado compacto de marca para una sola columna (<lg) */}
            <div className="space-y-3 lg:hidden">
              <BrandMark className="flex items-center gap-3" />
              <div className="space-y-1">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">
                  {TITULO_LOGIN}
                </h1>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  {SUBTITULO_LOGIN}
                </p>
              </div>
            </div>

            <div className="space-y-1">
              <CardTitle className="text-xl font-semibold text-foreground">
                Inicia sesión
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Accede a tu cuenta para gestionar tu organización.
              </p>
            </div>
          </CardHeader>

          <CardContent className="px-0 pb-0">
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                noValidate
                className="space-y-4"
              >
                {/* Campo: correo electrónico */}
                <FormField
                  control={form.control}
                  name="correo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Correo electrónico</FormLabel>
                      <FormControl>
                        <Input
                          type="email"
                          placeholder="tu@correo.com"
                          autoComplete="email"
                          maxLength={254}
                          disabled={cargando}
                          className="border-input"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Campo: contraseña */}
                <FormField
                  control={form.control}
                  name="contrasena"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contraseña</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          placeholder="••••••••"
                          autoComplete="current-password"
                          maxLength={128}
                          disabled={cargando}
                          className="border-input"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Error del servidor */}
                {errorServidor && (
                  <p
                    role="alert"
                    className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
                  >
                    {errorServidor}
                  </p>
                )}

                {/* Botón de envío — color primario vía token de tema */}
                <Button
                  type="submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                  disabled={cargando}
                >
                  {cargando ? "Iniciando sesión…" : "Iniciar sesión"}
                </Button>
              </form>
            </Form>

            {/* Enlace a registro */}
            <div className="mt-4 text-center text-sm text-muted-foreground">
              ¿No tienes cuenta?{" "}
              <button
                type="button"
                className="font-medium text-primary underline-offset-4 hover:underline"
                onClick={() => onCambiarPantalla("registro")}
                disabled={cargando}
              >
                Regístrate
              </button>
            </div>

            {/* Enlace a reenvío de verificación (visible cuando el correo no está verificado) */}
            {mostrarReenvioVerificacion && (
              <div className="mt-2 text-center text-sm">
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline"
                  onClick={() => onCambiarPantalla("verificacion")}
                >
                  Reenviar correo de verificación
                </button>
              </div>
            )}
          </CardContent>
        </section>
      </div>
    </Card>
  )
}
