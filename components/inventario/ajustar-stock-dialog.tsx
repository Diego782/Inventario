"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { VariantesEditor } from "@/components/inventario/variantes-editor"
import { LotesEditor } from "@/components/inventario/lotes-editor"
import { StockSimpleEditor } from "@/components/inventario/stock-simple-editor"
import type { ProductoDTO } from "@/lib/api/serializadores"

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
  const [productoActual, setProductoActual] = useState<ProductoDTO | null>(producto)
  const [mostrarVariantes, setMostrarVariantes] = useState(false)
  useEffect(() => {
    setProductoActual(producto)
    setMostrarVariantes(false)
  }, [producto?.id, open])
  if (!producto) return null

  const visible = productoActual?.id === producto.id ? productoActual : producto
  async function refrescar() {
    try {
      const respuesta = await fetch(`/api/productos/${producto!.id}`)
      if (respuesta.ok) {
        const actualizado = await respuesta.json() as ProductoDTO
        setProductoActual(actualizado)
        if (actualizado.variantes.length === 0) setMostrarVariantes(false)
      }
    } catch {
      // La tabla se refresca aun si falla la lectura del diálogo.
    } finally {
      onAjustado()
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Ajustar Stock</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {visible.nombre} — Stock actual:{" "}
            <strong>{visible.stock_actual}</strong> {visible.unidad}
          </p>
        </DialogHeader>

        {visible.controla_vencimiento
          ? <LotesEditor producto={visible} onCambio={() => void refrescar()} />
          : visible.variantes.length === 0 && !mostrarVariantes
            ? <div className="space-y-3">
              <StockSimpleEditor producto={visible} onCambio={() => void refrescar()} />
              <Button type="button" variant="ghost" className="w-full" onClick={() => setMostrarVariantes(true)}>
                Agregar una variante
              </Button>
            </div>
            : <VariantesEditor
              productoId={visible.id}
              variantes={visible.variantes}
              stockActualComun={visible.stock_actual}
              stockMinimoComun={visible.stock_minimo}
              precioPorVariante={visible.precio_por_variante ?? false}
              precioCompraComun={visible.precio_compra}
              precioVentaComun={visible.precio_venta}
              onCambio={() => void refrescar()}
            />}

        {!visible.controla_vencimiento && visible.variantes.length === 0 && mostrarVariantes &&
          <Button type="button" variant="ghost" className="w-full" onClick={() => setMostrarVariantes(false)}>
            Volver al stock sin variantes
          </Button>}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
