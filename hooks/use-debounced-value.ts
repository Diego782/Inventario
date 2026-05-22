"use client"
/**
 * hooks/use-debounced-value.ts
 * Hook que retrasa la actualización de un valor por `delay` ms.
 * Útil para búsquedas con debounce (R6.1, R20.2).
 */
import { useState, useEffect } from "react"

export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(timer)
    }
  }, [value, delay])

  return debouncedValue
}
