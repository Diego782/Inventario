"use client"

import { useState } from "react"
import { toast } from "sonner"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { toastDeError } from "@/lib/mensajes-error"
import type { ProductoDTO } from "@/lib/api/serializadores"

interface EliminarProductoDialogProps {
  open: boolean
  producto: ProductoDTO | null
  onClose: () => void
  onEliminado: () => void
}

export function EliminarProductoDialog({
  open,
  producto,
  onClose,
  onEliminado,
}: EliminarProductoDialogProps) {
  const [eliminando, setEliminando] = useState(false)

  async function handleEliminar() {
    if (!producto) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/productos/${producto.id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(toastDeError(data?.error?.codigo ?? "DESCONOCIDO"))
        return
      }
      toast.success("Producto eliminado")
      onEliminado()
    } catch {
      toast.error(toastDeError("RED"))
    } finally {
      setEliminando(false)
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Eliminar producto?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción desactivará el producto{" "}
            <strong>{producto?.nombre}</strong> (Código: {producto?.codigo_barras}).
            El historial de movimientos se conservará.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEliminar}
            disabled={eliminando}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {eliminando ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
