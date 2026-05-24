"use client"

import { useState, useEffect } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Plus, Pencil, Trash2, Check, X } from "lucide-react"

type Categoria = { id: string; nombre: string }

interface GestionarCategoriasDialogProps {
  open: boolean
  onClose: () => void
  onCambio: () => void
}

export function GestionarCategoriasDialog({
  open,
  onClose,
  onCambio,
}: GestionarCategoriasDialogProps) {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [cargando, setCargando] = useState(false)
  const [nueva, setNueva] = useState("")
  const [creando, setCreando] = useState(false)
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [editandoNombre, setEditandoNombre] = useState("")

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch("/api/categorias")
      const data = await res.json()
      setCategorias(Array.isArray(data) ? data : [])
    } catch {
      toast.error("Error al cargar categorías")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => {
    if (open) cargar()
  }, [open])

  async function handleCrear() {
    if (!nueva.trim()) return
    setCreando(true)
    try {
      const res = await fetch("/api/categorias", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nueva.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al crear categoría")
        return
      }
      setNueva("")
      await cargar()
      onCambio()
      toast.success("Categoría creada")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setCreando(false)
    }
  }

  async function handleEditar(id: string) {
    if (!editandoNombre.trim()) return
    try {
      const res = await fetch(`/api/categorias/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: editandoNombre.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al editar")
        return
      }
      setEditandoId(null)
      await cargar()
      onCambio()
      toast.success("Categoría actualizada")
    } catch {
      toast.error("Error de conexión")
    }
  }

  async function handleEliminar(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la categoría "${nombre}"?`)) return
    try {
      const res = await fetch(`/api/categorias/${id}`, { method: "DELETE" })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al eliminar")
        return
      }
      await cargar()
      onCambio()
      toast.success("Categoría eliminada")
    } catch {
      toast.error("Error de conexión")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gestionar Categorías</DialogTitle>
        </DialogHeader>

        {/* Crear nueva */}
        <div className="flex gap-2">
          <Input
            placeholder="Nueva categoría..."
            value={nueva}
            onChange={(e) => setNueva(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCrear()}
            disabled={creando}
            className="flex-1"
          />
          <Button size="sm" onClick={handleCrear} disabled={creando || !nueva.trim()}>
            <Plus className="w-4 h-4" />
          </Button>
        </div>

        {/* Lista */}
        <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!cargando && categorias.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay categorías</p>
          )}
          {categorias.map((cat) => (
            <div key={cat.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 group">
              {editandoId === cat.id ? (
                <>
                  <Input
                    value={editandoNombre}
                    onChange={(e) => setEditandoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditar(cat.id)
                      if (e.key === "Escape") setEditandoId(null)
                    }}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditar(cat.id)}>
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoId(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate">{cat.nombre}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setEditandoId(cat.id); setEditandoNombre(cat.nombre) }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => handleEliminar(cat.id, cat.nombre)}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
