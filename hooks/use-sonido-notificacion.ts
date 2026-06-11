'use client'

import * as React from 'react'

/**
 * Clave de `localStorage` donde se persiste la preferencia de silencio del
 * sonido de notificaciones (R10.5).
 */
const CLAVE_SILENCIADO = 'dego:sonido_notificacion'

/** Ruta del asset de sonido servido desde `public/` (R10.2). */
const RUTA_SONIDO = '/notificacion.mp3'

/** Volumen sutil fijo del sonido de notificación (R10.2). */
const VOLUMEN = 0.5

export type UseSonidoNotificacion = {
  /** `true` si el usuario silenció el sonido de notificaciones. */
  silenciado: boolean
  /** Alterna el silencio y persiste la preferencia en `localStorage` (R10.5). */
  alternarSilencio(): void
  /**
   * Reproduce el sonido de notificación (volumen 0.5). Tolera el bloqueo de
   * autoplay del navegador sin lanzar ni mostrar error (R10.8). No suena si
   * está silenciado.
   */
  reproducir(): void
}

/**
 * Lee la preferencia de silencio desde `localStorage`. Por defecto el sonido
 * está activado (no silenciado) cuando no hay preferencia previa (R10.6).
 * SSR-safe: si `window`/`localStorage` no existen, devuelve `false`.
 */
function leerPreferencia(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(CLAVE_SILENCIADO) === 'true'
  } catch {
    return false
  }
}

export function useSonidoNotificacion(): UseSonidoNotificacion {
  const [silenciado, setSilenciado] = React.useState(false)

  // Hidrata la preferencia tras el montaje para evitar desajustes SSR/cliente.
  React.useEffect(() => {
    setSilenciado(leerPreferencia())
  }, [])

  // Audio perezoso: se crea una sola vez, sólo en el cliente.
  const audioRef = React.useRef<HTMLAudioElement | null>(null)

  const obtenerAudio = React.useCallback((): HTMLAudioElement | null => {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null
    if (audioRef.current === null) {
      const audio = new Audio(RUTA_SONIDO)
      audio.volume = VOLUMEN
      audioRef.current = audio
    }
    return audioRef.current
  }, [])

  const alternarSilencio = React.useCallback(() => {
    setSilenciado((prev) => {
      const siguiente = !prev
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(CLAVE_SILENCIADO, String(siguiente))
        } catch {
          // Ignora errores de persistencia (modo privado, cuota, etc.).
        }
      }
      return siguiente
    })
  }, [])

  const reproducir = React.useCallback(() => {
    if (silenciado) return
    const audio = obtenerAudio()
    if (audio === null) return
    try {
      audio.currentTime = 0
      const promesa = audio.play()
      // `play()` devuelve una promesa que puede rechazarse por bloqueo de
      // autoplay; la absorbemos sin propagar ni mostrar error (R10.8).
      if (promesa && typeof promesa.catch === 'function') {
        promesa.catch(() => {})
      }
    } catch {
      // Cualquier error síncrono también se tolera silenciosamente.
    }
  }, [silenciado, obtenerAudio])

  return { silenciado, alternarSilencio, reproducir }
}
