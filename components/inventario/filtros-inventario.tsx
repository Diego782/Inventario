"use client"

/**
 * components/inventario/filtros-inventario.tsx
 * Panel de filtros avanzados del catálogo de productos.
 * Se monta en un Popover desde el botón "Filtrar" de InventarioSection.
 * Permite filtrar por nombre, unidad, categoría, talla y rangos de
 * precio de venta, precio de compra, stock mínimo y stock inicial (actual).
 */

import { useEffect, useState } from "react"
import { Filter, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

// ---- Tipos ----

export type FiltrosInventario = {
  nombre?: string
  unidad?: string
  categoria_id?: string
  talla?: string
  precio_venta_min?: number
  precio_venta_max?: number
  precio_compra_min?: number
  precio_compra_max?: number
  stock_minimo_min?: number
  stock_minimo_max?: number
  stock_actual_min?: number
  stock_actual_max?: number
}

interface FiltrosInventarioProps {
  filtros: FiltrosInventario
  onAplicar: (filtros: FiltrosInventario) => void
}

type Categoria = { id: string; nombre: string }

const SIN_VALOR = "__todas__"

// ---- Helpers ----

/** Convierte un string de input a número o undefined si está vacío/ inválido. */
function aNumero(valor: string): number | undefined {
  if (valor.trim() === "") return undefined
  const n = Number(valor)
  return Number.isFinite(n) ? n : undefined
}

/** Cuenta cuántos filtros están activos (para el badge del botón). */
export function contarFiltros(f: FiltrosInventario): number {
  return Object.values(f).filter((v) => v !== undefined && v !== "").length
}

// ---- Componente ----

export function FiltrosInventario({ filtros, onAplicar }: FiltrosInventarioProps) {
  const [abierto, setAbierto] = useState(false)
  const [borrador, setBorrador] = useState<FiltrosInventario>(filtros)
  const [error, setError] = useState<string | null>(null)

  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [unidades, setUnidades] = useState<string[]>([])
  const [tallas, setTallas] = useState<string[]>([])

  const activos = contarFiltros(filtros)

  // Sincronizar el borrador cuando se abre el popover
  useEffect(() => {
    if (abierto) {
      setBorrador(filtros)
      setError(null)
    }
  }, [abierto, filtros])

  // Cargar catálogos al abrir
  useEffect(() => {
    if (!abierto) return
    fetch("/api/categorias")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setCategorias(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch("/api/unidades")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setUnidades(Array.isArray(data) ? data : []))
      .catch(() => {})
    fetch("/api/tallas")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setTallas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [abierto])

  function setCampo<K extends keyof FiltrosInventario>(campo: K, valor: FiltrosInventario[K]) {
    setBorrador((prev) => {
      const next = { ...prev }
      if (valor === undefined || valor === "") {
        delete next[campo]
      } else {
        next[campo] = valor
      }
      return next
    })
  }

  /** Valida que los mínimos no superen a los máximos. */
  function validar(f: FiltrosInventario): string | null {
    const pares: Array<[number | undefined, number | undefined, string]> = [
      [f.precio_venta_min, f.precio_venta_max, "precio de venta"],
      [f.precio_compra_min, f.precio_compra_max, "precio de compra"],
      [f.stock_minimo_min, f.stock_minimo_max, "stock mínimo"],
      [f.stock_actual_min, f.stock_actual_max, "stock inicial"],
    ]
    for (const [min, max, etiqueta] of pares) {
      if (min !== undefined && min < 0) return `El ${etiqueta} no puede ser negativo.`
      if (max !== undefined && max < 0) return `El ${etiqueta} no puede ser negativo.`
      if (min !== undefined && max !== undefined && min > max) {
        return `En ${etiqueta}, el mínimo no puede ser mayor que el máximo.`
      }
    }
    return null
  }

  function aplicar() {
    const msg = validar(borrador)
    if (msg) {
      setError(msg)
      return
    }
    setError(null)
    onAplicar(borrador)
    setAbierto(false)
  }

  function limpiar() {
    setBorrador({})
    setError(null)
    onAplicar({})
  }

  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="relative">
          <Filter className="w-4 h-4 mr-2" />
          Filtrar
          {activos > 0 && (
            <span className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {activos}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[360px] max-h-[80vh] overflow-y-auto p-4"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Filtrar productos</h4>
            {activos > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={limpiar}
              >
                <X className="w-3.5 h-3.5 mr-1" />
                Limpiar
              </Button>
            )}
          </div>

          <Separator />

          {/* Texto */}
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="f-nombre" className="text-xs">Nombre</Label>
              <Input
                id="f-nombre"
                placeholder="Nombre"
                value={borrador.nombre ?? ""}
                onChange={(e) => setCampo("nombre", e.target.value)}
              />
            </div>
          </div>

          {/* Selects */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Categoría</Label>
              <Select
                value={borrador.categoria_id ?? SIN_VALOR}
                onValueChange={(v) => setCampo("categoria_id", v === SIN_VALOR ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Todas</SelectItem>
                  {categorias.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unidad</Label>
              <Select
                value={borrador.unidad ?? SIN_VALOR}
                onValueChange={(v) => setCampo("unidad", v === SIN_VALOR ? undefined : v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={SIN_VALOR}>Todas</SelectItem>
                  {unidades.map((u) => (
                    <SelectItem key={u} value={u}>
                      {u}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Talla</Label>
            <Select
              value={borrador.talla ?? SIN_VALOR}
              onValueChange={(v) => setCampo("talla", v === SIN_VALOR ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Todas</SelectItem>
                {tallas.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Rangos numéricos */}
          <RangoNumerico
            etiqueta="Precio de venta"
            min={borrador.precio_venta_min}
            max={borrador.precio_venta_max}
            step="0.01"
            onMin={(v) => setCampo("precio_venta_min", v)}
            onMax={(v) => setCampo("precio_venta_max", v)}
          />
          <RangoNumerico
            etiqueta="Precio de compra"
            min={borrador.precio_compra_min}
            max={borrador.precio_compra_max}
            step="0.01"
            onMin={(v) => setCampo("precio_compra_min", v)}
            onMax={(v) => setCampo("precio_compra_max", v)}
          />
          <RangoNumerico
            etiqueta="Stock mínimo"
            min={borrador.stock_minimo_min}
            max={borrador.stock_minimo_max}
            step="1"
            onMin={(v) => setCampo("stock_minimo_min", v)}
            onMax={(v) => setCampo("stock_minimo_max", v)}
          />
          <RangoNumerico
            etiqueta="Stock inicial"
            min={borrador.stock_actual_min}
            max={borrador.stock_actual_max}
            step="1"
            onMin={(v) => setCampo("stock_actual_min", v)}
            onMax={(v) => setCampo("stock_actual_max", v)}
          />

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" className="flex-1" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
            <Button size="sm" className="flex-1" onClick={aplicar}>
              Aplicar
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---- Subcomponente de rango numérico ----

function RangoNumerico({
  etiqueta,
  min,
  max,
  step,
  onMin,
  onMax,
}: {
  etiqueta: string
  min?: number
  max?: number
  step: string
  onMin: (v: number | undefined) => void
  onMax: (v: number | undefined) => void
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{etiqueta}</Label>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min="0"
          step={step}
          placeholder="Mín."
          aria-label={`${etiqueta} mínimo`}
          value={min ?? ""}
          onChange={(e) => onMin(aNumero(e.target.value))}
        />
        <span className="text-muted-foreground text-sm">–</span>
        <Input
          type="number"
          min="0"
          step={step}
          placeholder="Máx."
          aria-label={`${etiqueta} máximo`}
          value={max ?? ""}
          onChange={(e) => onMax(aNumero(e.target.value))}
        />
      </div>
    </div>
  )
}
