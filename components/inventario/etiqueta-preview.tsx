"use client"

import { useEffect, useRef } from "react"
import type { ProductoDTO } from "@/lib/api/serializadores"

interface EtiquetaPreviewProps {
  producto: ProductoDTO
  talla?: string
}

function formatearPrecio(valor: number): string {
  // Quitar decimales .00 para ahorrar espacio
  if (valor % 1 === 0) {
    return `$${new Intl.NumberFormat("es-MX").format(valor)}`
  }
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(valor)
}

export function EtiquetaPreview({ producto, talla }: EtiquetaPreviewProps) {
  const svgRef = useRef<SVGSVGElement>(null)

  useEffect(() => {
    if (!svgRef.current || !producto.codigo_barras) return

    import("jsbarcode").then(({ default: JsBarcode }) => {
      if (!svgRef.current) return
      const formato = producto.codigo_barras!.length === 13 ? "EAN13" : "CODE128"
      JsBarcode(svgRef.current, producto.codigo_barras!, {
        format: formato,
        height: 40,
        displayValue: true,
        fontSize: 10,
        margin: 2,
        textMargin: 2,
      })
    }).catch(() => {})
  }, [producto.codigo_barras])

  return (
    <div className="imprimir-etiqueta flex flex-col items-center justify-center p-2 border border-border rounded bg-white text-black" style={{ width: "var(--etiqueta-ancho, 50mm)", minHeight: "var(--etiqueta-alto, 30mm)" }}>
      <p className="text-xs font-medium text-center truncate w-full mb-1">
        {producto.nombre}
      </p>
      {producto.codigo_barras ? (
        <svg ref={svgRef} className="max-w-full" />
      ) : (
        <p className="text-xs text-muted-foreground">Sin código de barras</p>
      )}
      <div className="flex items-center justify-center gap-2 mt-1">
        <p className="text-sm font-bold">
          {formatearPrecio(producto.precio_venta)}
        </p>
        {talla && (
          <span className="text-sm font-bold">
            — Talla: {talla}
          </span>
        )}
      </div>
    </div>
  )
}
