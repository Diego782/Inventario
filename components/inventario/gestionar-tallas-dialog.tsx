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

interface GestionarTallasDialogProps {
  open: boolean
  onClose: () => void
  onCambio: () => void
}

export function GestionarTallasDialog({ open, onClose, onCambio }: GestionarTallasDialogProps) {
  const [tallas, setTallas] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [nueva, setNueva] = useState("")
  const [creando, setCreando] = useState(false)
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null)
  const [editandoNombre, setEditandoNombre] = useState("")

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch("/api/tallas")
      const data = await res.json()
      setTallas(Array.isArray(data) ? data : [])
    } catch {
      toast.error("Error al cargar tallas")
    } finally {
      setCargando(false)
    }
  }

  useEffect(() => { if (open) cargar() }, [open])

  async function handleCrear() {
    if (!nueva.trim()) return
    setCreando(true)
    try {
      const res = await fetch("/api/tallas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nueva.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al crear talla")
        return
      }
      setNueva("")
      await cargar()
      onCambio()
      toast.success("Talla creada")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setCreando(false)
    }
  }

  async function handleEditar(original: string) {
    if (!editandoNombre.trim()) return
    try {
      const res = await fetch("/api/tallas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: original, nuevo: editandoNombre.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al editar")
        return
      }
      setEditandoIdx(null)
      await cargar()
      onCambio()
      toast.success("Talla actualizada")
    } catch {
      toast.error("Error de conexión")
    }
  }

  async function handleEliminar(nombre: string) {
    if (!confirm(`¿Eliminar la talla "${nombre}"?`)) return
    try {
      const res = await fetch("/api/tallas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al eliminar")
        return
      }
      await cargar()
      onCambio()
      toast.success("Talla eliminada")
    } catch {
      toast.error("Error de conexión")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gestionar Tallas</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Nueva talla (ej: XL, 42, 10)..."
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

        <div className="max-h-60 overflow-y-auto space-y-1 mt-2">
          {cargando && <p className="text-sm text-muted-foreground">Cargando...</p>}
          {!cargando && tallas.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay tallas</p>
          )}
          {tallas.map((t, i) => (
            <div key={t} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 group">
              {editandoIdx === i ? (
                <>
                  <Input
                    value={editandoNombre}
                    onChange={(e) => setEditandoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditar(t)
                      if (e.key === "Escape") setEditandoIdx(null)
                    }}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditar(t)}>
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoIdx(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm font-medium">{t}</span>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setEditandoIdx(i); setEditandoNombre(t) }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon" variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => handleEliminar(t)}
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
