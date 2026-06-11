"use client"

// Feature: dashboard-metricas-notificaciones
// Selector de Rango_Fechas del Dashboard_Analitico (R1.1–R1.10, R12.1, R12.3,
// R13.4, R13.5). Ofrece presets rápidos y, en modo personalizado, un calendario
// de rango basado en `react-day-picker`. Muestra la etiqueta legible del rango
// activo y los mensajes de validación en español sin recargar la página.
//
// Componente controlado: por defecto gestiona su propio estado vía `useRangoFechas`,
// pero acepta el estado del hook por prop (`control`) para que el contenedor
// (`dashboard-section.tsx`) comparta el mismo Rango_Fechas con `useDashboardData`.
import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import type { DateRange } from "react-day-picker"
import { CalendarIcon, CalendarRange } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  useRangoFechas,
  type PresetRango,
  type UseRangoFechas,
} from "@/hooks/use-rango-fechas"

/** Presets ofrecidos al usuario, en orden de presentación (R1.2). */
const PRESETS: { valor: Exclude<PresetRango, "personalizado">; etiqueta: string }[] = [
  { valor: "hoy", etiqueta: "Hoy" },
  { valor: "esta_semana", etiqueta: "Esta semana" },
  { valor: "este_mes", etiqueta: "Este mes" },
  { valor: "mes_anterior", etiqueta: "Mes anterior" },
]

export type RangoFechasSelectorProps = {
  /**
   * Estado del Rango_Fechas provisto por el contenedor. Si se omite, el componente
   * crea su propia instancia de `useRangoFechas` (modo autónomo).
   */
  control?: UseRangoFechas
  className?: string
}

/** Convierte un `Date` a cadena civil `YYYY-MM-DD` usando componentes locales. */
function aIso(d: Date | undefined): string | null {
  if (!d) return null
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, "0")
  const dd = String(d.getDate()).padStart(2, "0")
  return `${y}-${m}-${dd}`
}

/** Convierte una cadena civil `YYYY-MM-DD` a `Date` local (sólo para el calendario). */
function aDate(iso: string | undefined | null): Date | undefined {
  if (!iso) return undefined
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return undefined
  return new Date(y, m - 1, d)
}

export function RangoFechasSelector({ control, className }: RangoFechasSelectorProps) {
  // Hook propio como respaldo cuando no se controla desde fuera.
  const propio = useRangoFechas()
  const estado = control ?? propio

  const { preset, etiquetaLegible, error, setPreset, setPersonalizado } = estado

  // Borrador del calendario de rango (no confirma hasta pulsar "Aplicar").
  const [calendarioAbierto, setCalendarioAbierto] = React.useState(false)
  const [borrador, setBorrador] = React.useState<DateRange | undefined>(undefined)
  const [errorLocal, setErrorLocal] = React.useState<string | null>(null)

  // Al abrir el calendario, sembrar el borrador con el rango activo.
  React.useEffect(() => {
    if (calendarioAbierto) {
      setBorrador({
        from: aDate(estado.rango.desde),
        to: aDate(estado.rango.hasta),
      })
      setErrorLocal(null)
    }
  }, [calendarioAbierto, estado.rango.desde, estado.rango.hasta])

  function onPresetChange(valor: string) {
    // ToggleGroup type="single" puede emitir "" al deseleccionar; lo ignoramos.
    if (!valor) return
    setPreset(valor as PresetRango)
  }

  function abrirPersonalizado() {
    setPreset("personalizado")
    setCalendarioAbierto(true)
  }

  function aplicarPersonalizado() {
    const desde = aIso(borrador?.from)
    const hasta = aIso(borrador?.to)
    if (!desde || !hasta) {
      setErrorLocal("Selecciona una fecha de inicio y una fecha de fin para el rango")
      return
    }
    const resultado = setPersonalizado(desde, hasta)
    if (resultado.ok) {
      setErrorLocal(null)
      setCalendarioAbierto(false)
    } else {
      // Conserva el rango previo y muestra el mensaje (R1.7, R1.8).
      setErrorLocal(resultado.mensaje)
    }
  }

  const etiquetaBorrador =
    borrador?.from && borrador?.to
      ? `${format(borrador.from, "d MMM yyyy", { locale: es })} – ${format(
          borrador.to,
          "d MMM yyyy",
          { locale: es }
        )}`
      : borrador?.from
        ? `Desde ${format(borrador.from, "d MMM yyyy", { locale: es })}`
        : "Selecciona el rango"

  // El error visible combina el del borrador local y el persistido por el hook.
  const errorVisible = errorLocal ?? error

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <div
          role="group"
          aria-label="Preset de rango de fechas"
          className="flex flex-wrap gap-1"
        >
          {PRESETS.map((p) => (
            <Button
              key={p.valor}
              type="button"
              variant={preset === p.valor ? "default" : "outline"}
              size="sm"
              aria-label={p.etiqueta}
              aria-pressed={preset === p.valor}
              className="px-4"
              onClick={() => onPresetChange(p.valor)}
            >
              {p.etiqueta}
            </Button>
          ))}
        </div>

        {/* Separador visual entre presets y rango personalizado */}
        <div className="h-5 w-px bg-border" aria-hidden="true" />

        <Popover open={calendarioAbierto} onOpenChange={setCalendarioAbierto}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant={preset === "personalizado" ? "default" : "outline"}
              size="sm"
              className="justify-start font-normal"
              onClick={abrirPersonalizado}
              aria-label="Rango personalizado"
            >
              <CalendarRange className="mr-2 h-4 w-4" />
              Personalizado
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-auto p-0">
            <Calendar
              mode="range"
              locale={es}
              selected={borrador}
              onSelect={setBorrador}
              numberOfMonths={1}
              defaultMonth={borrador?.from}
              disabled={{ after: new Date() }}
              autoFocus
            />
            <div className="flex flex-col gap-2 border-t border-border p-3">
              <p className="text-xs text-muted-foreground">{etiquetaBorrador}</p>
              {errorLocal && (
                <p role="alert" className="text-xs text-destructive">
                  {errorLocal}
                </p>
              )}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setCalendarioAbierto(false)}
                >
                  Cancelar
                </Button>
                <Button type="button" size="sm" onClick={aplicarPersonalizado}>
                  Aplicar
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <CalendarIcon className="h-4 w-4" aria-hidden="true" />
        <span aria-live="polite">
          Rango activo: <span className="font-medium text-foreground">{etiquetaLegible}</span>
        </span>
      </div>

      {errorVisible && !calendarioAbierto && (
        <p role="alert" className="text-sm text-destructive">
          {errorVisible}
        </p>
      )}
    </div>
  )
}

export default RangoFechasSelector
