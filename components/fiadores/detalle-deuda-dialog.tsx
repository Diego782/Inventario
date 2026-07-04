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
import type { ClienteDTO, MovimientoDeudaDTO } from "@/lib/api/serializadores"

interface DetalleDeudaDialogProps {
  open: boolean
  cliente: ClienteDTO | null
  saldo: number
  onClose: () => void
}

function formatFecha(iso: string) {
  return new Date(iso).toLocaleString("es-MX", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatMonto(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

export function DetalleDeudaDialog({
  open,
  cliente,
  saldo,
  onClose,
}: DetalleDeudaDialogProps) {
  const [movimientos, setMovimientos] = useState<MovimientoDeudaDTO[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!open || !cliente) return
    setCargando(true)
    setError(null)
    fetch(`/api/deuda/${cliente.id}`)
      .then((r) => {
        if (!r.ok) throw new Error("Error al cargar el historial")
        return r.json()
      })
      .then((data) => {
        setMovimientos(data.items ?? [])
      })
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Error al cargar el historial")
      })
      .finally(() => setCargando(false))
  }, [open, cliente])

  function handleOpenChange(v: boolean) {
    if (!v) {
      setMovimientos([])
      onClose()
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Historial de deuda — {cliente?.nombre}</DialogTitle>
          {cliente && (
            <p className="text-sm text-muted-foreground">
              {cliente.telefono}
              {cliente.correo ? ` · ${cliente.correo}` : ""}
            </p>
          )}
        </DialogHeader>

        {/* Saldo actual */}
        <div className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-4 py-3">
          <span className="text-sm font-medium text-muted-foreground">Saldo pendiente</span>
          <span className="text-xl font-bold text-primary">{formatMonto(saldo)}</span>
        </div>

        {/* Historial */}
        {cargando ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Cargando historial...</div>
        ) : error ? (
          <div className="py-8 text-center text-sm text-destructive">{error}</div>
        ) : movimientos.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No hay movimientos registrados
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Fecha</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="text-right">Monto</TableHead>
                <TableHead className="text-right">Saldo resultante</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {movimientos.map((mov) => (
                <TableRow key={mov.id}>
                  <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                    {formatFecha(mov.fecha)}
                  </TableCell>
                  <TableCell>
                    {mov.tipo === "cargo" ? (
                      <Badge
                        variant="outline"
                        className="border-0 bg-red-100 text-red-700"
                      >
                        Cargo
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="border-0 bg-green-100 text-green-700"
                      >
                        Abono
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell
                    className={`text-right font-mono font-semibold ${
                      mov.tipo === "cargo" ? "text-red-600" : "text-green-600"
                    }`}
                  >
                    {mov.tipo === "cargo" ? "+" : "-"}
                    {formatMonto(mov.monto)}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {mov.saldo_resultante !== null
                      ? formatMonto(mov.saldo_resultante)
                      : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </DialogContent>
    </Dialog>
  )
}
