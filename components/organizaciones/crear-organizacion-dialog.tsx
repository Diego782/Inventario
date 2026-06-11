"use client"

/**
 * components/organizaciones/crear-organizacion-dialog.tsx
 *
 * Diálogo de alta de Organización (nombre).
 * Usa Dialog, Form, Input, Button de shadcn/ui.
 * Envía POST /api/organizaciones y llama onCreada() al completarse.
 *
 * Validates: Requirements R8.1, R8.6
 */

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
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

import {
  crearOrganizacionSchema,
  type CrearOrganizacionInput,
} from "@/lib/schemas/organizaciones"

interface CrearOrganizacionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreada?: () => void
}

export function CrearOrganizacionDialog({
  open,
  onOpenChange,
  onCreada,
}: CrearOrganizacionDialogProps) {
  const [errorGeneral, setErrorGeneral] = React.useState<string | null>(null)

  const form = useForm<CrearOrganizacionInput>({
    resolver: zodResolver(crearOrganizacionSchema),
    defaultValues: {
      nombre: "",
    },
  })

  const { isSubmitting } = form.formState

  async function onSubmit(values: CrearOrganizacionInput) {
    setErrorGeneral(null)
    try {
      const res = await fetch("/api/organizaciones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const mensaje =
          data?.mensaje ??
          data?.error ??
          "Ocurrió un error al crear la organización. Intenta de nuevo."
        setErrorGeneral(mensaje)
        return
      }

      form.reset()
      onOpenChange(false)
      onCreada?.()
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

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nueva organización</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="nombre"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nombre</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Nombre de la organización"
                      autoComplete="off"
                      disabled={isSubmitting}
                      {...field}
                    />
                  </FormControl>
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
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "Creando…" : "Crear organización"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
