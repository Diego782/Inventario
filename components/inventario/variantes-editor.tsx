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

type BorradorVariante = {
  stock_actual: string
  stock_minimo: string
  precio_compra: string
  precio_venta: string
}

function borradoresDe(variantes: VarianteDTO[], precioCompraComun: number, precioVentaComun: number): Record<string, BorradorVariante> {
  return Object.fromEntries(variantes.map((v) => [v.id, {
    stock_actual: String(v.stock_actual),
    stock_minimo: String(v.stock_minimo),
    precio_compra: String(v.precio_compra ?? precioCompraComun),
    precio_venta: String(v.precio_venta ?? precioVentaComun),
  }]))
}

export function VariantesEditor({ productoId, variantes: variantesIniciales, stockActualComun, stockMinimoComun, precioPorVariante, precioCompraComun, precioVentaComun, onCambio }: VariantesEditorProps) {
  const [variantes, setVariantes] = useState<VarianteDTO[]>(variantesIniciales)
  const [borradores, setBorradores] = useState<Record<string, BorradorVariante>>(() => borradoresDe(variantesIniciales, precioCompraComun, precioVentaComun))
  const [guardando, setGuardando] = useState(false)
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
    setBorradores(borradoresDe(variantesIniciales, precioCompraComun, precioVentaComun))
    if (variantesIniciales.length === 0) {
      setNuevoStock(stockActualComun)
      setNuevoStockMinimo(stockMinimoComun)
    }
  }, [variantesIniciales, stockActualComun, stockMinimoComun, precioCompraComun, precioVentaComun])

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
        const actualizadas = Array.isArray(data) ? data : []
        setVariantes(actualizadas)
        setBorradores(borradoresDe(actualizadas, precioCompraComun, precioVentaComun))
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

  function editarBorrador(varianteId: string, campo: keyof BorradorVariante, valor: string) {
    setBorradores((actual) => ({
      ...actual,
      [varianteId]: { ...actual[varianteId], [campo]: valor },
    }))
  }

  const cambios = variantes.flatMap((v) => {
    const borrador = borradores[v.id]
    if (!borrador) return []
    const datos: Record<string, number | string> = { variante_id: v.id }
    if (borrador.stock_actual !== String(v.stock_actual)) datos.stock_actual = Number(borrador.stock_actual)
    if (borrador.stock_minimo !== String(v.stock_minimo)) datos.stock_minimo = Number(borrador.stock_minimo)
    if (precioPorVariante) {
      if (borrador.precio_compra !== String(v.precio_compra ?? precioCompraComun)) datos.precio_compra = Number(borrador.precio_compra)
      if (borrador.precio_venta !== String(v.precio_venta ?? precioVentaComun)) datos.precio_venta = Number(borrador.precio_venta)
    }
    return Object.keys(datos).length > 1 ? [datos] : []
  })

  async function handleGuardar() {
    if (!cambios.length) return
    for (const cambio of cambios) {
      for (const [campo, valor] of Object.entries(cambio)) {
        if (campo === "variante_id") continue
        const borrador = borradores[cambio.variante_id as string]
        const numero = Number(valor)
        if (!borrador?.[campo as keyof BorradorVariante] || !Number.isFinite(numero) || numero < 0 ||
          ((campo === "stock_actual" || campo === "stock_minimo") && !Number.isInteger(numero))) {
          toast.error("Revisa el stock y los precios antes de guardar.")
          return
        }
      }
    }
    setGuardando(true)
    try {
      for (const cambio of cambios) {
        const res = await fetch(`/api/productos/${productoId}/variantes`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(cambio),
        })
        if (!res.ok) {
          const data = await res.json().catch(() => null)
          throw new Error(data?.error?.mensaje ?? "Error al guardar la variante")
        }
      }
      await recargarVariantes()
      toast.success("Cambios de stock guardados")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de conexión")
    } finally {
      setGuardando(false)
    }
  }

  async function handleEliminar(varianteId: string, talla: string) {
    const mensaje = variantes.length === 1
      ? `¿Quitar la variante ${talla}? El stock y el mínimo se conservarán en el producto sin variantes.`
      : `¿Eliminar la variante ${talla}?`
    if (!confirm(mensaje)) return
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
                      <Input type="number" min="0" step="0.01"
                        value={borradores[v.id]?.[campo] ?? String(actual)}
                        aria-label={`${campo === "precio_compra" ? "Compra" : "Venta"} de variante ${v.talla}`}
                        onChange={(e) => editarBorrador(v.id, campo, e.target.value)} />
                    </label>
                  })}
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <label className="space-y-1 text-xs font-medium">
                  <span>Stock actual</span>
                  <Input type="number" min="0" value={borradores[v.id]?.stock_actual ?? String(v.stock_actual)}
                    aria-label={`Stock actual de variante ${v.talla}`}
                    onChange={(e) => editarBorrador(v.id, "stock_actual", e.target.value)} />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>Stock mínimo</span>
                  <Input type="number" min="0" value={borradores[v.id]?.stock_minimo ?? String(v.stock_minimo)}
                    aria-label={`Stock mínimo de variante ${v.talla}`}
                    onChange={(e) => editarBorrador(v.id, "stock_minimo", e.target.value)} />
                </label>
              </div>
            </div>
          ))}
          <Button type="button" onClick={handleGuardar} disabled={guardando || cambios.length === 0} className="w-full">
            {guardando ? "Guardando..." : "Guardar cambios"}
          </Button>
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
