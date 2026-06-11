"use client"

/**
 * components/configuracion/recortar-logo-dialog.tsx
 * Editor de logo estilo WhatsApp: permite arrastrar y hacer zoom sobre la
 * imagen para elegir qué parte se recorta, según la proporción seleccionada.
 *
 * El recorte se realiza sobre un <canvas> y devuelve un data URL (PNG) listo
 * para guardarse en la organización.
 */

import { useCallback, useEffect, useRef, useState } from "react"
import { RotateCcw, ZoomIn } from "lucide-react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Slider } from "@/components/ui/slider"
import type { AspectoLogo } from "@/lib/schemas/organizaciones"

interface RecortarLogoDialogProps {
  open: boolean
  /** Imagen origen como data URL o object URL. */
  imagenSrc: string | null
  /** Proporción ancho:alto del recorte. */
  aspecto: AspectoLogo
  onClose: () => void
  onConfirmar: (dataUrl: string) => void
}

type Ratio = { w: number; h: number }

function parsearAspecto(aspecto: AspectoLogo): Ratio {
  const [w, h] = aspecto.split(":").map(Number)
  return { w: w || 1, h: h || 1 }
}

// Tamaño del lienzo de previsualización (área visible del recorte) en px CSS.
const VISTA_ANCHO = 320

