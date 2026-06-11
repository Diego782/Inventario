"use client"

import { MARCA } from "@/lib/marca"
import type { VentaDTO } from "@/lib/api/serializadores"

interface TicketPreviewProps {
  venta: VentaDTO
  monto_recibido?: number
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

export function TicketPreview({ venta, monto_recibido }: TicketPreviewProps) {
  const cambio =
    venta.metodo_pago === "efectivo" && monto_recibido !== undefined && monto_recibido >= venta.total
      ? monto_recibido - venta.total
      : null

  return (
    <div
      className="imprimir-ticket font-mono text-xs bg-white text-black p-4"
      style={{ width: "var(--ticket-ancho, 80mm)", maxWidth: "100%" }}
    >
      {/* Encabezado */}
      <div className="text-center mb-3">
        <p className="font-bold text-sm">{MARCA.nombre}</p>
        <p className="text-muted-foreground">Sistema de Ventas</p>
        <p className="mt-1">Folio: <strong>{venta.folio}</strong></p>
        <p>{formatFechaHora(venta.creado_en)}</p>
      </div>

      <hr className="border-dashed border-border my-2" />

      {/* Ítems */}
      <div className="space-y-1 mb-2">
        {venta.items?.map((item) => (
          <div key={item.id} className="flex justify-between gap-2">
            <span className="flex-1 truncate">
              {item.cantidad}x #{item.producto_id.slice(-6)}
            </span>
            <span className="shrink-0">{formatMXN(item.subtotal_linea)}</span>
          </div>
        ))}
      </div>

      <hr className="border-dashed border-border my-2" />

      {/* Totales */}
      <div className="space-y-1">
        <div className="flex justify-between">
          <span>Subtotal</span>
          <span>{formatMXN(venta.subtotal)}</span>
        </div>
        {venta.impuesto > 0 && (
          <div className="flex justify-between">
            <span>Impuesto</span>
            <span>{formatMXN(venta.impuesto)}</span>
          </div>
        )}
        <div className="flex justify-between font-bold text-sm border-t border-border pt-1 mt-1">
          <span>TOTAL</span>
          <span>{formatMXN(venta.total)}</span>
        </div>
      </div>

      {/* Pago */}
      <div className="mt-2 space-y-1">
        <div className="flex justify-between">
          <span>Método de pago</span>
          <span className="capitalize">{venta.metodo_pago}</span>
        </div>
        {monto_recibido !== undefined && venta.metodo_pago === "efectivo" && (
          <div className="flex justify-between">
            <span>Recibido</span>
            <span>{formatMXN(monto_recibido)}</span>
          </div>
        )}
        {cambio !== null && (
          <div className="flex justify-between font-semibold">
            <span>Cambio</span>
            <span>{formatMXN(cambio)}</span>
          </div>
        )}
      </div>

      <hr className="border-dashed border-border my-2" />
      <p className="text-center text-muted-foreground">¡Gracias por su compra!</p>
    </div>
  )
}
