"use client"

import { Trash2 } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { ItemCarrito, CarritoTotales } from "@/lib/carrito"

interface CarritoTableProps {
  items: ItemCarrito[]
  totales: CarritoTotales
  onCambiarCantidad: (producto_id: string, cantidad: number) => void
  onEliminar: (producto_id: string) => void
}

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

export function CarritoTable({
  items,
  totales,
  onCambiarCantidad,
  onEliminar,
}: CarritoTableProps) {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">Escanea un código de barras para agregar productos</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="rounded-lg border border-border overflow-x-auto">
        <Table className="min-w-[480px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-center w-24">Cantidad</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.producto.id}>
                <TableCell>
                  <div>
                    <p className="font-medium text-sm">{item.producto.nombre}</p>
                    <p className="text-xs text-muted-foreground">{item.producto.sku}</p>
                  </div>
                </TableCell>
                <TableCell className="text-right text-sm whitespace-nowrap">
                  {formatMXN(item.producto.precio_venta)}
                </TableCell>
                <TableCell className="text-center">
                  <Input
                    type="number"
                    min="1"
                    max={item.producto.stock_actual}
                    value={item.cantidad}
                    onChange={(e) =>
                      onCambiarCantidad(item.producto.id, parseInt(e.target.value) || 1)
                    }
                    onFocus={(e) => e.target.select()}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        ;(e.target as HTMLInputElement).blur()
                      }
                    }}
                    className="w-16 text-center h-8 mx-auto"
                    aria-label={`Cantidad de ${item.producto.nombre}`}
                  />
                </TableCell>
                <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                  {formatMXN(item.producto.precio_venta * item.cantidad)}
                </TableCell>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => onEliminar(item.producto.id)}
                    aria-label={`Eliminar ${item.producto.nombre} del carrito`}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Totales pegajosos */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-1 text-sm">
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatMXN(totales.subtotal)}</span>
        </div>
        {totales.impuestos > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Impuestos</span>
            <span>{formatMXN(totales.impuestos)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-base border-t border-border pt-1">
          <span>Total</span>
          <span>{formatMXN(totales.total)}</span>
        </div>
      </div>
    </div>
  )
}
