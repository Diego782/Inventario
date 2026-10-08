"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { ProductoDTO } from "@/lib/api/serializadores"

export function StockSimpleEditor({ producto, onCambio }: { producto: ProductoDTO; onCambio: () => void }) {
  const [stock, setStock] = useState(String(producto.stock_actual))
  const [minimo, setMinimo] = useState(String(producto.stock_minimo))
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    setStock(String(producto.stock_actual))
    setMinimo(String(producto.stock_minimo))
  }, [producto.id, producto.stock_actual, producto.stock_minimo])

  const stockNumero = Number(stock)
  const minimoNumero = Number(minimo)
  const valido = stock.trim() !== "" && minimo.trim() !== "" &&
    Number.isInteger(stockNumero) && stockNumero >= 0 &&
    Number.isInteger(minimoNumero) && minimoNumero >= 0
  const cambios = stockNumero !== producto.stock_actual || minimoNumero !== producto.stock_minimo

  async function guardar() {
    if (!valido || !cambios) return
    setGuardando(true)
    try {
      const respuesta = await fetch(`/api/productos/${producto.id}/ajuste-stock`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          stock_actual: stockNumero,
          stock_minimo: minimoNumero,
          stock_esperado: producto.stock_actual,
        }),
      })
      if (!respuesta.ok) {
        const datos = await respuesta.json().catch(() => null)
        throw new Error(datos?.error?.mensaje ?? "No se pudo guardar el stock.")
      }
      toast.success("Stock actualizado")
      onCambio()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de conexión")
    } finally {
      setGuardando(false)
    }
  }

  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Este producto no tiene variantes. Ajusta su stock directamente.</p>
    <div className="grid grid-cols-2 gap-3">
      <label className="space-y-1 text-sm font-medium">
        <span>Stock actual</span>
        <Input type="number" min="0" step="1" value={stock} aria-label="Stock actual del producto"
          onChange={(evento) => setStock(evento.target.value)} />
      </label>
      <label className="space-y-1 text-sm font-medium">
        <span>Stock mínimo</span>
        <Input type="number" min="0" step="1" value={minimo} aria-label="Stock mínimo del producto"
          onChange={(evento) => setMinimo(evento.target.value)} />
      </label>
    </div>
    <Button type="button" className="w-full" disabled={guardando || !valido || !cambios} onClick={() => void guardar()}>
      {guardando ? "Guardando..." : "Guardar cambios"}
    </Button>
  </div>
}
