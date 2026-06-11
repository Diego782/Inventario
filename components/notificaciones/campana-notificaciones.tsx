"use client"

// Feature: dashboard-metricas-notificaciones
// Campana de notificaciones — icono Bell con Badge_Conteo en el header.
// Requisitos: R9.1, R9.2, R9.3, R11.2, R13.1, R13.2, R13.3.
//
//  - Icono `Bell` de lucide-react con un `Badge_Conteo` superpuesto:
//    "" cuando no hay no leídas, el número 1-99 o "99+" cuando hay más de 99 (R9.2, R9.3).
//  - `aria-label` dinámico calculado con `ariaLabelCampana` de `@/lib/notificaciones/badge` (R13.1, R13.2).
//  - Al hacer clic abre/cierra el panel de notificaciones.
//    * En desktop: usa `Popover` de shadcn/ui.
//    * En móvil (useIsMobile): usa `Sheet` (side="bottom") de shadcn/ui.
//  - Internamente instancia `useNotificaciones` (lista + conteo) y
//    `usePollingNotificaciones` (badge actualizado cada 30 s). Al detectar un
//    aumento por polling actualiza el badge y anuncia por `RegionAriaLive` (R13.3).
//  - Llama a `useSonidoNotificacion` para reproducir sonido al aumentar (R11.2).
//  - Sólo reutiliza primitivas de `@/components/ui` (R12.2).

import * as React from "react"
import { Bell } from "lucide-react"

import { formatearBadge, ariaLabelCampana } from "@/lib/notificaciones/badge"
import { useNotificaciones } from "@/hooks/use-notificaciones"
import { usePollingNotificaciones } from "@/hooks/use-polling-notificaciones"
import { useSonidoNotificacion } from "@/hooks/use-sonido-notificacion"
import { useIsMobile } from "@/hooks/use-mobile"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import {
  Sheet,
  SheetContent,
  SheetTrigger,
  SheetTitle,
} from "@/components/ui/sheet"

import { PanelNotificaciones } from "./panel-notificaciones"
import { RegionAriaLive } from "./region-aria-live"

/**
 * Campana de notificaciones para el header.
 * Monta el badge de conteo, gestiona el polling y abre el panel mediante
 * Popover (desktop) o Sheet (móvil).
 */
export function CampanaNotificaciones() {
  const notificaciones = useNotificaciones()
  const { conteo: conteoPoll, onAumento } = usePollingNotificaciones()
  const { reproducir } = useSonidoNotificacion()
  const isMobile = useIsMobile()

  // Estado de apertura del panel (Popover / Sheet).
  const [abierto, setAbierto] = React.useState(false)

  // Conteo efectivo: el mayor entre el derivado de items y el del polling.
  // El polling puede detectar nuevas notificaciones antes de que el panel recargue.
  const conteoEfectivo = Math.max(notificaciones.conteo, conteoPoll)

  // Anuncio para lectores de pantalla cuando el conteo aumenta (R13.3).
  const [mensajeAriaLive, setMensajeAriaLive] = React.useState("")

  // Registra el callback de aumento una sola vez al montar.
  React.useEffect(() => {
    onAumento((nuevo: number) => {
      // Reproducir sonido al detectar nuevas notificaciones (R11.2).
      reproducir()
      // Anunciar la actualización al lector de pantalla (R13.3).
      const etiqueta = formatearBadge(nuevo)
      const texto = etiqueta
        ? `Tienes ${etiqueta === "99+" ? "más de 99" : etiqueta} notificación${nuevo === 1 ? "" : "es"} nueva${nuevo === 1 ? "" : "s"}`
        : "Nueva notificación"
      setMensajeAriaLive(texto)
    })
  }, [onAumento, reproducir])

  // Limpiar el mensaje aria-live tras cada anuncio (el componente RegionAriaLive
  // lo limpia internamente, pero forzamos el reset para que el mismo mensaje pueda
  // anunciarse de nuevo en el siguiente ciclo de polling).
  React.useEffect(() => {
    if (!mensajeAriaLive) return
    const id = setTimeout(() => setMensajeAriaLive(""), 3_500)
    return () => clearTimeout(id)
  }, [mensajeAriaLive])

  const textoBadge = formatearBadge(conteoEfectivo)
  const labelCampana = ariaLabelCampana(conteoEfectivo)

  // Botón de trigger compartido por Popover y Sheet.
  const triggerCampana = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={labelCampana}
      className="relative"
    >
      <Bell aria-hidden="true" className="size-5" />
      {textoBadge && (
        <Badge
          variant="destructive"
          aria-hidden="true"
          className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full px-1 py-0 text-[10px] leading-none"
        >
          {textoBadge}
        </Badge>
      )}
    </Button>
  )

  // Contenido del panel (idéntico para Popover y Sheet).
  const contenidoPanel = (
    <PanelNotificaciones notificaciones={notificaciones} abierto={abierto} />
  )

  return (
    <>
      {/* Región aria-live para anuncios de lectores de pantalla (R13.3). */}
      <RegionAriaLive mensaje={mensajeAriaLive} />

      {isMobile ? (
        /* Móvil: Sheet deslizable desde abajo. */
        <Sheet open={abierto} onOpenChange={setAbierto}>
          <SheetTrigger asChild>{triggerCampana}</SheetTrigger>
          <SheetContent side="bottom" className="max-h-[80dvh] overflow-y-auto p-0">
            <SheetTitle className="sr-only">Notificaciones</SheetTitle>
            {contenidoPanel}
          </SheetContent>
        </Sheet>
      ) : (
        /* Desktop: Popover alineado al final del trigger. */
        <Popover open={abierto} onOpenChange={setAbierto}>
          <PopoverTrigger asChild>{triggerCampana}</PopoverTrigger>
          <PopoverContent
            align="end"
            sideOffset={8}
            className="w-80 p-0"
          >
            {contenidoPanel}
          </PopoverContent>
        </Popover>
      )}
    </>
  )
}
