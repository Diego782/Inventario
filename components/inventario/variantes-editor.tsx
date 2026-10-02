"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Plus, Trash2 } from "lucide-react"
import { GestionarTallasDialog } from "@/components/inventario/gestionar-tallas-dialog"
import type { VarianteDTO } from "@/lib/api/serializadores"

interface VariantesEditorProps {
  productoId: string
  variantes: VarianteDTO[]
  stockActualComun: number
  stockMinimoComun: number
  precioPorVariante: boolean
  precioCompraComun: number
  precioVentaComun: number
  onCambio: () => void
}

export function VariantesEditor({ productoId, variantes: variantesIniciales, stockActualComun, stockMinimoComun, precioPorVariante, precioCompraComun, precioVentaComun, onCambio }: VariantesEditorProps) {
  const [variantes, setVariantes] = useState<VarianteDTO[]>(variantesIniciales)
  const [tallasDisponibles, setTallasDisponibles] = useState<string[]>([])
  const [nuevaTalla, setNuevaTalla] = useState("")
  const [nuevoStock, setNuevoStock] = useState(variantesIniciales.length === 0 ? stockActualComun : 0)
  const [nuevoStockMinimo, setNuevoStockMinimo] = useState(variantesIniciales.length === 0 ? stockMinimoComun : 0)
  const [nuevoPrecioCompra, setNuevoPrecioCompra] = useState<number | null>(null)
  const [nuevoPrecioVenta, setNuevoPrecioVenta] = useState<number | null>(null)
  const [agregando, setAgregando] = useState(false)
  const [gestionarTallas, setGestionarTallas] = useState(false)

  // Sincronizar si cambian las variantes provistas (p. ej. al abrir otro producto)
  useEffect(() => {
    setVariantes(variantesIniciales)
    if (variantesIniciales.length === 0) {
      setNuevoStock(stockActualComun)
      setNuevoStockMinimo(stockMinimoComun)
    }
  }, [variantesIniciales, stockActualComun, stockMinimoComun])

  function cargarTallas() {
    fetch("/api/tallas")
      .then((r) => r.json())
      .then((data) => setTallasDisponibles(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  // Recarga las variantes desde la API para reflejar cambios sin cerrar el diálogo
  async function recargarVariantes() {
    try {
      const res = await fetch(`/api/productos/${productoId}/variantes`)
      if (res.ok) {
        const data = await res.json()
        setVariantes(Array.isArray(data) ? data : [])
      }
    } catch {
      // Silencioso: se mantiene el estado previo
    }
    // Notificar al padre para refrescar la tabla/resumen subyacente
    onCambio()
  }

  useEffect(() => { cargarTallas() }, [])

  // Filtrar tallas que ya están usadas
  const tallasLibres = tallasDisponibles.filter(
    (t) => !variantes.some((v) => v.talla === t)
  )

  async function handleAgregar() {
    if (!nuevaTalla || (precioPorVariante && (nuevoPrecioCompra === null || nuevoPrecioVenta === null))) return
    setAgregando(true)
    try {
      const res = await fetch(`/api/productos/${productoId}/variantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talla: nuevaTalla,
          stock_actual: nuevoStock,
          stock_minimo: nuevoStockMinimo,
          precio_compra: precioPorVariante ? nuevoPrecioCompra : null,
          precio_venta: precioPorVariante ? nuevoPrecioVenta : null,
        }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al agregar variante")
        return
      }
      setNuevaTalla("")
      setNuevoStock(0)
      setNuevoStockMinimo(0)
      setNuevoPrecioCompra(null)
      setNuevoPrecioVenta(null)
      await recargarVariantes()
      toast.success(`Variante ${nuevaTalla} agregada`)
    } catch {
      toast.error("Error de conexión")
    } finally {
      setAgregando(false)
    }
  }

  async function handleEditarStock(varianteId: string, stock: number) {
    try {
      const res = await fetch(`/api/productos/${productoId}/variantes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variante_id: varianteId, stock_actual: stock }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al actualizar stock")
        return
      }
      await recargarVariantes()
    } catch {
      toast.error("Error de conexión")
    }
  }

  async function handleEditarCampo(varianteId: string, campo: "precio_compra" | "precio_venta" | "stock_minimo", valor: number) {
    try {
      const res = await fetch(`/api/productos/${productoId}/variantes`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variante_id: varianteId, [campo]: valor }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al actualizar variante")
        return
      }
      await recargarVariantes()
    } catch {
      toast.error("Error de conexión")
    }
  }

  async function handleEliminar(varianteId: string, talla: string) {
    if (!confirm(`¿Eliminar la variante ${talla}?`)) return
    try {
      const res = await fetch(`/api/productos/${productoId}/variantes`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ variante_id: varianteId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al eliminar")
        return
      }
      await recargarVariantes()
      toast.success(`Variante ${talla} eliminada`)
    } catch {
      toast.error("Error de conexión")
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium">Variantes</p>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="h-5 w-5 rounded-full"
          onClick={() => setGestionarTallas(true)}
        >
          <Plus className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Lista de variantes existentes */}
      {variantes.length > 0 && (
        <div className="space-y-3">
          {variantes.map((v) => (
            <div key={v.id} className="space-y-3 rounded-xl border bg-muted/20 p-3">
              <div className="flex items-center justify-between">
                <span className="rounded-md bg-background px-2 py-1 text-sm font-semibold">{v.talla}</span>
                <Button type="button" size="icon" variant="ghost" className="h-7 w-7 text-destructive"
                  aria-label={`Eliminar variante ${v.talla}`} onClick={() => handleEliminar(v.id, v.talla)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              </div>
              {precioPorVariante && (
                <div className="grid grid-cols-2 gap-3">
                  {(["precio_compra", "precio_venta"] as const).map((campo) => {
                    const actual = campo === "precio_compra" ? (v.precio_compra ?? precioCompraComun) : (v.precio_venta ?? precioVentaComun)
                    return <label key={campo} className="space-y-1 text-xs font-medium">
                      <span>{campo === "precio_compra" ? "Compra" : "Venta"}</span>
                      <Input key={`${v.id}-${campo}-${actual}`} type="number" min="0" step="0.01"
                        defaultValue={actual} aria-label={`${campo === "precio_compra" ? "Compra" : "Venta"} de variante ${v.talla}`}
                        onBlur={(e) => {
                          const precio = Number(e.target.value)
                          if (e.target.value === "" || !Number.isFinite(precio) || precio < 0) return
                          if (precio !== actual) handleEditarCampo(v.id, campo, precio)
                        }} />
                    </label>
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-medium">
                  <span>Stock actual</span>
                  <Input key={`${v.id}-stock-${v.stock_actual}`} type="number" min="0" defaultValue={v.stock_actual}
                    aria-label={`Stock actual de variante ${v.talla}`}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value) || 0
                      if (val !== v.stock_actual) handleEditarStock(v.id, val)
                    }} />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>Stock mínimo</span>
                  <Input key={`${v.id}-min-${v.stock_minimo}`} type="number" min="0" defaultValue={v.stock_minimo}
                    aria-label={`Stock mínimo de variante ${v.talla}`}
                    onBlur={(e) => {
                      const minimo = Number(e.target.value)
                      if (e.target.value === "" || !Number.isInteger(minimo) || minimo < 0) return
                      if (minimo !== v.stock_minimo) handleEditarCampo(v.id, "stock_minimo", minimo)
                    }} />
                </label>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Agregar nueva variante */}
      {tallasLibres.length > 0 && (
        <div className="space-y-3 rounded-xl border border-dashed p-3">
          <Select value={nuevaTalla} onValueChange={setNuevaTalla}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Variante" />
            </SelectTrigger>
            <SelectContent>
              {tallasLibres.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="grid grid-cols-2 gap-3">
            <label className="space-y-1 text-xs font-medium"><span>Stock inicial</span>
              <Input type="number" min="0" value={nuevoStock} onChange={(e) => setNuevoStock(parseInt(e.target.value) || 0)} />
            </label>
            <label className="space-y-1 text-xs font-medium"><span>Stock mínimo</span>
              <Input type="number" min="0" value={nuevoStockMinimo} onChange={(e) => setNuevoStockMinimo(parseInt(e.target.value) || 0)} />
            </label>
          </div>
          {precioPorVariante && (
            <div className="grid grid-cols-2 gap-3">
              <label className="space-y-1 text-xs font-medium"><span>Compra</span>
                <Input type="number" step="0.01" min="0" value={nuevoPrecioCompra ?? ""}
                  onChange={(e) => setNuevoPrecioCompra(e.target.value === "" ? null : Number(e.target.value))} />
              </label>
              <label className="space-y-1 text-xs font-medium"><span>Venta</span>
                <Input type="number" step="0.01" min="0" value={nuevoPrecioVenta ?? ""}
                  onChange={(e) => setNuevoPrecioVenta(e.target.value === "" ? null : Number(e.target.value))} />
              </label>
            </div>
          )}
          <Button
            type="button"
            size="sm"
            onClick={handleAgregar}
            disabled={agregando || !nuevaTalla || (precioPorVariante && (nuevoPrecioCompra === null || nuevoPrecioVenta === null))}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Agregar
          </Button>
        </div>
      )}

      {tallasLibres.length === 0 && variantes.length > 0 && (
        <p className="text-xs text-muted-foreground">Todas las variantes están asignadas.</p>
      )}

      <GestionarTallasDialog
        open={gestionarTallas}
        onClose={() => setGestionarTallas(false)}
        onCambio={cargarTallas}
      />
    </div>
  )
}
