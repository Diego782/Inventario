"use client"

/**
 * components/ventas/filtros-ventas.tsx
 * Panel de filtros avanzados del historial de ventas.
 * Se monta en un Popover desde el botón "Filtrar" de VentasSection.
 * Permite filtrar por nombre del producto vendido, método de pago,
 * rango de total de venta y rango de fechas.
 */

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { Filter, X, CalendarIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { Calendar } from "@/components/ui/calendar"
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

export type FiltrosVentas = {
  producto?: string
  metodo_pago?: string
  total_min?: number
  total_max?: number
  desde?: string // YYYY-MM-DD
  hasta?: string // YYYY-MM-DD
}

interface FiltrosVentasProps {
  filtros: FiltrosVentas
  onAplicar: (filtros: FiltrosVentas) => void
}

const SIN_VALOR = "__todos__"

const METODOS_PAGO = [
  { valor: "efectivo", etiqueta: "Efectivo" },
  { valor: "tarjeta", etiqueta: "Tarjeta" },
  { valor: "transferencia", etiqueta: "Transferencia" },
  { valor: "fiado", etiqueta: "Fiado" },
]

// ---- Helpers ----

function aNumero(valor: string): number | undefined {
  if (valor.trim() === "") return undefined
  const n = Number(valor)
  return Number.isFinite(n) ? n : undefined
}

/** Convierte 'YYYY-MM-DD' a Date local (sin desfase de zona horaria). */
function aDate(iso?: string): Date | undefined {
  if (!iso) return undefined
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

/** Formatea Date a 'YYYY-MM-DD' en hora local. */
function aIso(date?: Date): string | undefined {
  if (!date) return undefined
  return format(date, "yyyy-MM-dd")
}

export function contarFiltros(f: FiltrosVentas): number {
  return Object.values(f).filter((v) => v !== undefined && v !== "").length
}

// ---- Componente ----

export function FiltrosVentas({ filtros, onAplicar }: FiltrosVentasProps) {
  const [abierto, setAbierto] = useState(false)
  const [calendarioAbierto, setCalendarioAbierto] = useState(false)
  const [borrador, setBorrador] = useState<FiltrosVentas>(filtros)
  const [error, setError] = useState<string | null>(null)

  const activos = contarFiltros(filtros)

  useEffect(() => {
    if (abierto) {
      setBorrador(filtros)
      setError(null)
    }
  }, [abierto, filtros])

  function setCampo<K extends keyof FiltrosVentas>(campo: K, valor: FiltrosVentas[K]) {
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

  const rango: DateRange | undefined =
    borrador.desde || borrador.hasta
      ? { from: aDate(borrador.desde), to: aDate(borrador.hasta) }
      : undefined

  function setRango(r: DateRange | undefined) {
    setBorrador((prev) => {
      const next = { ...prev }
      const desde = aIso(r?.from)
      const hasta = aIso(r?.to)
      if (desde) next.desde = desde
      else delete next.desde
      if (hasta) next.hasta = hasta
      else delete next.hasta
      return next
    })
  }

  function validar(f: FiltrosVentas): string | null {
    if (f.total_min !== undefined && f.total_min < 0) return "El total no puede ser negativo."
    if (f.total_max !== undefined && f.total_max < 0) return "El total no puede ser negativo."
    if (f.total_min !== undefined && f.total_max !== undefined && f.total_min > f.total_max) {
      return "El total mínimo no puede ser mayor que el máximo."
    }
    const desde = aDate(f.desde)
    const hasta = aDate(f.hasta)
    if (desde && hasta && desde > hasta) {
      return "La fecha inicial no puede ser posterior a la final."
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

  const etiquetaRango =
    rango?.from && rango?.to
      ? `${format(rango.from, "dd/MM/yyyy", { locale: es })} – ${format(rango.to, "dd/MM/yyyy", { locale: es })}`
      : rango?.from
      ? `Desde ${format(rango.from, "dd/MM/yyyy", { locale: es })}`
      : "Seleccionar rango"

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
      <PopoverContent align="end" className="w-[360px] max-h-[80vh] overflow-y-auto p-4">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h4 className="font-semibold text-sm">Filtrar ventas</h4>
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

          {/* Producto vendido */}
          <div className="space-y-1.5">
            <Label htmlFor="f-producto" className="text-xs">Producto vendido</Label>
            <Input
              id="f-producto"
              placeholder="Nombre del producto"
              value={borrador.producto ?? ""}
              onChange={(e) => setCampo("producto", e.target.value)}
            />
          </div>

          {/* Método de pago */}
          <div className="space-y-1.5">
            <Label className="text-xs">Método de pago</Label>
            <Select
              value={borrador.metodo_pago ?? SIN_VALOR}
              onValueChange={(v) => setCampo("metodo_pago", v === SIN_VALOR ? undefined : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={SIN_VALOR}>Todos</SelectItem>
                {METODOS_PAGO.map((m) => (
                  <SelectItem key={m.valor} value={m.valor}>
                    {m.etiqueta}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Rango de total */}
          <div className="space-y-1.5">
            <Label className="text-xs">Total de venta</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Mín."
                aria-label="Total mínimo"
                value={borrador.total_min ?? ""}
                onChange={(e) => setCampo("total_min", aNumero(e.target.value))}
              />
              <span className="text-muted-foreground text-sm">–</span>
              <Input
                type="number"
                min="0"
                step="0.01"
                placeholder="Máx."
                aria-label="Total máximo"
                value={borrador.total_max ?? ""}
                onChange={(e) => setCampo("total_max", aNumero(e.target.value))}
              />
            </div>
          </div>

          {/* Rango de fechas */}
          <div className="space-y-1.5">
            <Label className="text-xs">Rango de fechas</Label>
            <Popover open={calendarioAbierto} onOpenChange={setCalendarioAbierto}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start font-normal"
                >
                  <CalendarIcon className="w-4 h-4 mr-2 text-muted-foreground" />
                  <span className={rango?.from ? "" : "text-muted-foreground"}>
                    {etiquetaRango}
                  </span>
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-auto p-0">
                <Calendar
                  mode="range"
                  locale={es}
                  selected={rango}
                  onSelect={setRango}
                  numberOfMonths={1}
                  defaultMonth={rango?.from}
                />
                {rango?.from && (
                  <div className="flex justify-end border-t border-border p-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs"
                      onClick={() => setRango(undefined)}
                    >
                      Borrar fechas
                    </Button>
                  </div>
                )}
              </PopoverContent>
            </Popover>
          </div>

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
