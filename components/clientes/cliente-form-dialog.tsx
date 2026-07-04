"use client"

/**
 * components/clientes/cliente-form-dialog.tsx
 *
 * Formulario de creación / edición de Cliente.
 * Campos obligatorios: cédula, nombre, teléfono.
 * Campos opcionales: correo, dirección.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.6, 4.10, 4.11, 4.12, 4.13
 */

import { useEffect } from "react"
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
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { crearClienteSchema, editarClienteSchema } from "@/lib/schemas/cliente"
import type { ClienteDTO } from "@/lib/api/serializadores"
import { toastDeError } from "@/lib/mensajes-error"
import type { z } from "zod"

// ---- Tipos ----

type CrearInput = z.infer<typeof crearClienteSchema>
type EditarInput = z.infer<typeof editarClienteSchema>

interface ClienteFormDialogProps {
  open: boolean
  modo: "crear" | "editar"
  cliente?: ClienteDTO
  onClose: () => void
  onGuardado: () => void
}

// ---- Componente ----

export function ClienteFormDialog({
  open,
  modo,
  cliente,
  onClose,
  onGuardado,
}: ClienteFormDialogProps) {
  const schema = modo === "crear" ? crearClienteSchema : editarClienteSchema

  const form = useForm<CrearInput>({
    resolver: zodResolver(schema as typeof crearClienteSchema),
    defaultValues: {
      cedula: "",
      nombre: "",
      telefono: "",
      correo: null,
      direccion: null,
    },
  })

  const { isSubmitting } = form.formState

  // Poblar el formulario cuando se abre en modo edición
  useEffect(() => {
    if (open && modo === "editar" && cliente) {
      form.reset({
        cedula: cliente.cedula,
        nombre: cliente.nombre,
        telefono: cliente.telefono,
        correo: cliente.correo ?? null,
        direccion: cliente.direccion ?? null,
      })
    } else if (open && modo === "crear") {
      form.reset({
        cedula: "",
        nombre: "",
        telefono: "",
        correo: null,
        direccion: null,
      })
    }
  }, [open, modo, cliente, form])

  async function onSubmit(values: CrearInput) {
    // Limpiar strings vacíos opcionales → null
    const payload: EditarInput = {
      ...values,
      correo: values.correo?.trim() || null,
      direccion: values.direccion?.trim() || null,
    }

    try {
      const url =
        modo === "editar" && cliente
          ? `/api/clientes/${cliente.id}`
          : "/api/clientes"
      const method = modo === "editar" ? "PATCH" : "POST"

      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo

        if (codigo === "CEDULA_DUPLICADA") {
          toast.error("Esa cédula ya está registrada en esta organización.")
          return
        }

        toast.error(
          toastDeError(
            codigo ?? "DESCONOCIDO",
            data?.error?.mensaje ?? "No se pudo guardar el cliente."
          )
        )
        return
      }

      toast.success(
        modo === "crear" ? "Cliente creado correctamente." : "Cliente actualizado."
      )
      onGuardado()
    } catch {
      toast.error("Error de conexión. Verifica el servidor.")
    }
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      form.reset()
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {modo === "crear" ? "Nuevo cliente" : "Editar cliente"}
          </DialogTitle>
          <DialogDescription>
            {modo === "crear"
              ? "Registra un nuevo cliente en la organización."
              : "Modifica los datos del cliente."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Cédula */}
            <FormField
              control={form.control}
              name="cedula"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Cédula <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="5–20 caracteres alfanuméricos"
                      autoComplete="off"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Nombre */}
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Nombre <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nombre completo"
                      autoComplete="off"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Teléfono */}
            <FormField
              control={form.control}
              name="telefono"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Teléfono <span className="text-destructive">*</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="7–15 dígitos"
                      autoComplete="off"
                      inputMode="tel"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Correo (opcional) */}
            <FormField
              control={form.control}
              name="correo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Correo{" "}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="nombre@ejemplo.com"
                      autoComplete="off"
                      disabled={isSubmitting}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Dirección (opcional) */}
            <FormField
              control={form.control}
              name="direccion"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    Dirección{" "}
                    <span className="text-muted-foreground font-normal">(opcional)</span>
                  </FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Calle, número, colonia..."
                      autoComplete="off"
                      disabled={isSubmitting}
                      value={field.value ?? ""}
                      onChange={(e) =>
                        field.onChange(e.target.value || null)
                      }
                    />
                  </FormControl>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting
                  ? modo === "crear"
                    ? "Guardando…"
                    : "Actualizando…"
                  : modo === "crear"
                  ? "Crear cliente"
                  : "Guardar cambios"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
