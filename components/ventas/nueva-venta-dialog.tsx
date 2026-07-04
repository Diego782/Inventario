"use client"

/**
 * components/ventas/nueva-venta-dialog.tsx
 * Dialog principal de creación de ventas.
 * Gestiona el estado del carrito, los descuentos por producto y el descuento total.
 * Pasa el total calculado (con descuentos) a PagoForm.
 *
 * Req 6.1–6.10, 7.1–7.8
 */

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
import {
  CarritoTable,
  calcularTotalesConDescuentos,
  type DescuentosProducto,
} from "@/components/ventas/carrito-table"
import { PagoForm, type PagoPayload } from "@/components/ventas/pago-form"
import { AgregarProductoVenta } from "@/components/ventas/agregar-producto-venta"
import { useBarcodeScanner } from "@/hooks/use-barcode-scanner"
import { useCarritoVenta } from "@/hooks/use-carrito-venta"
import { useConfiguracion } from "@/hooks/use-configuracion"
import { toastDeError } from "@/lib/mensajes-error"
import type { ProductoDTO, VentaDTO } from "@/lib/api/serializadores"

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

  // Estado de descuentos
  const [descuentosProducto, setDescuentosProducto] = useState<DescuentosProducto>({})
  const [descuentoTotal, setDescuentoTotal] = useState<number>(0)

  const carrito = useCarritoVenta(
    config.porcentaje_impuesto,
    config.permitir_sobreventa
  )

  const refocusHidden = useCallback(() => {
    requestAnimationFrame(() => {
      hiddenRef.current?.focus()
    })
  }, [])

  // Solo refocusear al campo oculto cuando el click fue en el fondo del dialog
  const handleDialogClick = useCallback((e: React.MouseEvent) => {
    const target = e.target as HTMLElement
    const interactivo = target.closest("input, textarea, select, button, label, [role='radio'], [role='checkbox'], [role='combobox'], [role='option']")
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
      const producto: ProductoDTO = await res.json()

      if ((producto.variantes?.length ?? 0) > 0) {
        toast.info(`${producto.nombre} tiene tallas. Selecciona la talla abajo.`)
        refocusHidden()
        return
      }

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

  // Calcular totales con descuentos para pasar el total correcto a PagoForm
  const totalesConDescuentos = calcularTotalesConDescuentos(
    carrito.items,
    descuentosProducto,
    descuentoTotal,
    config.porcentaje_impuesto
  )

  // Manejar cobro — envía cliente_id y plazo_deuda si aplica
  async function handleCobrar(payload: PagoPayload) {
    try {
      // Serializar ítems con descuentos por producto
      const itemsConDescuento = carrito.serializarParaApi().map((item) => {
        const clave = item.variante_id
          ? `${item.producto_id}::${item.variante_id}`
          : item.producto_id
        return {
          ...item,
          descuento_producto: descuentosProducto[clave] ?? 0,
        }
      })

      const body = {
        metodo_pago: payload.metodo_pago,
        monto_recibido: payload.monto_recibido,
        cliente_id: payload.cliente_id,
        plazo_deuda: payload.plazo_deuda,
        descuento_total: descuentoTotal > 0 ? descuentoTotal : undefined,
        items: itemsConDescuento,
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
      setDescuentosProducto({})
      setDescuentoTotal(0)
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
    setDescuentosProducto({})
    setDescuentoTotal(0)
    setConfirmarCierre(false)
    onClose()
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent
          className="sm:max-w-[1040px] w-[calc(100vw-2rem)] max-h-[90vh] overflow-y-auto"
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
            <div className="flex-1 min-w-0 space-y-3">
              <AgregarProductoVenta
                onAgregarSimple={(producto) => {
                  const { excedeStock } = carrito.agregarOIncrementar(producto)
                  if (excedeStock) toast.error(`Stock insuficiente para ${producto.nombre}`)
                  refocusHidden()
                }}
                onAgregarVariante={(producto, variante, cantidad) => {
                  const { excedeStock } = carrito.agregarConVariante(producto, variante, cantidad)
                  if (excedeStock) {
                    toast.error(`Stock insuficiente para ${producto.nombre} talla ${variante.talla}`)
                  } else {
                    toast.success(`${producto.nombre} (talla ${variante.talla}) agregado`)
                  }
                  refocusHidden()
                }}
              />
              <CarritoTable
                items={carrito.items}
                porcentajeImpuesto={config.porcentaje_impuesto}
                descuentosProducto={descuentosProducto}
                descuentoTotal={descuentoTotal}
                onCambiarCantidad={(clave, cantidad) => {
                  carrito.setCantidad(clave, cantidad)
                  refocusHidden()
                }}
                onEliminar={(clave) => {
                  carrito.eliminar(clave)
                  // Al eliminar un ítem, quitar su descuento también
                  setDescuentosProducto((prev) => {
                    const next = { ...prev }
                    delete next[clave]
                    return next
                  })
                  refocusHidden()
                }}
                onDescuentoProductoChange={(clave, descuento) => {
                  setDescuentosProducto((prev) => ({
                    ...prev,
                    [clave]: descuento,
                  }))
                }}
                onDescuentoTotalChange={(descuento) => {
                  setDescuentoTotal(descuento)
                }}
                onTotalesChange={() => {
                  // Los totales se recalculan en render; no se necesita estado adicional
                }}
              />
            </div>

            {/* Pago — ancho fijo de 300px */}
            <div className="w-full lg:w-[300px] shrink-0">
              <PagoForm
                total={totalesConDescuentos.total}
                onCobrar={handleCobrar}
                disabled={carrito.items.length === 0 || !!totalesConDescuentos.errorDescuento}
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
