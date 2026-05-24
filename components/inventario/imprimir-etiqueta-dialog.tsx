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
import { Checkbox } from "@/components/ui/checkbox"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
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
  const [incluirTalla, setIncluirTalla] = useState(false)
  const [tallaSeleccionada, setTallaSeleccionada] = useState("")

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
        body: JSON.stringify({
          cantidad: values.cantidad,
          talla: incluirTalla && tallaSeleccionada ? tallaSeleccionada : undefined,
        }),
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

      // HTML del backend con @page size correcto — imprimimos vía iframe oculto
      if (contentType.includes("text/html")) {
        const html = await res.text()
        // Quitar el window.print() automático del HTML porque lo dispararemos manualmente
        const htmlSinAutoprint = html.replace(
          /<script>window\.onload\s*=\s*function\(\)\s*\{\s*window\.print\(\);\s*\};?<\/script>/,
          ""
        )

        // Limpiar iframe previo si existe
        const previo = document.getElementById("invenpro-print-frame")
        if (previo) previo.remove()

        const iframe = document.createElement("iframe")
        iframe.id = "invenpro-print-frame"
        iframe.style.position = "fixed"
        iframe.style.right = "0"
        iframe.style.bottom = "0"
        iframe.style.width = "0"
        iframe.style.height = "0"
        iframe.style.border = "0"
        iframe.style.visibility = "hidden"
        document.body.appendChild(iframe)

        const doc = iframe.contentDocument || iframe.contentWindow?.document
        if (!doc) {
          toast.error("No se pudo preparar la impresión.")
          iframe.remove()
          return
        }

        doc.open()
        doc.write(htmlSinAutoprint)
        doc.close()

        // Esperar a que las imágenes (código de barras) carguen antes de imprimir
        const triggerPrint = () => {
          try {
            iframe.contentWindow?.focus()
            iframe.contentWindow?.print()
          } catch {
            toast.error("Error al lanzar la impresión.")
          } finally {
            // Quitar el iframe después de un tiempo generoso
            // (el diálogo de impresión puede tardar varios segundos en cerrarse)
            setTimeout(() => {
              iframe.remove()
            }, 30_000)
          }
        }

        const imgs = Array.from(doc.images)
        if (imgs.length === 0) {
          triggerPrint()
        } else {
          let pendientes = imgs.length
          const onDone = () => {
            pendientes -= 1
            if (pendientes <= 0) triggerPrint()
          }
          imgs.forEach((img) => {
            if (img.complete) {
              onDone()
            } else {
              img.addEventListener("load", onDone, { once: true })
              img.addEventListener("error", onDone, { once: true })
            }
          })
          // Fallback de seguridad
          setTimeout(triggerPrint, 1500)
        }

        onClose()
        return
      }

      // Cuando hay impresora CUPS configurada en el servidor
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

            {/* Opción de incluir talla */}
            {producto.variantes && producto.variantes.length > 0 && (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="incluir-talla"
                    checked={incluirTalla}
                    onCheckedChange={(v) => {
                      setIncluirTalla(!!v)
                      if (!v) setTallaSeleccionada("")
                    }}
                  />
                  <label htmlFor="incluir-talla" className="text-sm cursor-pointer">
                    Incluir talla en la etiqueta
                  </label>
                </div>
                {incluirTalla && (
                  <Select value={tallaSeleccionada} onValueChange={setTallaSeleccionada}>
                    <SelectTrigger className="w-32 h-8">
                      <SelectValue placeholder="Talla" />
                    </SelectTrigger>
                    <SelectContent>
                      {producto.variantes.map((v) => (
                        <SelectItem key={v.id} value={v.talla}>{v.talla}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            <div>
              <p className="text-sm text-muted-foreground mb-2">Vista previa:</p>
              <EtiquetaPreview producto={producto} talla={incluirTalla ? tallaSeleccionada : undefined} />
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
