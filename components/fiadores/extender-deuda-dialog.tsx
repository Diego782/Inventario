"use client"

// Feature: gestion-clientes-y-fiadores
// Modal de "Extender deuda" accionable desde notificaciones de tipo
// `vencimiento_deuda` (Req 8.7–8.9).
//
// Comportamiento:
//   - Muestra un date picker para seleccionar la nueva fecha límite de la deuda.
//   - Valida que la nueva fecha sea estrictamente posterior al plazo vigente
//     antes de enviar (Req 8.9); si no lo es muestra un error de validación
//     y conserva el plazo vigente sin llamar al backend.
//   - Al confirmar, llama a POST /api/notificaciones/[id]/extender-deuda con
//     { nueva_fecha: ISO 8601 } (Req 8.8).
//   - En caso de error del servidor, muestra un toast de error con sonner.
//   - El dominio no ejecuta la acción; solo la UI lo hace.
import * as React from "react"
import { format, isAfter, startOfDay } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon } from "lucide-react"
import { toast } from "sonner"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"

export type ExtenderDeudaDialogProps = {
  open: boolean
  /** ID de la notificación de vencimiento (se usa en la ruta del endpoint). */
  notificacionId: string
  /** Plazo vigente actual; la nueva fecha debe ser estrictamente posterior. */
  plazoVigente: Date | null
  onClose: () => void
  /** Se invoca tras una extensión exitosa para que el contenedor recargue. */
  onExtendido: () => void
}

export function ExtenderDeudaDialog({
  open,
  notificacionId,
  plazoVigente,
  onClose,
  onExtendido,
}: ExtenderDeudaDialogProps) {
  const [nuevaFecha, setNuevaFecha] = React.useState<Date | undefined>(undefined)
  const [calendarioAbierto, setCalendarioAbierto] = React.useState(false)
  const [enviando, setEnviando] = React.useState(false)
  const [errorLocal, setErrorLocal] = React.useState<string | null>(null)

  // Limpiar el estado al abrir/cerrar el diálogo.
  React.useEffect(() => {
    if (open) {
      setNuevaFecha(undefined)
      setErrorLocal(null)
    }
  }, [open])

  // La fecha mínima seleccionable es el día siguiente al plazo vigente (o hoy).
  const fechaMinima = React.useMemo(() => {
    if (plazoVigente) {
      const siguienteDia = new Date(plazoVigente)
      siguienteDia.setDate(siguienteDia.getDate() + 1)
      return startOfDay(siguienteDia)
    }
    const manana = new Date()
    manana.setDate(manana.getDate() + 1)
    return startOfDay(manana)
  }, [plazoVigente])

  function validarFecha(fecha: Date | undefined): string | null {
    if (!fecha) return "Debes seleccionar una fecha."
    // La nueva fecha debe ser estrictamente posterior al plazo vigente (Req 8.9).
    if (plazoVigente && !isAfter(startOfDay(fecha), startOfDay(plazoVigente))) {
      return `La nueva fecha debe ser posterior al ${format(plazoVigente, "dd/MM/yyyy", { locale: es })}.`
    }
    if (!isAfter(startOfDay(fecha), startOfDay(new Date()))) {
      return "La nueva fecha debe ser posterior a hoy."
    }
    return null
  }

  async function handleConfirmar() {
    const error = validarFecha(nuevaFecha)
    if (error) {
      setErrorLocal(error)
      return
    }

    setEnviando(true)
    setErrorLocal(null)
    try {
      const res = await fetch(
        `/api/notificaciones/${encodeURIComponent(notificacionId)}/extender-deuda`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nueva_fecha: nuevaFecha!.toISOString() }),
        },
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo ?? "DESCONOCIDO"
        if (codigo === "PLAZO_EXTENSION_INVALIDO") {
          setErrorLocal(
            "La nueva fecha debe ser posterior al plazo vigente.",
          )
        } else {
          toast.error("No se pudo extender la deuda. Intenta de nuevo.")
        }
        return
      }

      toast.success("Plazo de deuda extendido correctamente.")
      onExtendido()
      onClose()
    } catch {
      toast.error("Error de conexión. Intenta de nuevo.")
    } finally {
      setEnviando(false)
    }
  }

  const etiquetaFecha = nuevaFecha
    ? format(nuevaFecha, "dd/MM/yyyy", { locale: es })
    : "Seleccionar fecha"

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Extender plazo de deuda</DialogTitle>
          <DialogDescription>
            {plazoVigente
              ? `Plazo vigente: ${format(plazoVigente, "dd/MM/yyyy", { locale: es })}. La nueva fecha debe ser posterior.`
              : "Selecciona la nueva fecha límite para la deuda."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Popover open={calendarioAbierto} onOpenChange={setCalendarioAbierto}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start font-normal",
                  !nuevaFecha && "text-muted-foreground",
                )}
                aria-label="Seleccionar nueva fecha límite"
              >
                <CalendarIcon className="mr-2 h-4 w-4" aria-hidden="true" />
                {etiquetaFecha}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                locale={es}
                selected={nuevaFecha}
                onSelect={(day) => {
                  setNuevaFecha(day)
                  setErrorLocal(null)
                  setCalendarioAbierto(false)
                }}
                disabled={(day) => !isAfter(startOfDay(day), startOfDay(new Date()))}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {errorLocal && (
            <p role="alert" className="text-sm text-destructive">
              {errorLocal}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmar} disabled={enviando || !nuevaFecha}>
            {enviando ? "Guardando..." : "Confirmar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
