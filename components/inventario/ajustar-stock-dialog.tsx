"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
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
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { ajusteStockSchema } from "@/lib/schemas/producto"
import { toastDeError } from "@/lib/mensajes-error"
import type { ProductoDTO } from "@/lib/api/serializadores"
import type { z } from "zod"

type AjusteInput = z.infer<typeof ajusteStockSchema>

const TIPOS_AJUSTE = [
  { value: "entrada", label: "Entrada" },
  { value: "salida", label: "Salida" },
  { value: "merma", label: "Merma" },
  { value: "devolucion", label: "Devolución" },
  { value: "ajuste", label: "Ajuste" },
]

interface AjustarStockDialogProps {
  open: boolean
  producto: ProductoDTO | null
  onClose: () => void
  onAjustado: () => void
}

export function AjustarStockDialog({
  open,
  producto,
  onClose,
  onAjustado,
}: AjustarStockDialogProps) {
  const [guardando, setGuardando] = useState(false)

  const form = useForm<AjusteInput>({
    resolver: zodResolver(ajusteStockSchema),
    defaultValues: {
      tipo: "entrada",
      cantidad: 1,
      motivo: "",
    },
  })

  async function onSubmit(values: AjusteInput) {
    if (!producto) return
    setGuardando(true)
    try {
      const res = await fetch(`/api/productos/${producto.id}/ajuste-stock`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      })

      const data = await res.json()

      if (!res.ok) {
        const codigo = data?.error?.codigo ?? "DESCONOCIDO"
        toast.error(toastDeError(codigo))
        return
      }

      toast.success("Stock ajustado")
      form.reset()
      onAjustado()
    } catch {
      toast.error(toastDeError("RED"))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar Stock</DialogTitle>
          {producto && (
            <p className="text-sm text-muted-foreground">
              {producto.nombre} — Stock actual:{" "}
              <strong>{producto.stock_actual}</strong> {producto.unidad}
            </p>
          )}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de ajuste *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS_AJUSTE.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad *</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="motivo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Motivo</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Descripción del ajuste (opcional)"
                      maxLength={240}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Ajustando..." : "Aplicar Ajuste"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
