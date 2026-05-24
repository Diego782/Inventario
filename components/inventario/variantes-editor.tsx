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
  onCambio: () => void
}

export function VariantesEditor({ productoId, variantes, onCambio }: VariantesEditorProps) {
  const [tallasDisponibles, setTallasDisponibles] = useState<string[]>([])
  const [nuevaTalla, setNuevaTalla] = useState("")
  const [nuevoStock, setNuevoStock] = useState(0)
  const [agregando, setAgregando] = useState(false)
  const [gestionarTallas, setGestionarTallas] = useState(false)

  function cargarTallas() {
    fetch("/api/tallas")
      .then((r) => r.json())
      .then((data) => setTallasDisponibles(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  useEffect(() => { cargarTallas() }, [])

  // Filtrar tallas que ya están usadas
  const tallasLibres = tallasDisponibles.filter(
    (t) => !variantes.some((v) => v.talla === t)
  )

  async function handleAgregar() {
    if (!nuevaTalla) return
    setAgregando(true)
    try {
      const res = await fetch(`/api/productos/${productoId}/variantes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talla: nuevaTalla, stock_actual: nuevoStock }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al agregar variante")
        return
      }
      setNuevaTalla("")
      setNuevoStock(0)
      onCambio()
      toast.success(`Talla ${nuevaTalla} agregada`)
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
      onCambio()
    } catch {
      toast.error("Error de conexión")
    }
  }

  async function handleEliminar(varianteId: string, talla: string) {
    if (!confirm(`¿Eliminar la talla ${talla}?`)) return
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
      onCambio()
      toast.success(`Talla ${talla} eliminada`)
    } catch {
      toast.error("Error de conexión")
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        <p className="text-sm font-medium">Stock por Talla</p>
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
        <div className="space-y-1">
          {variantes.map((v) => (
            <div key={v.id} className="flex items-center gap-2">
              <span className="text-sm font-medium w-12 text-center bg-muted rounded px-2 py-1">
                {v.talla}
              </span>
              <Input
                type="number"
                min="0"
                defaultValue={v.stock_actual}
                className="w-20 h-8 text-sm"
                onBlur={(e) => {
                  const val = parseInt(e.target.value) || 0
                  if (val !== v.stock_actual) handleEditarStock(v.id, val)
                }}
              />
              <span className="text-xs text-muted-foreground">unidades</span>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-destructive ml-auto"
                onClick={() => handleEliminar(v.id, v.talla)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* Agregar nueva variante */}
      {tallasLibres.length > 0 && (
        <div className="flex items-center gap-2 pt-1">
          <Select value={nuevaTalla} onValueChange={setNuevaTalla}>
            <SelectTrigger className="w-20 h-8 text-sm">
              <SelectValue placeholder="Talla" />
            </SelectTrigger>
            <SelectContent>
              {tallasLibres.map((t) => (
                <SelectItem key={t} value={t}>{t}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="number"
            min="0"
            value={nuevoStock}
            onChange={(e) => setNuevoStock(parseInt(e.target.value) || 0)}
            className="w-20 h-8 text-sm"
            placeholder="Stock"
          />
          <Button
            type="button"
            size="sm"
            className="h-8"
            onClick={handleAgregar}
            disabled={agregando || !nuevaTalla}
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Agregar
          </Button>
        </div>
      )}

      {tallasLibres.length === 0 && variantes.length > 0 && (
        <p className="text-xs text-muted-foreground">Todas las tallas están asignadas.</p>
      )}

      <GestionarTallasDialog
        open={gestionarTallas}
        onClose={() => setGestionarTallas(false)}
        onCambio={cargarTallas}
      />
    </div>
  )
}
