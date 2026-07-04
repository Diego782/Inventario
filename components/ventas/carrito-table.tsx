"use client"

/**
 * components/ventas/carrito-table.tsx
 * Tabla del carrito con soporte de descuentos por producto y descuento total.
 * Recalcula totales en vivo usando calcularTotalesVenta (lib/dominio/descuentos.ts).
 *
 * Req 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8
 */

import { Trash2, Tag } from "lucide-react"
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
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Label } from "@/components/ui/label"
import { calcularTotalesVenta, DescuentoInvalidoError } from "@/lib/dominio/descuentos"
import type { ItemCarrito } from "@/lib/carrito"

// ---- Tipos ----

/** Descuento por producto keyed por la clave del carrito */
export type DescuentosProducto = Record<string, number>

export type CarritoTableTotales = {
  subtotalesLinea: number[]
  subtotal: number
  descuentoTotalAplicado: number
  baseImponible: number
  impuesto: number
  total: number
  errorDescuento?: string
}

interface CarritoTableProps {
  items: ItemCarrito[]
  porcentajeImpuesto: number
  descuentosProducto: DescuentosProducto
  descuentoTotal: number
  onCambiarCantidad: (clave: string, cantidad: number) => void
  onEliminar: (clave: string) => void
  onDescuentoProductoChange: (clave: string, descuento: number) => void
  onDescuentoTotalChange: (descuento: number) => void
  /** Callback para que el padre reciba los totales calculados */
  onTotalesChange: (totales: CarritoTableTotales) => void
}

// ---- Helpers ----

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

function claveDe(item: ItemCarrito): string {
  return item.variante_id ? `${item.producto.id}::${item.variante_id}` : item.producto.id
}

/** Calcula totales con descuentos, capturando errores de validación */
export function calcularTotalesConDescuentos(
  items: ItemCarrito[],
  descuentosProducto: DescuentosProducto,
  descuentoTotal: number,
  porcentajeImpuesto: number
): CarritoTableTotales {
  const lineas = items.map((item) => {
    const clave = claveDe(item)
    return {
      precio_unitario: item.producto.precio_venta,
      cantidad: item.cantidad,
      descuento_producto: descuentosProducto[clave] ?? 0,
    }
  })

  try {
    const resultado = calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)
    return {
      subtotalesLinea: resultado.subtotalesLinea,
      subtotal: resultado.subtotal,
      descuentoTotalAplicado: resultado.descuentoTotalAplicado,
      baseImponible: resultado.baseImponible,
      impuesto: resultado.impuesto,
      total: resultado.total,
    }
  } catch (err) {
    // Error de descuento inválido: devolver totales sin descuentos aplicados
    const subtotalesLinea = items.map((item) =>
      item.producto.precio_venta * item.cantidad
    )
    const subtotal = subtotalesLinea.reduce((acc, v) => acc + v, 0)
    const impuesto = porcentajeImpuesto > 0 ? subtotal * porcentajeImpuesto / 100 : 0
    const total = subtotal + impuesto
    return {
      subtotalesLinea,
      subtotal,
      descuentoTotalAplicado: 0,
      baseImponible: subtotal,
      impuesto,
      total,
      errorDescuento:
        err instanceof DescuentoInvalidoError
          ? err.message
          : "Error al calcular descuentos",
    }
  }
}

// ---- Componente ----