export function RecortarLogoDialog({
  open,
  imagenSrc,
  aspecto,
  onClose,
  onConfirmar,
}: RecortarLogoDialogProps) {
  const ratio = parsearAspecto(aspecto)
  const vistaAlto = Math.round((VISTA_ANCHO * ratio.h) / ratio.w)

  const contenedorRef = useRef<HTMLDivElement>(null)

  const [imagen, setImagen] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [rotacion, setRotacion] = useState(0) // grados: 0, 90, 180, 270
  const [offset, setOffset] = useState({ x: 0, y: 0 })

  // Estado de arrastre
  const arrastre = useRef<{ activo: boolean; startX: number; startY: number; baseX: number; baseY: number }>({
    activo: false,
    startX: 0,
    startY: 0,
    baseX: 0,
    baseY: 0,
  })

  // Dimensiones "naturales" de la imagen teniendo en cuenta la rotación
  const dims = useCallback(() => {
    if (!imagen) return { w: 0, h: 0 }
    const girado = rotacion === 90 || rotacion === 270
    return {
      w: girado ? imagen.naturalHeight : imagen.naturalWidth,
      h: girado ? imagen.naturalWidth : imagen.naturalHeight,
    }
  }, [imagen, rotacion])

  // Escala mínima: la imagen cabe completamente dentro del área de recorte ("contain").
  // El usuario puede hacer zoom para cubrir o ampliar.
  const escalaBase = useCallback(() => {
    const { w, h } = dims()
    if (!w || !h) return 1
    return Math.min(VISTA_ANCHO / w, vistaAlto / h)
  }, [dims, vistaAlto])

  // Cargar la imagen cuando cambia la fuente
  useEffect(() => {
    if (!open || !imagenSrc) {
      setImagen(null)
      return
    }
    const img = new Image()
    img.onload = () => {
      setImagen(img)
      setZoom(1)
      setRotacion(0)
      setOffset({ x: 0, y: 0 })
    }
    img.src = imagenSrc
  }, [open, imagenSrc])

  // Reencuadrar (recentrar) cuando cambia la proporción o la rotación
  useEffect(() => {
    setOffset({ x: 0, y: 0 })
  }, [aspecto, rotacion])

  // Limita el offset para que no se vean bordes vacíos cuando la imagen
  // es más grande que el área de recorte. Si la imagen cabe completamente
  // (zoom bajo), el offset se fija en 0.
  const limitar = useCallback(
    (nx: number, ny: number, zoomActual: number) => {
      const { w, h } = dims()
      const escala = escalaBase() * zoomActual
      const imgW = w * escala
      const imgH = h * escala
      const maxX = Math.max(0, (imgW - VISTA_ANCHO) / 2)
      const maxY = Math.max(0, (imgH - vistaAlto) / 2)
      return {
        x: Math.min(maxX, Math.max(-maxX, nx)),
        y: Math.min(maxY, Math.max(-maxY, ny)),
      }
    },
    [dims, escalaBase, vistaAlto]
  )

  // Reajustar offset al cambiar zoom
  useEffect(() => {
    setOffset((prev) => limitar(prev.x, prev.y, zoom))
  }, [zoom, limitar])

  function onPointerDown(e: React.PointerEvent) {
    if (!imagen) return
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    arrastre.current = {
      activo: true,
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!arrastre.current.activo) return
    const dx = e.clientX - arrastre.current.startX
    const dy = e.clientY - arrastre.current.startY
    setOffset(limitar(arrastre.current.baseX + dx, arrastre.current.baseY + dy, zoom))
  }

  function onPointerUp() {
    arrastre.current.activo = false
  }

  function rotar() {
    setRotacion((r) => ((r + 90) % 360) as 0 | 90 | 180 | 270)
  }

  // Estilo de la imagen dentro del contenedor. Debe reflejar EXACTAMENTE la
  // lógica del canvas: la imagen se dibuja a su tamaño natural * escala,
  // centrada, desplazada por el offset y rotada alrededor de su centro.
  function estiloImagen(): React.CSSProperties {
    if (!imagen) return { display: "none" }
    const escala = escalaBase() * zoom
    return {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: imagen.naturalWidth * escala,
      height: imagen.naturalHeight * escala,
      transform: `translate(-50%, -50%) translate(${offset.x}px, ${offset.y}px) rotate(${rotacion}deg)`,
      transformOrigin: "center center",
      pointerEvents: "none",
      userSelect: "none",
      maxWidth: "none",
    }
  }

  // Genera el recorte final en un canvas a resolución alta
  function generarRecorte(): string | null {
    if (!imagen) return null

    // Resolución de salida (ancho fijo según calidad, alto según proporción)
    const SALIDA_ANCHO = 512
    const salidaAlto = Math.round((SALIDA_ANCHO * ratio.h) / ratio.w)

    const canvas = document.createElement("canvas")
    canvas.width = SALIDA_ANCHO
    canvas.height = salidaAlto
    const cxt = canvas.getContext("2d")
    if (!cxt) return null

    // Factor de escala de vista → salida
    const factor = SALIDA_ANCHO / VISTA_ANCHO
    const escala = escalaBase() * zoom * factor

    cxt.save()
    // Centro del canvas
    cxt.translate(canvas.width / 2 + offset.x * factor, canvas.height / 2 + offset.y * factor)
    cxt.rotate((rotacion * Math.PI) / 180)
    const dw = imagen.naturalWidth * escala
    const dh = imagen.naturalHeight * escala
    cxt.drawImage(imagen, -dw / 2, -dh / 2, dw, dh)
    cxt.restore()

    return canvas.toDataURL("image/png")
  }

  function confirmar() {
    const dataUrl = generarRecorte()
    if (dataUrl) {
      onConfirmar(dataUrl)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Ajustar logo</DialogTitle>
          <DialogDescription>
            Arrastra para mover y usa el zoom para elegir qué parte de la imagen se mostrará.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4">
          {/* Área de recorte */}
          <div
            ref={contenedorRef}
            className="relative overflow-hidden rounded-lg border border-border bg-muted touch-none"
            style={{ width: VISTA_ANCHO, height: vistaAlto, cursor: imagen ? "grab" : "default" }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
          >
            {imagen && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagen.src} alt="Recorte de logo" style={estiloImagen()} draggable={false} />
            )}

            {/* Cuadrícula tipo regla de tercios (estilo WhatsApp) */}
            <div className="pointer-events-none absolute inset-0">
              <div className="absolute inset-0 border-2 border-white/80" />
              <div className="absolute left-1/3 top-0 h-full w-px bg-white/40" />
              <div className="absolute left-2/3 top-0 h-full w-px bg-white/40" />
              <div className="absolute top-1/3 left-0 w-full h-px bg-white/40" />
              <div className="absolute top-2/3 left-0 w-full h-px bg-white/40" />
            </div>
          </div>

          {/* Zoom */}
          <div className="flex w-full items-center gap-3">
            <ZoomIn className="h-4 w-4 text-muted-foreground shrink-0" />
            <Slider
              min={1}
              max={4}
              step={0.01}
              value={[zoom]}
              onValueChange={(v) => setZoom(v[0] ?? 1)}
              disabled={!imagen}
              aria-label="Zoom"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={rotar}
              disabled={!imagen}
              aria-label="Rotar"
              title="Rotar"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={confirmar} disabled={!imagen}>
            Aplicar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
