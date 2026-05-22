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
import { Button } from "@/components/ui/button"
import type { ProductoDTO, MovimientoDTO } from "@/lib/api/serializadores"

interface HistorialMovimientosDialogProps {
  open: boolean
  producto: ProductoDTO | null
  onClose: () => void
}

const TIPO_COLORES: Record<string, string> = {
  entrada: "bg-green-100 text-green-700",
  devolucion: "bg-green-100 text-green-700",
  salida: "bg-red-100 text-red-700",
  merma: "bg-orange-100 text-orange-700",
  ajuste: "bg-blue-100 text-blue-700",
  venta: "bg-purple-100 text-purple-700",
}

const PAGE_SIZE = 20

export function HistorialMovimientosDialog({
  open,
  producto,
  onClose,
}: HistorialMovimientosDialogProps) {
  const [movimientos, setMovimientos] = useState<MovimientoDTO[]>([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(0)
  const [cargando, setCargando] = useState(false)

  useEffect(() => {
    if (!open || !producto) return
    setPagina(0)
  }, [open, producto])

  useEffect(() => {
    if (!open || !producto) return
    setCargando(true)
    fetch(`/api/productos/${producto.id}/movimientos?take=${PAGE_SIZE}&skip=${pagina * PAGE_SIZE}`)
      .then((r) => r.json())
      .then((data) => {
        setMovimientos(data.items ?? [])
        setTotal(data.total ?? 0)
      })
      .catch(() => {})
      .finally(() => setCargando(false))
  }, [open, producto, pagina])

  function formatFecha(iso: string) {
    return new Date(iso).toLocaleString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  const totalPaginas = Math.ceil(total / PAGE_SIZE)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Historial de Movimientos — {producto?.nombre}
          </DialogTitle>
        </DialogHeader>

        {cargando ? (
          <div className="py-8 text-center text-muted-foreground text-sm">Cargando...</div>
        ) : movimientos.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground text-sm">
            No hay movimientos registrados
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fecha</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead className="text-right">Cantidad</TableHead>
                  <TableHead className="text-right">Stock Resultante</TableHead>
                  <TableHead>Motivo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {movimientos.map((mov) => (
                  <TableRow key={mov.id}>
                    <TableCell className="text-sm text-muted-foreground">
                      {formatFecha(mov.creado_en)}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={`border-0 ${TIPO_COLORES[mov.tipo] ?? "bg-muted text-muted-foreground"}`}
                      >
                        {mov.tipo}
                      </Badge>
                    </TableCell>
                    <TableCell className={`text-right font-mono font-semibold ${mov.cantidad >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {mov.cantidad >= 0 ? `+${mov.cantidad}` : mov.cantidad}
                    </TableCell>
                    <TableCell className="text-right font-mono">
                      {mov.stock_resultante}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {mov.motivo ?? "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {totalPaginas > 1 && (
              <div className="flex justify-between items-center pt-2">
                <span className="text-sm text-muted-foreground">
                  {total} movimientos
                </span>
                <div className="flex gap-1">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina === 0}
                    onClick={() => setPagina((p) => p - 1)}
                  >
                    Anterior
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pagina + 1 >= totalPaginas}
                    onClick={() => setPagina((p) => p + 1)}
                  >
                    Siguiente
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
