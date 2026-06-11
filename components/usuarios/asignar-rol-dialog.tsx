"use client"

/**
 * components/usuarios/asignar-rol-dialog.tsx
 *
 * Diálogo para cambiar el Rol de una Membresía.
 * Carga los roles disponibles desde GET /api/organizaciones/{orgId}/roles.
 * Envía PATCH /api/membresias/{membresiaId} con { rol_id }.
 * Muestra toast en éxito y en error.
 *
 * Validates: Requirements R11.8, R11.9
 */

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"

import { asignarRolSchema, type AsignarRolInput } from "@/lib/schemas/roles"
import type { RolDTO } from "@/lib/api/serializadores-auth"

interface AsignarRolDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  membresiaId: string
  orgId: string
  onAsignado?: () => void
}

export function AsignarRolDialog({
  open,
  onOpenChange,
  membresiaId,
  orgId,
  onAsignado,
}: AsignarRolDialogProps) {
  const [roles, setRoles] = React.useState<RolDTO[]>([])
  const [cargandoRoles, setCargandoRoles] = React.useState(false)
  const [errorRoles, setErrorRoles] = React.useState<string | null>(null)

  const form = useForm<AsignarRolInput>({
    resolver: zodResolver(asignarRolSchema),
    defaultValues: {
      rol_id: "",
    },
  })

  const { isSubmitting } = form.formState

  // Cargar roles cuando se abre el diálogo
  React.useEffect(() => {
    if (!open) return

    async function cargarRoles() {
      setCargandoRoles(true)
      setErrorRoles(null)
      try {
        const res = await fetch(`/api/organizaciones/${orgId}/roles`, {
          credentials: "include",
        })
        if (!res.ok) {
          throw new Error("No se pudieron cargar los roles")
        }
        const data: RolDTO[] = await res.json()
        setRoles(data)
      } catch (err) {
        setErrorRoles(
          err instanceof Error
            ? err.message
            : "Ocurrió un error al cargar los roles"
        )
      } finally {
        setCargandoRoles(false)
      }
    }

    cargarRoles()
  }, [open, orgId])

  async function onSubmit(values: AsignarRolInput) {
    try {
      const res = await fetch(`/api/membresias/${membresiaId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const mensaje =
          data?.error?.mensaje ??
          data?.mensaje ??
          "No se pudo asignar el rol. Intenta de nuevo."
        toast.error(mensaje)
        return
      }

      toast.success("Rol asignado correctamente")
      form.reset()
      onOpenChange(false)
      onAsignado?.()
    } catch {
      toast.error(
        "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo."
      )
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset()
      setErrorRoles(null)
    }
    onOpenChange(nextOpen)
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-sm" aria-label="Asignar rol">
        <DialogHeader>
          <DialogTitle>Asignar Rol</DialogTitle>
          <DialogDescription>
            Selecciona el nuevo rol para este miembro.
          </DialogDescription>
        </DialogHeader>

        {cargandoRoles ? (
          <div className="space-y-3 py-2">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-9 w-24 ml-auto" />
          </div>
        ) : errorRoles ? (
          <p className="text-sm text-destructive py-2">{errorRoles}</p>
        ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              <FormField
                control={form.control}
                name="rol_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger aria-label="Seleccionar rol">
                          <SelectValue placeholder="Selecciona un rol" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {roles.map((rol) => (
                          <SelectItem key={rol.id} value={rol.id}>
                            {rol.nombre}
                            {rol.es_sistema && (
                              <span className="ml-1 text-xs text-muted-foreground">
                                (sistema)
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <Button
                  type="submit"
                  disabled={isSubmitting || roles.length === 0}
                >
                  {isSubmitting ? "Asignando…" : "Asignar rol"}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  )
}
