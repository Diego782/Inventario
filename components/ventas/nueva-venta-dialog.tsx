"use client"

import { useRef, useState, useCallback } from "react"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { CarritoTable } from "@/components/ventas/carrito-table"
import { PagoForm } from "@/components/ventas/pago-form"
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner"
import { useCarritoVenta } from "@/hooks/use-carrito-venta"
import { useConfiguracion } from "@/hooks/use-configuracion"
import { toastDeError } from "@/lib/mensajes-error"
import type { VentaDTO } from "@/lib/api/serializadores"

interface NuevaVentaDialogProps {
  open: boolean
  onClose: () => void
  onVentaCreada: (venta: VentaDTO) => void
}

export function NuevaVentaDialog({
  open,
  onClose,
  onVentaCreada,
}: NuevaVentaDialogProps) {
  const hiddenRef = useRef<HTMLInputElement>(null)
  const [confirmarCierre, setConfirmarCierre] = useState(false)
  const { data: config } = useConfiguracion()

  const carrito = useCarritoVenta(
    config.porcentaje_impuesto,
    config.permitir_sobreventa
  )

  const refocusHidden = useCallback(() => {
    requestAnimationFrame(() => {
      hiddenRef.current?.focus()
    })
  }, [])

  // Solo refocusear al campo oculto cuando el click fue en el fondo del dialog,
  // nunca cuando el usuario hizo click en un input, button, label, select, etc.
  const handleDialogClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const interactivo = target.closest("input, textarea, select, button, label, [role='radio'], [role='checkbox']")
    if (!interactivo) {
      refocusHidden()
    }
  }, [refocusHidden])

  // Manejar escaneo de código de barras
  const handleScan = useCallback(async (codigo: string) => {
    try {
      const res = await fetch(`/api/productos/por-codigo/${encodeURIComponent(codigo)}`)
      if (!res.ok) {
        if (res.status === 404) {
          toast.error("Código no encontrado")
        } else {
          toast.error(toastDeError("RED"))
        }
        refocusHidden()
        return
      }
      const producto = await res.json()
      const { excedeStock } = carrito.agregarOIncrementar(producto)
      if (excedeStock) {
        toast.error(`Stock insuficiente para ${producto.nombre}`)
      }
    } catch {
      toast.error(toastDeError("RED"))
    } finally {
      refocusHidden()
    }
  }, [carrito, refocusHidden])

  useBarcodeScanner({
    enabled: open,
    onScan: handleScan,
  })

  // Manejar cobro
  async function handleCobrar(payload: {
    metodo_pago: "efectivo" | "tarjeta" | "transferencia" | "fiado"
    monto_recibido?: number
    fiador_id?: string
  }) {
    try {
      const body = {
        ...payload,
        items: carrito.serializarParaApi(),
      }

      const res = await fetch("/api/ventas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })

      const data = await res.json()

      if (!res.ok) {
        const codigo = data?.error?.codigo ?? "DESCONOCIDO"
        toast.error(toastDeError(codigo))
        return
      }

      toast.success(`Venta registrada: ${data.folio}`)
      carrito.limpiar()
      onVentaCreada(data)
    } catch {
      toast.error(toastDeError("RED"))
    }
  }

  // Manejar intento de cierre
  function handleOpenChange(v: boolean) {
    if (!v) {
      if (carrito.items.length > 0) {
        setConfirmarCierre(true)
      } else {
        onClose()
      }
    }
  }

  function handleConfirmarCierre() {
    carrito.limpiar()
    setConfirmarCierre(false)
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-[960px] w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto"
          onClick={handleDialogClick}
        >
          <DialogHeader>
            <DialogTitle>Nueva Venta</DialogTitle>
          </DialogHeader>

          {/* Campo oculto para el lector de código de barras */}
          <input
            ref={hiddenRef}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            readOnly
          />

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Carrito — crece para ocupar el espacio disponible */}
            <div className="flex-1 min-w-0">
              <CarritoTable
                items={carrito.items}
                totales={carrito.totales}
                onCambiarCantidad={(id, cantidad) => {
                  carrito.setCantidad(id, cantidad)
                  refocusHidden()
                }}
                onEliminar={(id) => {
                  carrito.eliminar(id)
                  refocusHidden()
                }}
              />
            </div>

            {/* Pago — ancho fijo de 280px para que siempre quepa */}
            <div className="w-full lg:w-[280px] shrink-0">
              <PagoForm
                total={carrito.totales.total}
                onCobrar={handleCobrar}
                disabled={carrito.items.length === 0}
              />
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Confirmación de cierre con carrito no vacío */}
      <AlertDialog open={confirmarCierre} onOpenChange={setConfirmarCierre}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Descartar venta en curso?</AlertDialogTitle>
            <AlertDialogDescription>
              El carrito tiene {carrito.items.length} ítem(s). Si cierras, se perderán.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmarCierre}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Descartar y cerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
