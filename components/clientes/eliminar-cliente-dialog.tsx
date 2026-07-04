"use client"

/**
 * components/clientes/eliminar-cliente-dialog.tsx
 *
 * AlertDialog de confirmación para eliminar un Cliente.
 * Deshabilita el botón confirmar y muestra aviso si el cliente tiene historial
 * (ventas o movimientos de deuda asociados).
 *
 * Validates: Requirements 4.8, 4.9
 */

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
import { AlertTriangle } from "lucide-react"
import type { ClienteDTO } from "@/lib/api/serializadores"
import { toastDeError } from "@/lib/mensajes-error"

interface EliminarClienteDialogProps {
  open: boolean
  cliente: ClienteDTO | null
  /** Si es true, el cliente tiene historial y no se puede eliminar. */
  tieneHistorial?: boolean
  onClose: () => void
  onEliminado: () => void
}

export function EliminarClienteDialog({
  open,
  cliente,
  tieneHistorial = false,
  onClose,
  onEliminado,
}: EliminarClienteDialogProps) {
  const [eliminando, setEliminando] = useState(false)

  async function handleEliminar() {
    if (!cliente) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/clientes/${cliente.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo

        if (codigo === "CLIENTE_CON_HISTORIAL") {
          toast.error("No se puede eliminar: el cliente tiene ventas o movimientos de deuda.")
          onClose()
          return
        }

        toast.error(toastDeError(codigo ?? "DESCONOCIDO"))
        return
      }

      toast.success("Cliente eliminado.")
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
          <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                Esta acción eliminará al cliente{" "}
                <strong>{cliente?.nombre}</strong> (Cédula: {cliente?.cedula}).
              </p>
              {tieneHistorial && (
                <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 p-3 text-sm text-destructive">
                  <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>
                    Este cliente tiene ventas o movimientos de deuda asociados y
                    no puede eliminarse.
                  </span>
                </div>
              )}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleEliminar}
            disabled={eliminando || tieneHistorial}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50"
          >
            {eliminando ? "Eliminando..." : "Eliminar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
