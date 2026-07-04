"use client"

/**
 * components/usuarios/rol-form-dialog.tsx
 *
 * Diálogo de alta y edición de Rol.
 * Campos: nombre (texto) + matriz de checkboxes (sección × acción).
 *
 * Modo creación: POST /api/organizaciones/{orgId}/roles
 * Modo edición:  PATCH /api/roles/{rolId}
 *   - Carga el rol existente desde GET /api/organizaciones/{orgId}/roles
 *     y pre-rellena el formulario.
 *
 * Validates: Requirements R11.3, R11.5
 */

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ScrollArea } from "@/components/ui/scroll-area"

import { SECCIONES, ACCIONES, type Seccion, type Accion } from "@/lib/auth/secciones"
import type { RolDTO } from "@/lib/api/serializadores-auth"

// ---- Esquema del formulario ----

const rolFormSchema = z.object({
  nombre: z
    .string()
    .trim()
    .min(1, "El nombre es obligatorio")
    .max(80, "El nombre no puede superar 80 caracteres"),
  permisos: z.array(
    z.object({
      seccion: z.enum(SECCIONES),
      accion: z.enum(ACCIONES),
    })
  ),
})

type RolFormValues = z.infer<typeof rolFormSchema>

// ---- Etiquetas en español ----

const ETIQUETA_SECCION: Record<Seccion, string> = {
  dashboard: "Dashboard",
  inventario: "Inventario",
  ventas: "Ventas",
  fiadores: "Fiadores",
  horarios: "Horarios",
  configuracion: "Configuración",
  usuarios: "Empleados",
  clientes: "Clientes",
}

const ETIQUETA_ACCION: Record<Accion, string> = {
  ver: "Ver",
  crear: "Crear",
  editar: "Editar",
  eliminar: "Eliminar",
  administrar: "Administrar",
}

// ---- Props ----

interface RolFormDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  /** Si se proporciona, el diálogo opera en modo edición */
  rolId?: string
  onGuardado?: () => void
}

// ---- Helpers ----

function tienePermiso(
  permisos: Array<{ seccion: string; accion: string }>,
  seccion: Seccion,
  accion: Accion
): boolean {
  return permisos.some((p) => p.seccion === seccion && p.accion === accion)
}

function togglePermiso(
  permisos: Array<{ seccion: Seccion; accion: Accion }>,
  seccion: Seccion,
  accion: Accion,
  checked: boolean
): Array<{ seccion: Seccion; accion: Accion }> {
  if (checked) {
    if (tienePermiso(permisos, seccion, accion)) return permisos
    return [...permisos, { seccion, accion }]
  }
  return permisos.filter((p) => !(p.seccion === seccion && p.accion === accion))
}

// ---- Componente principal ----

