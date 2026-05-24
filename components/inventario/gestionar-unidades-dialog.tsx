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

interface GestionarUnidadesDialogProps {
  open: boolean
  onClose: () => void
  onCambio: () => void
}

export function GestionarUnidadesDialog({
  open,
  onClose,
  onCambio,
}: GestionarUnidadesDialogProps) {
  const [unidades, setUnidades] = useState<string[]>([])
  const [cargando, setCargando] = useState(false)
  const [nueva, setNueva] = useState("")
  const [creando, setCreando] = useState(false)
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null)
  const [editandoNombre, setEditandoNombre] = useState("")

  async function cargar() {
    setCargando(true)
    try {
      const res = await fetch("/api/unidades")
      const data = await res.json()
      setUnidades(Array.isArray(data) ? data : [])
    } catch {
      toast.error("Error al cargar unidades")
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
      const res = await fetch("/api/unidades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: nueva.trim() }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        toast.error(data?.error?.mensaje ?? "Error al crear unidad")
        return
      }
      setNueva("")
      await cargar()
      onCambio()
      toast.success("Unidad creada")
    } catch {
      toast.error("Error de conexión")
    } finally {
      setCreando(false)
    }
  }

  async function handleEditar(original: string) {
    if (!editandoNombre.trim()) return
    try {
      const res = await fetch("/api/unidades", {
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
      toast.success("Unidad actualizada")
    } catch {
      toast.error("Error de conexión")
    }
  }

  async function handleEliminar(nombre: string) {
    if (!confirm(`¿Eliminar la unidad "${nombre}"?`)) return
    try {
      const res = await fetch("/api/unidades", {
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
      toast.success("Unidad eliminada")
    } catch {
      toast.error("Error de conexión")
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Gestionar Unidades</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            placeholder="Nueva unidad..."
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
          {!cargando && unidades.length === 0 && (
            <p className="text-sm text-muted-foreground">No hay unidades</p>
          )}
          {unidades.map((u, i) => (
            <div key={u} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-muted/50 group">
              {editandoIdx === i ? (
                <>
                  <Input
                    value={editandoNombre}
                    onChange={(e) => setEditandoNombre(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleEditar(u)
                      if (e.key === "Escape") setEditandoIdx(null)
                    }}
                    className="flex-1 h-8 text-sm"
                    autoFocus
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleEditar(u)}>
                    <Check className="w-3.5 h-3.5 text-green-600" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditandoIdx(null)}>
                    <X className="w-3.5 h-3.5" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm truncate">{u}</span>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => { setEditandoIdx(i); setEditandoNombre(u) }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity text-destructive"
                    onClick={() => handleEliminar(u)}
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
