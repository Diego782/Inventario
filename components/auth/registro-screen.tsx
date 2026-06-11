"use client"

/**
 * components/auth/registro-screen.tsx
 *
 * Formulario de registro con los campos correo, nombre y contraseña.
 * Usa react-hook-form + zodResolver con el registroSchema de @/lib/schemas/auth.
 * Todo el texto está en español.
 *
 * Validates: Requirements R2.1, R5.8
 */

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { registroSchema, type RegistroInput } from "@/lib/schemas/auth"
import {
  Card,
  CardContent,
  CardDescription,
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

interface RegistroScreenProps {
  onCambiarPantalla: (p: "login") => void
  /** Callback opcional invocado tras un registro exitoso (para refrescar sesión si aplica). */
  onLoginExitoso?: () => void | Promise<void>
}

export function RegistroScreen({ onCambiarPantalla, onLoginExitoso }: RegistroScreenProps) {
  const [exito, setExito] = React.useState(false)
  const [errorServidor, setErrorServidor] = React.useState<string | null>(null)

  const form = useForm<RegistroInput>({
    resolver: zodResolver(registroSchema),
    defaultValues: {
      correo: "",
      nombre: "",
      contrasena: "",
    },
  })

  async function onSubmit(datos: RegistroInput) {
    setErrorServidor(null)

    try {
      const res = await fetch("/api/auth/registro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(datos),
      })

      if (res.ok) {
        setExito(true)
        // onLoginExitoso no se invoca aquí porque el usuario debe verificar
        // su correo antes de poder iniciar sesión.
        return
      }

      const json = await res.json().catch(() => null)
      const codigo: string = json?.error?.codigo ?? ""

      if (codigo === "CORREO_DUPLICADO") {
        form.setError("correo", {
          message: "Ya existe una cuenta con ese correo electrónico.",
        })
        return
      }

      if (res.status === 422 && Array.isArray(json?.errores)) {
        for (const e of json.errores as { campo: string; mensaje: string }[]) {
          const campo = e.campo as keyof RegistroInput
          if (campo === "correo" || campo === "nombre" || campo === "contrasena") {
            form.setError(campo, { message: e.mensaje })
          }
        }
        return
      }

      // Error genérico del servidor
      const mensaje =
        json?.error?.mensaje ?? "Ocurrió un error inesperado. Intente de nuevo."
      setErrorServidor(mensaje)
    } catch {
      setErrorServidor("No se pudo conectar con el servidor. Intente de nuevo.")
    }
  }

  // Pantalla de éxito: pedir al usuario que revise su correo
  if (exito) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-sm">
          <CardHeader>
            <CardTitle className="text-center text-2xl font-bold text-primary">
              Dego
            </CardTitle>
            <CardDescription className="text-center">
              Registro exitoso
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-center text-sm text-foreground">
              Revisa tu correo y haz clic en el enlace de verificación para
              activar tu cuenta.
            </p>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => onCambiarPantalla("login")}
            >
              Ir al inicio de sesión
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold text-primary">
            Dego
          </CardTitle>
          <CardDescription className="text-center">
            Crea tu cuenta
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form
              onSubmit={form.handleSubmit(onSubmit)}
              className="space-y-4"
              noValidate
            >
              {/* Campo: Correo electrónico */}
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
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Campo: Nombre */}
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre</FormLabel>
                    <FormControl>
                      <Input
                        type="text"
                        placeholder="Tu nombre completo"
                        autoComplete="name"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Campo: Contraseña */}
              <FormField
                control={form.control}
                name="contrasena"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Contraseña</FormLabel>
                    <FormControl>
                      <Input
                        type="password"
                        placeholder="Mínimo 8 caracteres"
                        autoComplete="new-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Error de servidor */}
              {errorServidor && (
                <p
                  role="alert"
                  className="text-sm text-destructive"
                >
                  {errorServidor}
                </p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                {form.formState.isSubmitting ? "Registrando…" : "Crear cuenta"}
              </Button>
            </form>
          </Form>

          <div className="mt-4 text-center">
            <button
              type="button"
              className="text-sm text-primary underline underline-offset-4 hover:opacity-80"
              onClick={() => onCambiarPantalla("login")}
            >
              ¿Ya tienes cuenta? Inicia sesión
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
