"use client"

/**
 * components/ventas/pago-form.tsx
 * Formulario de pago. Cuando metodo_pago = "fiado":
 *   - Selector de cliente (obligatorio, restringido al tenant) — Req 6.3, 6.8
 *   - Date picker de Plazo_Deuda (react-day-picker, obligatorio, >= hoy) — Req 6.4
 * Para el resto de métodos el cliente es opcional — Req 6.1, 6.2
 */

import { useEffect, useState } from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { CalendarIcon, AlertCircle, UserSearch } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command"
import { ScrollArea } from "@/components/ui/scroll-area"

// ---- Tipos ----

type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "fiado"

export interface ClienteOpcion {
  id: string
  nombre: string
  cedula: string
  telefono: string
}

export interface PagoPayload {
  metodo_pago: MetodoPago
  monto_recibido?: number
  cliente_id?: string
  plazo_deuda?: string // ISO date string YYYY-MM-DD
}

interface PagoFormProps {
  total: number
  onCobrar: (payload: PagoPayload) => Promise<void>
  disabled?: boolean
}

// ---- Constantes ----

const METODOS: Array<{ value: MetodoPago; label: string }> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "fiado", label: "Fiado" },
]

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

/** Devuelve YYYY-MM-DD en hora local para una Date */
function toLocalIso(d: Date): string {
  return format(d, "yyyy-MM-dd")
}

/** Inicio del día de hoy en hora local */
function hoyLocal(): Date {
  const hoy = new Date()
  hoy.setHours(0, 0, 0, 0)
  return hoy
}

// ---- Componente ----

