"use client"

/**
 * components/organizaciones/seleccion-organizacion.tsx
 *
 * Pantalla de selección/creación de organización.
 * Lista las organizaciones con membresía activa (orden A-Z), su Rol,
 * botón seleccionar. Estado de carga con Skeleton. Estado de error con
 * Alert + botón Reintentar (R7.6). Si no hay ninguna, muestra solo
 * "Crear organización" + mensaje de invitaciones pendientes (R7.4).
 * El botón "Crear organización" siempre está visible y abre
 * CrearOrganizacionDialog.
 *
 * Validates: Requirements R7.1–R7.7
 */

import * as React from "react"
import { Building2, Plus, RefreshCw, Mail, LogOut } from "lucide-react"
import { useTheme } from "next-themes"

import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { useSesion } from "@/hooks/use-sesion"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Skeleton } from "@/components/ui/skeleton"
import { CrearOrganizacionDialog } from "@/components/organizaciones/crear-organizacion-dialog"

export function SeleccionOrganizacion() {
  const { organizaciones, cargando, error, seleccionar, recargar } =
    useOrganizacionActiva()
  const { logout } = useSesion()
  const { theme, setTheme } = useTheme()

  // Igual que las pantallas de autenticación (marca Dego), la selección de
  // organización siempre se muestra en modo claro, sin importar el tema que
  // tenga el usuario. Se guarda la preferencia previa y se restaura al
  // desmontar (cuando se entra a la app), de modo que el usuario recupera su
  // modo (claro/oscuro) dentro del sistema.
  const temaPrevioRef = React.useRef<string | undefined>(undefined)
  React.useEffect(() => {
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

  const [seleccionando, setSeleccionando] = React.useState<string | null>(null)
  const [errorSeleccion, setErrorSeleccion] = React.useState<string | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = React.useState(false)

  async function handleSeleccionar(id: string) {
    setSeleccionando(id)
    setErrorSeleccion(null)
    try {
      await seleccionar(id)
    } catch (err) {
      const mensaje =
        err instanceof Error
          ? err.message
          : "No se pudo seleccionar la organización. Intenta de nuevo."
      setErrorSeleccion(mensaje)
    } finally {
      setSeleccionando(null)
    }
  }

  function handleCreada() {
    recargar()
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-6">
        {/* Encabezado */}
        <div className="space-y-1 text-center">
          <h1 className="text-2xl font-bold text-primary">Dego</h1>
          <p className="text-sm text-muted-foreground">
            Selecciona una organización para continuar
          </p>
        </div>

        {/* Cerrar sesión */}
        <div className="flex justify-end">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => logout()}
            className="gap-2 text-muted-foreground"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </Button>
        </div>

        {/* Estado de carga */}
        {cargando && (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
            <Skeleton className="h-20 w-full rounded-lg" />
          </div>
        )}

        {/* Estado de error al cargar */}
        {!cargando && error && (
          <Alert variant="destructive">
            <AlertTitle>No se pudieron cargar las organizaciones</AlertTitle>
            <AlertDescription className="mt-2 space-y-3">
              <p>{error}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => recargar()}
                className="gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Reintentar
              </Button>
            </AlertDescription>
          </Alert>
        )}

        {/* Error al seleccionar */}
        {errorSeleccion && (
          <Alert variant="destructive">
            <AlertDescription>{errorSeleccion}</AlertDescription>
          </Alert>
        )}

        {/* Lista de organizaciones (A-Z, ya ordenadas por el hook/API) */}
        {!cargando && !error && organizaciones.length > 0 && (
          <div className="space-y-3">
            {organizaciones.map((org) => (
              <Card key={org.id} className="transition-shadow hover:shadow-md">
                <CardContent className="flex items-center justify-between p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <Building2 className="h-5 w-5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{org.nombre}</p>
                      <Badge variant="secondary" className="mt-1 text-xs">
                        {org.rol}
                      </Badge>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    disabled={seleccionando !== null}
                    onClick={() => handleSeleccionar(org.id)}
                    className="ml-4 shrink-0"
                  >
                    {seleccionando === org.id ? "Seleccionando…" : "Seleccionar"}
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Sin organizaciones: solo crear + invitaciones pendientes */}
        {!cargando && !error && organizaciones.length === 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                No perteneces a ninguna organización
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Crea una nueva organización o acepta una invitación pendiente
                para comenzar.
              </p>
              <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground">
                <Mail className="h-4 w-4 shrink-0" />
                <span>
                  Si tienes invitaciones pendientes, revisa tu correo electrónico
                  y sigue el enlace para unirte.
                </span>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Botón "Crear organización" — siempre visible cuando no está cargando */}
        {!cargando && (
          <div className="flex justify-center">
            <Button
              variant={organizaciones.length === 0 ? "default" : "outline"}
              onClick={() => setDialogoAbierto(true)}
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              Crear organización
            </Button>
          </div>
        )}

        {/* Diálogo de creación */}
        <CrearOrganizacionDialog
          open={dialogoAbierto}
          onOpenChange={setDialogoAbierto}
          onCreada={handleCreada}
        />
      </div>
    </div>
  )
}
