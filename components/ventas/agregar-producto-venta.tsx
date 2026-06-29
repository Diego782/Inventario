"use client"

/**
 * components/ventas/agregar-producto-venta.tsx
 *
 * Buscador de productos para la Nueva Venta. Permite buscar un producto por
 * nombre o código de barras y, si el producto maneja tallas (variantes),
 * elegir la talla y la cantidad antes de agregarlo al carrito.
 */

import { useState, useEffect, useCallback } from "react"
import { Plus, Search } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { ProductoDTO, VarianteDTO } from "@/lib/api/serializadores"

interface AgregarProductoVentaProps {
  onAgregarSimple: (producto: ProductoDTO) => void
  onAgregarVariante: (
    producto: ProductoDTO,
    variante: { id: string; talla: string; stock_actual: number },
    cantidad: number
  ) => void
}

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

export function AgregarProductoVenta({
  onAgregarSimple,
  onAgregarVariante,
}: AgregarProductoVentaProps) {
  const [busqueda, setBusqueda] = useState("")
  const debounced = useDebouncedValue(busqueda, 300)
  const [resultados, setResultados] = useState<ProductoDTO[]>([])
  const [cargando, setCargando] = useState(false)

  // Producto seleccionado para elegir talla/cantidad
  const [seleccionado, setSeleccionado] = useState<ProductoDTO | null>(null)
  const [varianteId, setVarianteId] = useState<string>("")
  const [cantidad, setCantidad] = useState(1)

  const buscar = useCallback(async () => {
    if (!debounced.trim()) {
      setResultados([])
      return
    }
    setCargando(true)
    try {
      const res = await fetch(
        `/api/productos?q=${encodeURIComponent(debounced.trim())}&take=8`
      )
      if (res.ok) {
        const data = await res.json()
        setResultados(Array.isArray(data.items) ? data.items : [])
      }
    } catch {
      // Silencioso
    } finally {
      setCargando(false)
    }
  }, [debounced])

  useEffect(() => { buscar() }, [buscar])

  function elegir(producto: ProductoDTO) {
    setSeleccionado(producto)
    setCantidad(1)
    // Preseleccionar la primera variante con stock, si existe
    const conStock = producto.variantes?.find((v) => v.stock_actual > 0)
    setVarianteId(conStock?.id ?? producto.variantes?.[0]?.id ?? "")
    setResultados([])
    setBusqueda("")
  }

  function confirmar() {
    if (!seleccionado) return
    const tieneVariantes = (seleccionado.variantes?.length ?? 0) > 0

    if (tieneVariantes) {
      const variante = seleccionado.variantes!.find((v) => v.id === varianteId)
      if (!variante) return
      onAgregarVariante(
        seleccionado,
        { id: variante.id, talla: variante.talla, stock_actual: variante.stock_actual },
        cantidad
      )
    } else {
      onAgregarSimple(seleccionado)
    }
    // Reset
    setSeleccionado(null)
    setVarianteId("")
    setCantidad(1)
  }

  const varianteSel: VarianteDTO | undefined = seleccionado?.variantes?.find(
    (v) => v.id === varianteId
  )
  const topeCantidad = varianteSel?.stock_actual ?? seleccionado?.stock_actual ?? 1

  return (
    <div className="rounded-lg border border-border p-3 space-y-3">
      {/* Buscador */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar producto por nombre o código..."
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Resultados de búsqueda */}
      {busqueda.trim() !== "" && (
        <div className="max-h-48 overflow-y-auto space-y-1">
          {cargando && (
            <p className="text-sm text-muted-foreground px-2 py-1">Buscando...</p>
          )}
          {!cargando && resultados.length === 0 && (
            <p className="text-sm text-muted-foreground px-2 py-1">Sin resultados</p>
          )}
          {resultados.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => elegir(p)}
              className="w-full text-left px-2 py-2 rounded hover:bg-muted/60 flex items-center justify-between gap-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium truncate">{p.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {formatMXN(p.precio_venta)} · Stock: {p.stock_actual}
                  {(p.variantes?.length ?? 0) > 0 && " · con tallas"}
                </p>
              </div>
              <Plus className="w-4 h-4 shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {/* Selección de talla y cantidad */}
      {seleccionado && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-sm font-medium">{seleccionado.nombre}</p>

          <div className="flex items-end gap-2">
            {(seleccionado.variantes?.length ?? 0) > 0 && (
              <div className="flex-1">
                <label className="text-xs text-muted-foreground">Talla</label>
                <Select value={varianteId} onValueChange={setVarianteId}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Talla" />
                  </SelectTrigger>
                  <SelectContent>
                    {seleccionado.variantes!.map((v) => (
                      <SelectItem
                        key={v.id}
                        value={v.id}
                        disabled={v.stock_actual <= 0}
                      >
                        {v.talla} ({v.stock_actual} disp.)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="w-24">
              <label className="text-xs text-muted-foreground">Cantidad</label>
              <Input
                type="number"
                min={1}
                max={topeCantidad}
                value={cantidad}
                onChange={(e) => setCantidad(Math.max(1, parseInt(e.target.value) || 1))}
                className="h-9"
              />
            </div>

            <Button
              type="button"
              className="h-9"
              onClick={confirmar}
              disabled={(seleccionado.variantes?.length ?? 0) > 0 && !varianteId}
            >
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>

          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => setSeleccionado(null)}
          >
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
