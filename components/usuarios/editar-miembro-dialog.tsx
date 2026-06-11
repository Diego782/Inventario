"use client"

/**
 * components/usuarios/editar-miembro-dialog.tsx
 *
 * Diálogo para editar nombre y rol de un miembro.
 * - PATCH /api/usuarios/{usuarioId}   → actualiza nombre
 * - PATCH /api/membresias/{membresiaId} → actualiza rol
 * Ambas peticiones se envían solo si el valor cambió.
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import type { MiembroDTO, RolDTO } from "@/lib/api/serializadores-auth"

// ---- Schema ----

const editarMiembroSchema = z.object({
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(160),
  // Opcional: no se envía cuando el miembro es propietario
  rol_id: z.string().uuid("Selecciona un rol válido").optional(),
})

type EditarMiembroInput = z.infer<typeof editarMiembroSchema>

// ---- Props ----

interface EditarMiembroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  miembro: MiembroDTO
  orgId: string
  onEditado?: () => void
}

// ---- Componente ----

export function EditarMiembroDialog({
  open,
  onOpenChange,
  miembro,
  orgId,
  onEditado,
}: EditarMiembroDialogProps) {
  const [roles, setRoles] = React.useState<RolDTO[]>([])
  const [cargandoRoles, setCargandoRoles] = React.useState(false)
  const esPropietario = miembro.es_propietario

  const form = useForm<EditarMiembroInput>({
    resolver: zodResolver(editarMiembroSchema),
    defaultValues: {
      nombre: miembro.usuario.nombre,
      rol_id: "",
    },
  })

  const { isSubmitting } = form.formState

  // Cargar roles y buscar el rol_id actual cuando se abre el diálogo
  React.useEffect(() => {
    if (!open) return

    form.reset({ nombre: miembro.usuario.nombre, rol_id: "" })

    setCargandoRoles(true)
    fetch(`/api/organizaciones/${orgId}/roles`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error()
        const data: RolDTO[] = await res.json()

        // El rol Propietario (es_sistema) no se puede asignar a nadie
        const rolesSinPropietario = data.filter((r) => !r.es_sistema)
        setRoles(rolesSinPropietario)

        // Pre-seleccionar el rol actual si no es propietario
        if (!miembro.es_propietario) {
          const rolActual = rolesSinPropietario.find((r) => r.nombre === miembro.rol)
          if (rolActual) form.setValue("rol_id", rolActual.id)
        }
      })
      .catch(() => toast.error("No se pudieron cargar los roles"))
      .finally(() => setCargandoRoles(false))
  }, [open, orgId, miembro, form])

  async function onSubmit(values: EditarMiembroInput) {
    const promesas: Promise<Response>[] = []

    // Solo actualizar nombre si cambió
    if (values.nombre !== miembro.usuario.nombre) {
      promesas.push(
        fetch(`/api/usuarios/${miembro.usuario.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nombre: values.nombre }),
        })
      )
    }

    // Solo actualizar rol si cambió y el miembro no es propietario
    const rolActual = roles.find((r) => r.nombre === miembro.rol)
    if (!esPropietario && values.rol_id && values.rol_id !== rolActual?.id) {
      promesas.push(
        fetch(`/api/membresias/${miembro.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rol_id: values.rol_id }),
        })
      )
    }

    if (promesas.length === 0) {
      onOpenChange(false)
      return
    }

    try {
      const resultados = await Promise.all(promesas)
      const fallido = await Promise.all(
        resultados.map(async (res) => {
          if (!res.ok) {
            const data = await res.json().catch(() => ({}))
            return (
              data?.error?.mensaje ??
              (res.status === 409 ? "No se puede cambiar el rol: se requiere al menos un propietario" : "Error al guardar cambios")
            )
          }
          return null
        })
      )

      const errores = fallido.filter(Boolean)
      if (errores.length > 0) {
        toast.error(errores[0] as string)
        return
      }

      toast.success("Miembro actualizado correctamente")
      onOpenChange(false)
      onEditado?.()
    } catch {
      toast.error("No se pudo conectar con el servidor")
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) form.reset()
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Editar miembro</DialogTitle>
          <DialogDescription>
            Modifica el nombre y el rol de{" "}
            <span className="font-medium">{miembro.usuario.correo}</span>.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Nombre */}
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nombre del miembro"
                      disabled={isSubmitting}
                      autoComplete="off"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Rol */}
            <FormField
              control={form.control}
              name="rol_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  {cargandoRoles ? (
                    <Skeleton className="h-9 w-full" />
                  ) : esPropietario ? (
                    <div className="flex h-9 items-center rounded-md border border-input bg-muted px-3 text-sm text-muted-foreground">
                      Propietario — no se puede cambiar
                    </div>
                  ) : (
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting || roles.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecciona un rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles.map((rol) => (
                          <SelectItem key={rol.id} value={rol.id}>
                            {rol.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                disabled={isSubmitting}
                onClick={() => handleOpenChange(false)}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={isSubmitting || cargandoRoles}>
                {isSubmitting ? "Guardando…" : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
