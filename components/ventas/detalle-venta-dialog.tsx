"use client"

import { useEffect, useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import type { VentaDTO } from "@/lib/api/serializadores"

interface DetalleVentaDialogProps {
  open: boolean
  ventaId: string | null
  onClose: () => void
}

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function formatFechaHora(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

export function DetalleVentaDialog({
  open,
  ventaId,
  onClose,
}: DetalleVentaDialogProps) {
  const [venta, setVenta] = useState<VentaDTO | null>(null)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!open || !ventaId) return
    setCargando(true)
    fetch(`/api/ventas/${ventaId}`)
      .then((r) => r.json())
      .then((data) => setVenta(data))
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [open, ventaId])

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Detalle de Venta {venta?.folio ?? ""}
          </DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Cargando...</div>
        ) : !venta ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No se pudo cargar la venta
          </div>
        ) : (
          <div className="space-y-4">
            {/* Encabezado */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Folio</p>
                <p className="font-mono font-semibold">{venta.folio}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Fecha</p>
                <p>{formatFechaHora(venta.creado_en)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Método de pago</p>
                <Badge variant="outline" className="capitalize">
                  {venta.metodo_pago}
                </Badge>
              </div>
              <div>
                <p className="text-muted-foreground">Estado</p>
                <Badge variant="outline" className="capitalize">
                  {venta.estado}
                </Badge>
              </div>
            </div>

            {/* Ítems */}
            <div>
              <h3 className="text-sm font-semibold mb-2">Ítems</h3>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Producto</TableHead>
                    <TableHead className="text-right">Precio Unit.</TableHead>
                    <TableHead className="text-center">Cantidad</TableHead>
                    <TableHead className="text-right">Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {venta.items?.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-mono text-xs">
                        #{item.producto_id.slice(-8)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatMXN(item.precio_unitario)}
                      </TableCell>
                      <TableCell className="text-center">{item.cantidad}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatMXN(item.subtotal_linea)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Totales */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatMXN(venta.subtotal)}</span>
              </div>
              {venta.impuesto > 0 && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Impuesto</span>
                  <span>{formatMXN(venta.impuesto)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold border-t border-border pt-1">
                <span>Total</span>
                <span>{formatMXN(venta.total)}</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