export function CarritoTable({
  items,
  porcentajeImpuesto,
  descuentosProducto,
  descuentoTotal,
  onCambiarCantidad,
  onEliminar,
  onDescuentoProductoChange,
  onDescuentoTotalChange,
  onTotalesChange,
}: CarritoTableProps) {
  // Calcular totales en cada render. El padre (nueva-venta-dialog) recalcula por su cuenta
  // usando calcularTotalesConDescuentos con el mismo estado para pasar el total a PagoForm.
  const totales = calcularTotalesConDescuentos(
    items,
    descuentosProducto,
    descuentoTotal,
    porcentajeImpuesto
  )

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">Escanea un código de barras o agrega un producto</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-2">
      {/* Error de descuento */}
      {totales.errorDescuento && (
        <Alert variant="destructive" className="py-2">
          <AlertDescription className="text-xs">{totales.errorDescuento}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-border overflow-x-auto">
        <Table className="min-w-[600px]">
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Producto</TableHead>
              <TableHead className="text-right">Precio</TableHead>
              <TableHead className="text-center w-24">Cantidad</TableHead>
              <TableHead className="text-right w-28">Descuento</TableHead>
              <TableHead className="text-right">Subtotal</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item, idx) => {
              const clave = claveDe(item)
              const tope = item.stock_disponible ?? item.producto.stock_actual
              const descProd = descuentosProducto[clave] ?? 0
              const subtotalBruto = item.producto.precio_venta * item.cantidad
              const subtotalLinea = totales.subtotalesLinea[idx] ?? subtotalBruto
              const descExcedeLinea = descProd > subtotalBruto

              return (
                <TableRow key={clave}>
                  <TableCell>
                    <div>
                      <p className="font-medium text-sm">
                        {item.producto.nombre}
                        {item.variante_talla && (
                          <span className="ml-2 inline-flex items-center rounded bg-primary/10 text-primary px-1.5 py-0.5 text-xs font-semibold">
                            Talla {item.variante_talla}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">{item.producto.codigo_barras}</p>
                    </div>
                  </TableCell>
                  <TableCell className="text-right text-sm whitespace-nowrap">
                    {formatMXN(item.producto.precio_venta)}
                  </TableCell>
                  <TableCell className="text-center">
                    <Input
                      type="number"
                      min="1"
                      max={tope}
                      value={item.cantidad}
                      onChange={(e) =>
                        onCambiarCantidad(clave, parseInt(e.target.value) || 1)
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
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      max={subtotalBruto}
                      value={descProd === 0 ? "" : descProd}
                      placeholder="0.00"
                      onChange={(e) => {
                        const val = parseFloat(e.target.value)
                        onDescuentoProductoChange(clave, isNaN(val) ? 0 : Math.max(0, val))
                      }}
                      onFocus={(e) => e.target.select()}
                      className={`w-24 text-right h-8 ml-auto ${descExcedeLinea ? "border-destructive focus-visible:ring-destructive" : ""}`}
                      aria-label={`Descuento de ${item.producto.nombre}`}
                      aria-invalid={descExcedeLinea}
                      aria-describedby={descExcedeLinea ? `desc-err-${clave}` : undefined}
                    />
                    {descExcedeLinea && (
                      <p
                        id={`desc-err-${clave}`}
                        className="text-xs text-destructive mt-0.5 text-right"
                        role="alert"
                      >
                        Excede el subtotal
                      </p>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-semibold text-sm whitespace-nowrap">
                    {formatMXN(subtotalLinea)}
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => onEliminar(clave)}
                      aria-label={`Eliminar ${item.producto.nombre} del carrito`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {/* Descuento total + resumen */}
      <div className="bg-muted/50 rounded-lg p-3 space-y-2 text-sm">
        {/* Subtotal de líneas */}
        <div className="flex justify-between">
          <span className="text-muted-foreground">Subtotal</span>
          <span>{formatMXN(totales.subtotal)}</span>
        </div>

        {/* Campo de descuento total */}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="descuento-total" className="flex items-center gap-1 text-muted-foreground shrink-0">
            <Tag className="w-3.5 h-3.5" />
            Descuento total
          </Label>
          <div className="flex items-center gap-2">
            <Input
              id="descuento-total"
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={descuentoTotal === 0 ? "" : descuentoTotal}
              onChange={(e) => {
                const val = parseFloat(e.target.value)
                onDescuentoTotalChange(isNaN(val) ? 0 : Math.max(0, val))
              }}
              onFocus={(e) => e.target.select()}
              className={`w-28 text-right h-7 ${descuentoTotal > totales.subtotal && !totales.errorDescuento ? "border-destructive" : ""}`}
              aria-label="Descuento sobre el total"
              aria-invalid={descuentoTotal > totales.subtotal}
            />
          </div>
        </div>

        {/* Validación descuento total */}
        {descuentoTotal > 0 && descuentoTotal > totales.subtotal && (
          <p className="text-xs text-destructive" role="alert">
            El descuento total excede la suma de subtotales ({formatMXN(totales.subtotal)}).
          </p>
        )}

        {/* Impuestos */}
        {totales.impuesto > 0 && (
          <div className="flex justify-between">
            <span className="text-muted-foreground">Impuestos</span>
            <span>{formatMXN(totales.impuesto)}</span>
          </div>
        )}

        {/* Total final */}
        <div className="flex justify-between font-bold text-base border-t border-border pt-1">
          <span>Total</span>
          <span>{formatMXN(totales.total)}</span>
        </div>
      </div>
    </div>
  )
}