export function PagoForm({ total, onCobrar, disabled }: PagoFormProps) {
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo")
  const [montoRecibido, setMontoRecibido] = useState<string>("")
  const [cobrando, setCobrando] = useState(false)

  // Estado para cliente (opcional en general, obligatorio en fiado)
  const [clientes, setClientes] = useState<ClienteOpcion[]>([])
  const [cargandoClientes, setCargandoClientes] = useState(false)
  const [clienteId, setClienteId] = useState<string | undefined>(undefined)
  const [selectorAbierto, setSelectorAbierto] = useState(false)

  // Estado para plazo de deuda (solo fiado)
  const [plazoDeuda, setPlazoDeuda] = useState<Date | undefined>(undefined)
  const [calendarioAbierto, setCalendarioAbierto] = useState(false)

  // Errores de validación
  const [errorCliente, setErrorCliente] = useState<string | null>(null)
  const [errorPlazo, setErrorPlazo] = useState<string | null>(null)

  // Cargar clientes cuando el modo es fiado o en el primer open del selector
  useEffect(() => {
    if (metodo === "fiado" || selectorAbierto) {
      cargarClientes()
    }
  }, [metodo, selectorAbierto])

  // Limpiar campos de fiado al cambiar de método
  useEffect(() => {
    if (metodo !== "fiado") {
      // En no-fiado, si había cliente lo conservamos (es opcional)
      setErrorCliente(null)
      setErrorPlazo(null)
      setPlazoDeuda(undefined)
    }
  }, [metodo])

  async function cargarClientes() {
    if (clientes.length > 0) return // ya cargados
    setCargandoClientes(true)
    try {
      const res = await fetch("/api/clientes?take=50")
      if (!res.ok) return
      const data = await res.json()
      const items: ClienteOpcion[] = (data.items ?? data).map((c: {
        id: string; nombre: string; cedula: string; telefono: string
      }) => ({
        id: c.id,
        nombre: c.nombre,
        cedula: c.cedula,
        telefono: c.telefono,
      }))
      setClientes(items)
    } catch {
      // silencioso — el usuario puede reabrir el selector
    } finally {
      setCargandoClientes(false)
    }
  }

  const clienteSeleccionado = clientes.find((c) => c.id === clienteId)

  // ---- Validaciones de efectivo ----
  const monto = montoRecibido.trim() === "" ? total : (parseFloat(montoRecibido) || 0)
  const cambio = metodo === "efectivo" && monto >= total ? monto - total : null
  const montoInsuficiente = metodo === "efectivo" && montoRecibido.trim() !== "" && monto < total

  // ---- Validaciones de fiado ----
  const plazoInvalido = plazoDeuda !== undefined && plazoDeuda < hoyLocal()

  function validar(): boolean {
    let ok = true
    if (metodo === "fiado") {
      if (!clienteId) {
        setErrorCliente("Debes seleccionar un cliente para la venta fiada.")
        ok = false
      } else {
        setErrorCliente(null)
      }
      if (!plazoDeuda) {
        setErrorPlazo("Debes indicar el plazo de la deuda.")
        ok = false
      } else if (plazoInvalido) {
        setErrorPlazo("El plazo debe ser igual o posterior a la fecha de hoy.")
        ok = false
      } else {
        setErrorPlazo(null)
      }
    }
    return ok
  }

  const puedeCobrarse =
    !disabled &&
    !cobrando &&
    total > 0 &&
    (metodo !== "efectivo" || monto >= total) &&
    (metodo !== "fiado" || (!!clienteId && !!plazoDeuda && !plazoInvalido))

  async function handleCobrar() {
    if (!validar()) return
    setCobrando(true)
    try {
      await onCobrar({
        metodo_pago: metodo,
        monto_recibido: metodo === "efectivo" ? monto : undefined,
        cliente_id: clienteId,
        plazo_deuda: plazoDeuda ? toLocalIso(plazoDeuda) : undefined,
      })
      // Resetear al completar
      setClienteId(undefined)
      setPlazoDeuda(undefined)
      setMontoRecibido("")
    } finally {
      setCobrando(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Método de pago */}
      <div>
        <Label className="text-sm font-medium mb-2 block">Método de pago</Label>
        <RadioGroup
          value={metodo}
          onValueChange={(v) => setMetodo(v as MetodoPago)}
          className="flex flex-col gap-2"
        >
          {METODOS.map((m) => (
            <div
              key={m.value}
              className="flex items-center gap-3 border border-border rounded-lg px-3 py-2.5 cursor-pointer hover:bg-muted/50"
            >
              <RadioGroupItem value={m.value} id={`metodo-${m.value}`} className="shrink-0" />
              <Label htmlFor={`metodo-${m.value}`} className="cursor-pointer font-normal text-sm w-full">
                {m.label}
              </Label>
            </div>
          ))}
        </RadioGroup>
      </div>

      {/* Monto recibido (solo efectivo) */}
      {metodo === "efectivo" && (
        <div>
          <Label htmlFor="monto-recibido" className="text-sm font-medium">
            Monto recibido
          </Label>
          <Input
            id="monto-recibido"
            type="number"
            step="0.01"
            min="0"
            placeholder={formatMXN(total)}
            value={montoRecibido}
            onChange={(e) => setMontoRecibido(e.target.value)}
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter" && puedeCobrarse) {
                e.preventDefault()
                handleCobrar()
              }
            }}
            className="mt-1"
          />
          {montoInsuficiente && (
            <Alert variant="destructive" className="mt-2 py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                El monto recibido es insuficiente para cubrir el total.
              </AlertDescription>
            </Alert>
          )}
          {cambio !== null && (
            <p className="text-sm text-green-600 font-semibold mt-1">
              Cambio: {formatMXN(cambio)}
            </p>
          )}
        </div>
      )}

      {/* Selector de cliente (obligatorio en fiado, opcional en todos los métodos) */}
      <div className="space-y-1.5">
        <Label className="text-sm font-medium">
          Cliente{metodo === "fiado" ? " *" : " (opcional)"}
        </Label>

          <Popover open={selectorAbierto} onOpenChange={setSelectorAbierto}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                role="combobox"
                aria-expanded={selectorAbierto}
                aria-label="Seleccionar cliente"
                className={`w-full justify-between font-normal text-sm ${
                  errorCliente ? "border-destructive" : ""
                }`}
                onClick={() => {
                  setSelectorAbierto(true)
                  cargarClientes()
                }}
              >
                {clienteSeleccionado ? (
                  <span className="truncate">
                    {clienteSeleccionado.nombre}
                    <span className="ml-2 text-muted-foreground text-xs">
                      {clienteSeleccionado.cedula}
                    </span>
                  </span>
                ) : (
                  <span className="text-muted-foreground flex items-center gap-1.5">
                    <UserSearch className="w-4 h-4" />
                    Buscar cliente...
                  </span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-[280px] p-0" align="start">
              <Command>
                <CommandInput placeholder="Nombre o cédula..." />
                <CommandList>
                  {cargandoClientes ? (
                    <div className="py-4 text-center text-sm text-muted-foreground">
                      Cargando clientes...
                    </div>
                  ) : (
                    <>
                      <CommandEmpty>No se encontraron clientes.</CommandEmpty>
                      <CommandGroup>
                        {/* Opción para quitar la selección en métodos no-fiado */}
                        {metodo !== "fiado" && clienteId && (
                          <CommandItem
                            value="__ninguno__"
                            onSelect={() => {
                              setClienteId(undefined)
                              setSelectorAbierto(false)
                            }}
                          >
                            <span className="text-muted-foreground text-sm">
                              Sin cliente
                            </span>
                          </CommandItem>
                        )}
                        <ScrollArea className="max-h-48">
                          {clientes.map((c) => (
                            <CommandItem
                              key={c.id}
                              value={`${c.nombre} ${c.cedula}`}
                              onSelect={() => {
                                setClienteId(c.id)
                                setErrorCliente(null)
                                setSelectorAbierto(false)
                              }}
                            >
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{c.nombre}</span>
                                <span className="text-xs text-muted-foreground">
                                  Cédula: {c.cedula} · Tel: {c.telefono}
                                </span>
                              </div>
                            </CommandItem>
                          ))}
                        </ScrollArea>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              </Command>
            </PopoverContent>
          </Popover>

          {errorCliente && (
            <p className="text-xs text-destructive" role="alert">
              {errorCliente}
            </p>
          )}
        </div>

      {/* Plazo de deuda (solo fiado) */}
      {metodo === "fiado" && (
        <div className="space-y-1.5">
          <Label className="text-sm font-medium">
            Plazo de deuda *
          </Label>

          <Popover open={calendarioAbierto} onOpenChange={setCalendarioAbierto}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                aria-label="Seleccionar plazo de deuda"
                className={`w-full justify-start font-normal text-sm ${
                  errorPlazo || plazoInvalido ? "border-destructive" : ""
                }`}
              >
                <CalendarIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                {plazoDeuda ? (
                  <span>
                    {format(plazoDeuda, "dd/MM/yyyy", { locale: es })}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Seleccionar fecha límite</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                locale={es}
                selected={plazoDeuda}
                onSelect={(date) => {
                  setPlazoDeuda(date ?? undefined)
                  if (date && date >= hoyLocal()) {
                    setErrorPlazo(null)
                  }
                  setCalendarioAbierto(false)
                }}
                disabled={(date) => {
                  const hoy = hoyLocal()
                  return date < hoy
                }}
                defaultMonth={plazoDeuda ?? hoyLocal()}
                initialFocus
              />
            </PopoverContent>
          </Popover>

          {(errorPlazo || plazoInvalido) && (
            <p className="text-xs text-destructive" role="alert">
              {errorPlazo ?? "El plazo debe ser igual o posterior a la fecha de hoy."}
            </p>
          )}
        </div>
      )}

      {/* Total */}
      <div className="bg-muted/50 rounded-lg p-3">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-sm">Total a cobrar</span>
          <span className="text-xl font-bold tabular-nums">{formatMXN(total)}</span>
        </div>
      </div>

      {/* Botón cobrar */}
      <Button
        className="w-full"
        size="lg"
        disabled={!puedeCobrarse}
        onClick={handleCobrar}
        aria-label="Cobrar"
      >
        {cobrando ? "Procesando..." : "Cobrar"}
      </Button>
    </div>
  )
}
