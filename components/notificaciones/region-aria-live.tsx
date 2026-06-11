"use client"

// Feature: dashboard-metricas-notificaciones
// Región aria-live del Centro_Notificaciones (R13.3).
// Anuncia notificaciones nuevas a lectores de pantalla mediante una región
// `aria-live="polite"` con `aria-atomic="true"`. El mensaje se limpia
// automáticamente 3 segundos después de ser anunciado para no interferir
// con otras lecturas del lector de pantalla.
// El elemento está visualmente oculto pero permanece accesible para
// tecnologías de asistencia (técnica sr-only de Tailwind).
import * as React from "react"

export type RegionAriaLiveProps = {
  /** Texto del anuncio para lectores de pantalla. Cadena vacía = sin anuncio. */
  mensaje: string
}

/**
 * Región `aria-live="polite"` que anuncia nuevas notificaciones a tecnologías
 * de asistencia. Visualmente oculta pero siempre presente en el DOM (R13.3).
 */
export function RegionAriaLive({ mensaje }: RegionAriaLiveProps) {
  const [mensajeActivo, setMensajeActivo] = React.useState("")

  // Cuando llega un mensaje nuevo lo activa y lo limpia tras 3 s para evitar
  // re-lecturas ante cambios de estado del componente.
  React.useEffect(() => {
    if (!mensaje) return

    setMensajeActivo(mensaje)

    const temporizador = setTimeout(() => {
      setMensajeActivo("")
    }, 3_000)

    return () => clearTimeout(temporizador)
  }, [mensaje])

  return (
    <span
      role="status"
      aria-live="polite"
      aria-atomic="true"
      // sr-only: visualmente oculto pero legible por lectores de pantalla.
      className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden"
    >
      {mensajeActivo}
    </span>
  )
}
