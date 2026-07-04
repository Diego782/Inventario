"use client"

// Feature: gestion-clientes-y-fiadores
// Item individual del Centro_Notificaciones con acciones rápidas (Req 8.2–8.9).
//
//  Comportamiento base (mantenido de dashboard-metricas-notificaciones):
//   - Muestra título, mensaje y el tiempo relativo en español derivado de
//     `creado_en` mediante `tiempoRelativoEs`.
//   - Renderiza un indicador visual persistente y observable presente
//     únicamente en las notificaciones no leídas.
//   - Al hacer clic sobre el área de texto de una notificación no leída
//     invoca `onMarcarLeida(id)`.
//
//  Acciones rápidas (Req 8.2–8.9):
//   - `stock_cero`: "Ajustar stock" (abre AjustarStockDialog) y
//     "Eliminar producto" (abre EliminarProductoDialog con confirmación;
//     solo elimina tras la confirmación del usuario). (Req 8.2–8.4)
//   - `stock_critico`: solo "Ajustar stock" — sin "Eliminar producto".
//     (Req 8.5, 8.6)
//   - `vencimiento_deuda`: "Extender deuda" (abre ExtenderDeudaDialog
//     con date picker; valida fecha posterior al plazo vigente). (Req 8.7–8.9)
//
//  Los botones abren modales; el dominio no ejecuta ninguna acción directa.
//  Los datos del producto se cargan de forma perezosa cuando el usuario
//  activa una acción por primera vez, para evitar N+1 en el listado.
import * as React from "react"
import { Wrench, Trash2, CalendarClock } from "lucide-react"
import { toast } from "sonner"

import type { NotificacionDTO, ProductoDTO } from "@/lib/api/serializadores"
import { tiempoRelativoEs } from "@/lib/notificaciones/tiempo"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { AjustarStockDialog } from "@/components/inventario/ajustar-stock-dialog"
import { EliminarProductoDialog } from "@/components/inventario/eliminar-producto-dialog"
import { ExtenderDeudaDialog } from "@/components/fiadores/extender-deuda-dialog"

export type NotificacionItemProps = {
  notificacion: NotificacionDTO
  /** Marca la notificación como leída (enlazado a `useNotificaciones.marcarLeida`). */
  onMarcarLeida(id: string): void
  /** Callback opcional tras ejecutar una acción exitosa (p. ej. recargar lista). */
  onAccionEjecutada?: () => void
}

// ---- Tipos para los modales abiertos ----

type ModalAbierto =
  | { tipo: "ajustar-stock"; producto: ProductoDTO }
  | { tipo: "eliminar-producto"; producto: ProductoDTO }
  | { tipo: "extender-deuda" }
  | null

// ---- Helpers ----

/** Obtiene los datos del producto desde la API de forma perezosa. */
async function fetchProducto(productoId: string): Promise<ProductoDTO | null> {
  try {
    const res = await fetch(`/api/productos/${encodeURIComponent(productoId)}`)
    if (!res.ok) return null
    const data = await res.json()
    return (data?.data ?? data) as ProductoDTO
  } catch {
    return null
  }
}

// ---- Componente principal ----

