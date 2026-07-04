"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
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
import type { ClienteDTO } from "@/lib/api/serializadores"

// El límite superior se valida en el dominio; aquí solo ponemos mínimo > 0
const abonoSchema = z.object({
  monto: z
    .string()
    .min(1, "El monto es obligatorio")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, {
      message: "El monto debe ser mayor que 0",
    })
    .refine((v) => /^\d+(\.\d{1,2})?$/.test(v.trim()), {
      message: "El monto puede tener hasta 2 decimales",
    }),
})

type AbonoFormValues = z.infer<typeof abonoSchema>

interface RegistrarAbonoDialogProps {
  open: boolean
  cliente: ClienteDTO | null
  saldo: number
  onClose: () => void
  onAbonado: () => void
}

function formatMonto(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function RegistrarAbonoDialog({
  open,
  cliente,
  saldo,
  onClose,
  onAbonado,
}: RegistrarAbonoDialogProps) {
  const [cargando, setCargando] = useState(false)

  const form = useForm<AbonoFormValues>({
    resolver: zodResolver(abonoSchema),
    defaultValues: { monto: "" },
  })

  function handleOpenChange(v: boolean) {
    if (!v) {
      form.reset()
      onClose()
    }
  }

  async function onSubmit(values: AbonoFormValues) {
    if (!cliente) return
    const monto = Number(values.monto)

    // Validación de rango en cliente (Req 5.8)
    if (monto > saldo) {
      form.setError("monto", {
        message: `El abono no puede superar el saldo pendiente (${formatMonto(saldo)})`,
      })
      return
    }

    setCargando(true)
    try {
      const res = await fetch(`/api/deuda/${cliente.id}/abono`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monto }),
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const mensaje =
          body?.error?.message ??
          body?.message ??
          "Error al registrar el abono"
        toast.error(mensaje)
        return
      }

      toast.success(`Abono de ${formatMonto(monto)} registrado correctamente`)
      form.reset()
      onAbonado()
    } catch {
      toast.error("Error al registrar el abono. Intenta de nuevo.")
    } finally {
      setCargando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar abono</DialogTitle>
          {cliente && (
            <p className="text-sm text-muted-foreground">
              {cliente.nombre}
            </p>
          )}
        </DialogHeader>

        {/* Saldo actual */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Saldo pendiente</span>
          <span className="text-lg font-bold text-primary">{formatMonto(saldo)}</span>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="monto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Monto del abono</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                        $
                      </span>
                      <Input
                        {...field}
                        placeholder="0.00"
                        className="pl-7"
                        inputMode="decimal"
                        disabled={cargando}
                      />
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter className="gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={cargando}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={cargando}>
                {cargando ? "Registrando..." : "Registrar abono"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
