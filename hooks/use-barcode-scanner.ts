"use client"
/**
 * hooks/use-barcode-scanner.ts
 * Hook para detectar escaneos de código de barras desde un lector USB-HID.
 *
 * El lector emula un teclado y emite los caracteres del código seguido de Enter.
 * La detección se basa en el timing entre teclas:
 * - Si Δt entre teclas ≤ umbralMs → es un escaneo del lector
 * - Si Δt > umbralMs → es entrada humana, se reinicia el buffer
 *
 * Mantiene una cola FIFO para no perder escaneos durante un fetch en curso.
 */
import { useEffect, useRef } from "react"

export type UseBarcodeScannerOptions = {
  /** Si false, el listener no está activo */
  enabled: boolean
  /** Tiempo máximo entre teclas para considerar escaneo (ms). Default: 80 */
  umbralMs?: number
  /** Longitud mínima del código para procesarlo. Default: 4 */
  longitudMin?: number
  /** Callback invocado con el código escaneado */
  onScan: (codigo: string) => void | Promise<void>
}

export function useBarcodeScanner(opts: UseBarcodeScannerOptions): void {
  const buffer = useRef<string>("")
  const lastTs = useRef<number>(0)
  const cola = useRef<string[]>([])
  const procesando = useRef<boolean>(false)
  const umbral = opts.umbralMs ?? 80
  const min = opts.longitudMin ?? 4
  // Ref para el callback para evitar re-registrar el listener en cada render
  const onScanRef = useRef(opts.onScan)
  onScanRef.current = opts.onScan

  useEffect(() => {
    if (!opts.enabled) return

    async function drenar() {
      if (procesando.current) return
      procesando.current = true
      try {
        while (cola.current.length > 0) {
          const codigo = cola.current.shift()!
          await onScanRef.current(codigo)
        }
      } finally {
        procesando.current = false
      }
    }

    function handler(ev: KeyboardEvent) {
      // Si el foco está en un input/textarea/select visible (no el campo oculto del scanner),
      // dejar que el usuario escriba normalmente sin interferir.
      const target = ev.target as HTMLElement | null
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") &&
        !target.classList.contains("sr-only") &&
        target.getAttribute("aria-hidden") !== "true"
      ) {
        // Limpiar el buffer para que una pausa al volver al scanner no genere falsos positivos
        buffer.current = ""
        lastTs.current = 0
        return
      }

      const now = performance.now()
      const delta = now - lastTs.current

      if (ev.key === "Enter") {
        const codigo = buffer.current
        buffer.current = ""
        lastTs.current = now

        // Solo procesar si la secuencia fue rápida (escáner) y tiene longitud mínima
        if (codigo.length >= min && delta <= umbral) {
          cola.current.push(codigo)
          drenar()
        }
        return
      }

      if (ev.key.length === 1) {
        // Si hay una pausa larga, reiniciar el buffer (entrada humana)
        if (delta > umbral && buffer.current.length > 0) {
          buffer.current = ""
        }
        buffer.current += ev.key
        lastTs.current = now
      }
    }

    window.addEventListener("keydown", handler)
    return () => {
      window.removeEventListener("keydown", handler)
    }
  }, [opts.enabled, umbral, min])
}
