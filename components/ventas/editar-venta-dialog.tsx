"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { toastDeError } from "@/lib/mensajes-error"
import type { VentaDTO } from "@/lib/api/serializadores"

interface EditarVentaDialogProps {
  open: boolean
  ventaId: string | null
  onClose: () => void
  onEditada: () => void
}

const METODOS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "fiado", etiqueta: "Fiado" },
]

const ESTADOS = [
  { valor: "completada", etiqueta: "Completada" },
  { valor: "pendiente", etiqueta: "Pendiente" },
  { valor: "cancelada", etiqueta: "Cancelada" },
]

export function EditarVentaDialog({
  open,
  ventaId,
  onClose,
  onEditada,
}: EditarVentaDialogProps) {
  const [venta, setVenta] = useState<VentaDTO | null>(null)
  const [cargando, setCargando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [metodoPago, setMetodoPago] = useState<string>("")
  const [estado, setEstado] = useState<string>("")

  useEffect(() => {
    if (!open || !ventaId) return
    setCargando(true)
    fetch(`/api/ventas/${ventaId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: VentaDTO | null) => {
        if (data) {
          setVenta(data)
          setMetodoPago(data.metodo_pago)
          setEstado(data.estado)
        }
      })
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [open, ventaId])

  async function handleGuardar() {
    if (!ventaId) return
    setGuardando(true)
    try {
      const res = await fetch(`/api/ventas/${ventaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metodo_pago: metodoPago, estado }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        toast.error(toastDeError(data?.error?.codigo ?? "DESCONOCIDO"))
        return
      }
      toast.success("Venta actualizada")
      onEditada()
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
          <DialogTitle>Editar Venta {venta?.folio ?? ""}</DialogTitle>
          <DialogDescription>
            Modifica el método de pago o el estado de la venta. Los ítems y el
            stock no se modifican.
          </DialogDescription>
        </DialogHeader>

        {cargando ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Cargando...
          </div>
        ) : (
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>Método de pago</Label>
              <Select value={metodoPago} onValueChange={setMetodoPago}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un método" />
                </SelectTrigger>
                <SelectContent>
                  {METODOS_PAGO.map((m) => (
                    <SelectItem key={m.valor} value={m.valor}>
                      {m.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={estado} onValueChange={setEstado}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona un estado" />
                </SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => (
                    <SelectItem key={e.valor} value={e.valor}>
                      {e.etiqueta}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button onClick={handleGuardar} disabled={guardando || cargando}>
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
