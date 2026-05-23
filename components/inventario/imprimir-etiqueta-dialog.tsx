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
import { Printer } from "lucide-react"
import { EtiquetaPreview } from "@/components/inventario/etiqueta-preview"
import type { ProductoDTO } from "@/lib/api/serializadores"

const cantidadSchema = z.object({
  cantidad: z.number().int().min(1, "Mínimo 1 etiqueta").max(100, "Máximo 100 etiquetas"),
})

type CantidadInput = z.infer<typeof cantidadSchema>

interface ImprimirEtiquetaDialogProps {
  open: boolean
  producto: ProductoDTO | null
  onClose: () => void
}

export function ImprimirEtiquetaDialog({
  open,
  producto,
  onClose,
}: ImprimirEtiquetaDialogProps) {
  const [imprimiendo, setImprimiendo] = useState(false)

  const form = useForm<CantidadInput>({
    resolver: zodResolver(cantidadSchema),
    defaultValues: { cantidad: 1 },
  })

  const cantidad = form.watch("cantidad") || 1

  async function handleImprimir(values: CantidadInput) {
    if (!producto) return
    setImprimiendo(true)

    try {
      const res = await fetch(`/api/productos/${producto.id}/imprimir-etiqueta`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cantidad: values.cantidad }),
      })

      const contentType = res.headers.get("Content-Type") ?? ""

      if (!res.ok) {
        let mensaje = "No se pudo imprimir la etiqueta."
        if (contentType.includes("application/json")) {
          const body = await res.json().catch(() => null)
          mensaje = body?.error?.mensaje ?? mensaje
        }
        toast.error(mensaje)
        return
      }

      // Si el backend respondió con HTML, abrir en ventana nueva — el HTML llama
      // window.print() automáticamente con @page size correcto para el sticker
      if (contentType.includes("text/html")) {
        const html = await res.text()
        const win = window.open("", "_blank")
        if (win) {
          win.document.write(html)
          win.document.close()
        } else {
          toast.info("Permite las ventanas emergentes para imprimir.")
        }
        onClose()
        return
      }

      // PDF fallback (cuando hay impresora configurada en el servidor)
      if (contentType.includes("application/pdf")) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        window.open(url, "_blank")
        setTimeout(() => URL.revokeObjectURL(url), 60_000)
        onClose()
        return
      }

      toast.success(`${values.cantidad} etiqueta(s) enviada(s) a la impresora.`)
      onClose()
    } catch {
      toast.error("Error de conexión. Revise el servidor.")
    } finally {
      setImprimiendo(false)
    }
  }

  if (!producto) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Imprimir Etiqueta</DialogTitle>
          <p className="text-sm text-muted-foreground">{producto.nombre}</p>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleImprimir)} className="space-y-4">
            <FormField
              control={form.control}
              name="cantidad"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Cantidad de etiquetas (1–100)</FormLabel>
                  <FormControl>
                    <Input
                      type="number"
                      min="1"
                      max="100"
                      {...field}
                      onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div>
              <p className="text-sm text-muted-foreground mb-2">Vista previa:</p>
              <EtiquetaPreview producto={producto} />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={imprimiendo}>
                Cancelar
              </Button>
              <Button type="submit" disabled={imprimiendo}>
                <Printer className="w-4 h-4 mr-2" />
                {imprimiendo ? "Imprimiendo..." : `Imprimir ${cantidad} etiqueta(s)`}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
