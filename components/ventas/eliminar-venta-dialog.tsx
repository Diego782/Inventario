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

interface EliminarVentaDialogProps {
  open: boolean
  ventaId: string | null
  folio?: string | null
  onClose: () => void
  onEliminada: () => void
}

export function EliminarVentaDialog({
  open,
  ventaId,
  folio,
  onClose,
  onEliminada,
}: EliminarVentaDialogProps) {
  const [eliminando, setEliminando] = useState(false)

  async function handleEliminar() {
    if (!ventaId) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/ventas/${ventaId}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(toastDeError(data?.error?.codigo ?? "DESCONOCIDO"))
        return
      }
      toast.success("Venta eliminada y stock revertido")
      onEliminada()
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
          <AlertDialogTitle>¿Eliminar venta?</AlertDialogTitle>
          <AlertDialogDescription>
            Esta acción eliminará la venta{" "}
            <strong>{folio ?? ""}</strong> de forma permanente y devolverá
            el stock vendido a los productos. Esta operación no se puede
            deshacer.
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