export function NotificacionItem({
  notificacion,
  onMarcarLeida,
  onAccionEjecutada,
}: NotificacionItemProps) {
  const {
    id,
    titulo,
    mensaje,
    leida,
    creado_en,
    acciones_rapidas = [],
    producto_id,
  } = notificacion

  const [modal, setModal] = React.useState<ModalAbierto>(null)
  const [cargandoProducto, setCargandoProducto] = React.useState(false)

  // El tiempo relativo se recalcula en cada render contra el reloj actual.
  const tiempo = React.useMemo(
    () => tiempoRelativoEs(new Date(creado_en), new Date()),
    [creado_en],
  )

  // Marcar como leída al hacer clic en el área de texto (solo si no leída).
  const manejarClicTexto = React.useCallback(() => {
    if (!leida) {
      onMarcarLeida(id)
    }
  }, [leida, onMarcarLeida, id])

  // Carga los datos del producto y abre el modal indicado.
  const abrirModalProducto = React.useCallback(
    async (tipoModal: "ajustar-stock" | "eliminar-producto") => {
      if (!producto_id) {
        toast.error("No hay producto asociado a esta notificación.")
        return
      }
      setCargandoProducto(true)
      const producto = await fetchProducto(producto_id)
      setCargandoProducto(false)
      if (!producto) {
        toast.error("No se pudo cargar el producto. Intenta de nuevo.")
        return
      }
      setModal({ tipo: tipoModal, producto })
    },
    [producto_id],
  )

  const abrirExtenderDeuda = React.useCallback(() => {
    setModal({ tipo: "extender-deuda" })
  }, [])

  const cerrarModal = React.useCallback(() => setModal(null), [])

  const manejarAccionEjecutada = React.useCallback(() => {
    setModal(null)
    onAccionEjecutada?.()
  }, [onAccionEjecutada])

  // Derivar el plazo vigente para la extensión de deuda.
  // La notificación no lleva el plazo directamente en el DTO; se pasa null
  // y el diálogo lo manejará (la validación final la aplica el backend).
  const plazoVigente: Date | null = null

  const tieneAcciones = acciones_rapidas && acciones_rapidas.length > 0

  return (
    <div
      className={cn(
        "flex w-full flex-col gap-2 rounded-md px-3 py-2.5 transition-colors",
        leida ? "opacity-70" : "bg-accent/40",
      )}
    >
      {/* Área de texto: marcar como leída al hacer clic */}
      <button
        type="button"
        onClick={manejarClicTexto}
        aria-disabled={leida}
        aria-label={
          leida
            ? `Notificación leída: ${titulo}`
            : `Notificación sin leer: ${titulo}. Marcar como leída`
        }
        className={cn(
          "flex w-full items-start gap-3 text-left",
          leida
            ? "cursor-default"
            : "cursor-pointer hover:opacity-80 focus-visible:opacity-80",
          "focus-visible:ring-ring/50 rounded outline-none focus-visible:ring-[3px]",
        )}
      >
        {/* Indicador visual persistente presente sólo en no leídas. */}
        <span
          aria-hidden="true"
          className={cn(
            "mt-1.5 size-2 shrink-0 rounded-full",
            leida ? "bg-transparent" : "bg-primary",
          )}
        />

        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span
            className={cn(
              "truncate text-sm",
              leida
                ? "font-normal text-foreground"
                : "font-semibold text-foreground",
            )}
          >
            {titulo}
          </span>
          <span className="text-sm text-muted-foreground">{mensaje}</span>
          <span className="text-xs text-muted-foreground">{tiempo}</span>
        </span>
      </button>

      {/* Botones de acciones rápidas (Req 8.2–8.9) */}
      {tieneAcciones && (
        <div className="flex flex-wrap gap-1.5 pl-5">
          {acciones_rapidas.includes("Ajustar stock") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              disabled={cargandoProducto}
              onClick={() => abrirModalProducto("ajustar-stock")}
              aria-label={`Ajustar stock del producto de esta notificación`}
            >
              <Wrench aria-hidden="true" className="size-3.5" />
              {cargandoProducto ? "Cargando..." : "Ajustar stock"}
            </Button>
          )}

          {acciones_rapidas.includes("Eliminar producto") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={cargandoProducto}
              onClick={() => abrirModalProducto("eliminar-producto")}
              aria-label={`Eliminar el producto de esta notificación`}
            >
              <Trash2 aria-hidden="true" className="size-3.5" />
              Eliminar producto
            </Button>
          )}

          {acciones_rapidas.includes("Extender deuda") && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={abrirExtenderDeuda}
              aria-label={`Extender el plazo de deuda de esta notificación`}
            >
              <CalendarClock aria-hidden="true" className="size-3.5" />
              Extender deuda
            </Button>
          )}
        </div>
      )}

      {/* Modales */}
      {modal?.tipo === "ajustar-stock" && (
        <AjustarStockDialog
          open
          producto={modal.producto}
          onClose={cerrarModal}
          onAjustado={manejarAccionEjecutada}
        />
      )}

      {modal?.tipo === "eliminar-producto" && (
        <EliminarProductoDialog
          open
          producto={modal.producto}
          onClose={cerrarModal}
          onEliminado={manejarAccionEjecutada}
        />
      )}

      {modal?.tipo === "extender-deuda" && (
        <ExtenderDeudaDialog
          open
          notificacionId={id}
          plazoVigente={plazoVigente}
          onClose={cerrarModal}
          onExtendido={manejarAccionEjecutada}
        />
      )}
    </div>
  )
}
