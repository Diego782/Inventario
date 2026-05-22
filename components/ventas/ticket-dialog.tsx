"use client"

import { useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Printer, Plus } from "lucide-react"
import { TicketPreview } from "@/components/ventas/ticket-preview"
import { useConfiguracion } from "@/hooks/use-configuracion"
import type { VentaDTO } from "@/lib/api/serializadores"

interface TicketDialogProps {
  open: boolean
  venta: VentaDTO | null
  monto_recibido?: number
  onClose: () => void
  onNuevaVenta: () => void
}

export function TicketDialog({
  open,
  venta,
  monto_recibido,
  onClose,
  onNuevaVenta,
}: TicketDialogProps) {
  const { data: config } = useConfiguracion()

  // Auto-imprimir si está configurado
  useEffect(() => {
    if (open && venta && config.imprimir_automaticamente) {
      const timer = setTimeout(() => {
        window.print()
      }, 500)
      return () => clearTimeout(timer)
    }
  }, [open, venta, config.imprimir_automaticamente])

  function handleImprimir() {
    window.print()
  }

  function handleNuevaVenta() {
    onClose()
    onNuevaVenta()
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Ticket de Venta</DialogTitle>
        </DialogHeader>

        {venta ? (
          <div className="overflow-y-auto max-h-[60vh]">
            <TicketPreview venta={venta} monto_recibido={monto_recibido} />
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground text-sm">
            Cargando ticket...
          </div>
        )}

        <DialogFooter className="flex gap-2">
          <Button variant="outline" onClick={handleImprimir} className="flex-1">
            <Printer className="w-4 h-4 mr-2" />
            Imprimir ticket
          </Button>
          <Button onClick={handleNuevaVenta} className="flex-1">
            <Plus className="w-4 h-4 mr-2" />
            Nueva venta
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