export function RolFormDialog({
  open,
  onOpenChange,
  orgId,
  rolId,
  onGuardado,
}: RolFormDialogProps) {
  const esEdicion = Boolean(rolId)

  const [cargandoRol, setCargandoRol] = React.useState(false)
  const [errorCarga, setErrorCarga] = React.useState<string | null>(null)
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null)

  const form = useForm<RolFormValues>({
    resolver: zodResolver(rolFormSchema),
    defaultValues: {
      nombre: "",
      permisos: [],
    },
  })

  const { isSubmitting } = form.formState

  // Cargar datos del rol cuando se abre en modo edición
  React.useEffect(() => {
    if (!open) return
    if (!rolId) {
      // Modo creación: limpiar el formulario
      form.reset({ nombre: "", permisos: [] })
      setErrorCarga(null)
      setErrorGeneral(null)
      return
    }

    // Modo edición: cargar el rol desde la API
    setCargandoRol(true)
    setErrorCarga(null)
    setErrorGeneral(null)

    fetch(`/api/organizaciones/${orgId}/roles`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudo cargar el rol")
        const roles: RolDTO[] = await res.json()
        const rol = roles.find((r) => r.id === rolId)
        if (!rol) throw new Error("Rol no encontrado")
        form.reset({
          nombre: rol.nombre,
          permisos: rol.permisos as Array<{ seccion: Seccion; accion: Accion }>,
        })
      })
      .catch((err) => {
        setErrorCarga(
          err instanceof Error ? err.message : "Error al cargar el rol"
        )
      })
      .finally(() => setCargandoRol(false))
  }, [open, rolId, orgId, form])

  async function onSubmit(values: RolFormValues) {
    setErrorGeneral(null)
    try {
      const url = esEdicion
        ? `/api/roles/${rolId}`
        : `/api/organizaciones/${orgId}/roles`
      const method = esEdicion ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo

        if (codigo === "ROL_PROPIETARIO_PROTEGIDO") {
          setErrorGeneral("El Rol Propietario no puede modificarse.")
          return
        }
        if (codigo === "ROL_INVALIDO") {
          setErrorGeneral(
            data?.error?.mensaje ?? "Datos del rol inválidos. Revisa el nombre y los permisos."
          )
          return
        }

        setErrorGeneral(
          data?.error?.mensaje ?? "No se pudo guardar el rol. Intenta de nuevo."
        )
        return
      }

      toast.success(
        esEdicion
          ? `Rol "${values.nombre}" actualizado`
          : `Rol "${values.nombre}" creado`
      )
      onOpenChange(false)
      onGuardado?.()
    } catch {
      setErrorGeneral(
        "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo."
      )
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset({ nombre: "", permisos: [] })
      setErrorCarga(null)
      setErrorGeneral(null)
    }
    onOpenChange(nextOpen)
  }

  // ---- Render ----

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {esEdicion ? "Editar rol" : "Nuevo rol"}
          </DialogTitle>
          <DialogDescription>
            {esEdicion
              ? "Modifica el nombre y los permisos del rol."
              : "Define el nombre y los permisos del nuevo rol."}
          </DialogDescription>
        </DialogHeader>

        {cargandoRol ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-48 w-full" />
          </div>
        ) : errorCarga ? (
          <p className="py-4 text-sm text-destructive">{errorCarga}</p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
              {/* Campo nombre */}
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nombre del rol</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Ej. Vendedor, Supervisor…"
                        autoComplete="off"
                        disabled={isSubmitting}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Matriz de permisos */}
              <FormField
                control={form.control}
                name="permisos"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Permisos</FormLabel>
                    <FormControl>
                      <ScrollArea className="h-80 rounded-md border">
                        <div className="p-3">
                          <table className="w-full text-sm">
                            <thead>
                              <tr>
                                <th className="py-1 pr-4 text-left font-medium text-muted-foreground w-32">
                                  Sección
                                </th>
                                {ACCIONES.map((accion) => (
                                  <th
                                    key={accion}
                                    className="py-1 px-2 text-center font-medium text-muted-foreground"
                                  >
                                    {ETIQUETA_ACCION[accion]}
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {SECCIONES.map((seccion) => (
                                <tr
                                  key={seccion}
                                  className="border-t border-border/50"
                                >
                                  <td className="py-2 pr-4 font-medium">
                                    {ETIQUETA_SECCION[seccion] ?? (seccion.charAt(0).toUpperCase() + seccion.slice(1))}
                                  </td>
                                  {ACCIONES.map((accion) => {
                                    const checked = tienePermiso(
                                      field.value,
                                      seccion,
                                      accion
                                    )
                                    return (
                                      <td
                                        key={accion}
                                        className="py-2 px-2 text-center"
                                      >
                                        <Checkbox
                                          checked={checked}
                                          disabled={isSubmitting}
                                          aria-label={`Permiso ${ETIQUETA_ACCION[accion]} en ${ETIQUETA_SECCION[seccion]}`}
                                          onCheckedChange={(value) => {
                                            field.onChange(
                                              togglePermiso(
                                                field.value as Array<{
                                                  seccion: Seccion
                                                  accion: Accion
                                                }>,
                                                seccion,
                                                accion,
                                                Boolean(value)
                                              )
                                            )
                                          }}
                                        />
                                      </td>
                                    )
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </ScrollArea>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Error general */}
              {errorGeneral && (
                <p className="text-sm text-destructive">{errorGeneral}</p>
              )}

              {/* Botones */}
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isSubmitting}
                  onClick={() => handleOpenChange(false)}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting
                    ? esEdicion
                      ? "Guardando…"
                      : "Creando…"
                    : esEdicion
                      ? "Guardar cambios"
                      : "Crear rol"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
