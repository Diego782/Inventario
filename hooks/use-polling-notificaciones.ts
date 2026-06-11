"use client"

// Feature: dashboard-metricas-notificaciones
// Hook de cliente que sondea periódicamente el conteo de notificaciones sin leer
// (R10.1, R11.1–R11.5). Hace polling cada 30 s a `GET /api/notificaciones/conteo`
// con un `AbortController` que aborta a los 10 s (R11.1, R11.4). Cuando el conteo
// aumenta respecto al ciclo previo, actualiza el badge, dispara `onAumento` y, si
// el sonido no está silenciado, reproduce una vez por ciclo (R11.3). Ante fallo o
// timeout conserva el conteo previo y reintenta en el siguiente intervalo sin
// detener el ciclo (R11.5).
import * as React from "react"

import { useSonidoNotificacion } from "@/hooks/use-sonido-notificacion"

/** Intervalo de sondeo en milisegundos (R11.1). */
const INTERVALO_MS = 30_000

/** Timeout por petición en milisegundos antes de abortar (R11.4). */
const TIMEOUT_MS = 10_000

/** Endpoint del conteo de notificaciones sin leer. */
const URL_CONTEO = "/api/notificaciones/conteo"

export type UsePollingNotificaciones = {
  /** Conteo de notificaciones sin leer del último ciclo exitoso. */
  conteo: number
  /**
   * Registra un callback que se invoca exactamente una vez por ciclo en el que
   * el conteo aumenta respecto al valor previo, recibiendo el nuevo conteo.
   */
  onAumento(cb: (nuevo: number) => void): void
}

/**
 * Realiza una única consulta del conteo con timeout. Devuelve el entero ≥ 0 del
 * cuerpo `{ conteo }` o `null` si la petición falla, expira o el cuerpo no es
 * válido. No lanza: el ciclo de polling debe continuar pase lo que pase (R11.5).
 */
async function consultarConteo(): Promise<number | null> {
  if (typeof fetch === "undefined") return null

  const controlador = new AbortController()
  const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_MS)

  try {
    const res = await fetch(URL_CONTEO, {
      method: "GET",
      signal: controlador.signal,
      headers: { Accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) return null
    const cuerpo = (await res.json()) as unknown
    const valor = (cuerpo as { conteo?: unknown })?.conteo
    if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) {
      return null
    }
    return Math.trunc(valor)
  } catch {
    // Timeout (abort), error de red o JSON inválido: conservamos el conteo previo.
    return null
  } finally {
    clearTimeout(temporizador)
  }
}

/**
 * Sondea el conteo de notificaciones sin leer cada 30 s mientras el componente
 * esté montado. Limpia el intervalo y aborta cualquier petición en curso al
 * desmontar. SSR-safe: el efecto sólo corre en el cliente.
 */
export function usePollingNotificaciones(): UsePollingNotificaciones {
  const { silenciado, reproducir } = useSonidoNotificacion()

  const [conteo, setConteo] = React.useState(0)

  // Conteo previo persistido fuera del render para comparar entre ciclos.
  const conteoPrevioRef = React.useRef(0)

  // Callback de aumento registrado por el consumidor (R11.3).
  const onAumentoRef = React.useRef<((nuevo: number) => void) | null>(null)

  const onAumento = React.useCallback((cb: (nuevo: number) => void) => {
    onAumentoRef.current = cb
  }, [])

  // Mantiene la referencia actual de `reproducir`/`silenciado` sin reiniciar el
  // intervalo en cada cambio de preferencia de sonido.
  const reproducirRef = React.useRef(reproducir)
  const silenciadoRef = React.useRef(silenciado)
  React.useEffect(() => {
    reproducirRef.current = reproducir
    silenciadoRef.current = silenciado
  }, [reproducir, silenciado])

  React.useEffect(() => {
    if (typeof window === "undefined") return

    let activo = true

    const cicloPolling = async () => {
      const nuevo = await consultarConteo()
      if (!activo || nuevo === null) return // fallo/timeout: conserva conteo previo.

      const previo = conteoPrevioRef.current
      if (nuevo > previo) {
        // Dispara el callback una sola vez por ciclo con aumento (R11.3).
        onAumentoRef.current?.(nuevo)
        // Reproduce el sonido si no está silenciado (R11.3).
        if (!silenciadoRef.current) {
          reproducirRef.current()
        }
      }

      conteoPrevioRef.current = nuevo
      setConteo(nuevo)
    }

    // Primera consulta inmediata y luego cada 30 s.
    void cicloPolling()
    const id = setInterval(() => void cicloPolling(), INTERVALO_MS)

    return () => {
      activo = false
      clearInterval(id)
    }
  }, [])

  return { conteo, onAumento }
}
