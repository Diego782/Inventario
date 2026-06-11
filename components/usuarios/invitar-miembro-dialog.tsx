"use client"

/**
 * components/usuarios/invitar-miembro-dialog.tsx
 *
 * Formulario de invitación: correo electrónico + rol.
 * Visible solo con permiso (usuarios, administrar).
 * Envía POST /api/organizaciones/{orgId}/invitaciones
 *
 * Validates: Requirements R9.1, R9.2
 */

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { usePermisos } from "@/hooks/use-permisos"
import { invitarSchema, type InvitarInput } from "@/lib/schemas/invitaciones"
import type { RolDTO } from "@/lib/api/serializadores-auth"
import { toast } from "sonner"

// ---- Props ----

interface InvitarMiembroDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  orgId: string
  /** Callback opcional tras invitar con éxito */
  onInvitado?: () => void
}

// ---- Componente principal ----

export function InvitarMiembroDialog({
  open,
  onOpenChange,
  orgId,
  onInvitado,
}: InvitarMiembroDialogProps) {
  const { puede } = usePermisos()
  const puedeAdministrar = puede("usuarios", "administrar")

  const [roles, setRoles] = React.useState<RolDTO[]>([])
  const [cargandoRoles, setCargandoRoles] = React.useState(false)
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null)

  const form = useForm<InvitarInput>({
    resolver: zodResolver(invitarSchema),
    defaultValues: {
      correo: "",
      nombre: "",
      rol_id: "",
    },
  })

  const { isSubmitting } = form.formState

  // Cargar roles cuando se abre el diálogo
  React.useEffect(() => {
    if (!open || !puedeAdministrar) return

    setCargandoRoles(true)
    fetch(`/api/organizaciones/${orgId}/roles`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) throw new Error("No se pudieron cargar los roles")
        const data: RolDTO[] = await res.json()
        setRoles(data)
      })
      .catch(() => {
        toast.error("No se pudieron cargar los roles disponibles")
      })
      .finally(() => setCargandoRoles(false))
  }, [open, orgId, puedeAdministrar])

  async function onSubmit(values: InvitarInput) {
    setErrorGeneral(null)
    try {
      const res = await fetch(`/api/organizaciones/${orgId}/invitaciones`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo

        if (codigo === "MIEMBRO_EXISTENTE") {
          setErrorGeneral(
            "Este correo ya es miembro activo de la organización."
          )
          return
        }
        if (codigo === "ROL_FUERA_DE_ORGANIZACION") {
          setErrorGeneral("El rol seleccionado no pertenece a esta organización.")
          return
        }

        setErrorGeneral(
          data?.error?.mensaje ??
            "Ocurrió un error al enviar la invitación. Intenta de nuevo."
        )
        return
      }

      const esRegeneracion = res.status === 200
      toast.success(
        esRegeneracion
          ? `Invitación reenviada a ${values.correo}`
          : `Invitación enviada a ${values.correo}`
      )

      form.reset()
      onOpenChange(false)
      onInvitado?.()
    } catch {
      setErrorGeneral(
        "No se pudo conectar con el servidor. Verifica tu conexión e intenta de nuevo."
      )
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset()
      setErrorGeneral(null)
    }
    onOpenChange(nextOpen)
  }

  // Si no tiene permiso, no renderizar el diálogo
  if (!puedeAdministrar) return null

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invitar miembro</DialogTitle>
          <DialogDescription>
            Envía una invitación por correo para que alguien se una a la
            organización con el rol que elijas.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Campo correo */}
            <FormField
              control={form.control}
              name="correo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Correo electrónico</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="nombre@ejemplo.com"
                      autoComplete="off"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Campo nombre */}
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Nombre{" "}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="text"
                      placeholder="Nombre del invitado"
                      autoComplete="off"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Campo rol */}
            <FormField
              control={form.control}
              name="rol_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Rol</FormLabel>
                  {cargandoRoles ? (
                    <Skeleton className="h-9 w-full" />
                  ) : (
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isSubmitting || roles.length === 0}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue
                            placeholder={
                              roles.length === 0
                                ? "No hay roles disponibles"
                                : "Selecciona un rol"
                            }
                          />
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

            {errorGeneral && (
              <p className="text-sm text-destructive">{errorGeneral}</p>
            )}

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
                disabled={isSubmitting || cargandoRoles || roles.length === 0}
              >
                {isSubmitting ? "Enviando…" : "Enviar invitación"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
