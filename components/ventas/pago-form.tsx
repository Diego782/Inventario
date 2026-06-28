"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { AlertCircle } from "lucide-react"

type MetodoPago = "efectivo" | "tarjeta" | "transferencia" | "fiado"

interface PagoFormProps {
  total: number
  onCobrar: (payload: {
    metodo_pago: MetodoPago
    monto_recibido?: number
    fiador_id?: string
  }) => Promise<void>
  disabled?: boolean
}

const METODOS: Array<{ value: MetodoPago; label: string }> = [
  { value: "efectivo", label: "Efectivo" },
  { value: "tarjeta", label: "Tarjeta" },
  { value: "transferencia", label: "Transferencia" },
  { value: "fiado", label: "Fiado" },
]

function formatMXN(n: number) {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n)
}

export function PagoForm({ total, onCobrar, disabled }: PagoFormProps) {
  const [metodo, setMetodo] = useState<MetodoPago>("efectivo")
  const [montoRecibido, setMontoRecibido] = useState<string>("")
  const [cobrando, setCobrando] = useState(false)

  // Campo vacío en efectivo = pago exacto (monto = total). Esto evita que el
  // botón quede deshabilitado cuando el cajero no escribe nada y cobra el importe justo.
  const monto = montoRecibido.trim() === "" ? total : (parseFloat(montoRecibido) || 0)
  const cambio = metodo === "efectivo" && monto >= total ? monto - total : null
  const montoInsuficiente = metodo === "efectivo" && montoRecibido.trim() !== "" && monto < total

  const puedeCobrarse =
    !disabled &&
    !cobrando &&
    total > 0 &&
    (metodo !== "efectivo" || monto >= total) &&
    metodo !== "fiado" // fiado requiere fiador (simplificado por ahora)

  async function handleCobrar() {
    setCobrando(true)
    try {
      await onCobrar({
        metodo_pago: metodo,
        monto_recibido: metodo === "efectivo" ? monto : undefined,
      })
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

      {/* Fiado — placeholder */}
      {metodo === "fiado" && (
        <Alert className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">
            La venta fiada requiere seleccionar un fiador. Módulo en desarrollo.
          </AlertDescription>
        </Alert>
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
