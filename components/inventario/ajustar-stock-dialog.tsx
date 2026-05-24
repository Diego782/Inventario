"use client"

import { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { VariantesEditor } from "@/components/inventario/variantes-editor"
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
  if (!producto) return null

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar Stock</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {producto.nombre} — Stock actual:{" "}
            <strong>{producto.stock_actual}</strong> {producto.unidad}
          </p>
        </DialogHeader>

        <VariantesEditor
          productoId={producto.id}
          variantes={producto.variantes ?? []}
          onCambio={onAjustado}
        />

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cerrar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
