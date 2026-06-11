"use client"

import * as React from "react"
import { useTheme as useNextTheme } from "next-themes"

/**
 * Colores resueltos del tema activo, leídos de las variables CSS para pasarlos
 * a `recharts` (que no entiende clases de Tailwind ni `var(--x)` en todos los
 * contextos). Mapea las CSS custom properties del tema vigente:
 * `--primary`, `--chart-1`, `--chart-2`, `--muted`, `--foreground`.
 */
export type ColoresTema = {
  primary: string
  chart1: string
  chart2: string
  muted: string
  foreground: string
}

export type UseTema = {
  tema: "light" | "dark"
  colores: ColoresTema
}

/**
 * Variables CSS leídas para cada color expuesto.
 */
const VARIABLES_CSS = {
  primary: "--primary",
  chart1: "--chart-1",
  chart2: "--chart-2",
  muted: "--muted",
  foreground: "--foreground",
} as const

/**
 * Fallback usado durante SSR / primer render antes de poder acceder al DOM.
 * Son cadenas vacías: `recharts` simplemente no recibe color hasta que el
 * efecto recalcula con los valores reales (evita mismatch de hidratación y
 * accesos a `document` en el servidor — R12.4).
 */
const COLORES_VACIOS: ColoresTema = {
  primary: "",
  chart1: "",
  chart2: "",
  muted: "",
  foreground: "",
}

/**
 * Lee las variables CSS del tema activo desde `:root` (`document.documentElement`)
 * y las normaliza con `trim()`. Sólo debe invocarse en el cliente.
 */
function leerColores(): ColoresTema {
  if (typeof document === "undefined") return COLORES_VACIOS
  const estilos = getComputedStyle(document.documentElement)
  return {
    primary: estilos.getPropertyValue(VARIABLES_CSS.primary).trim(),
    chart1: estilos.getPropertyValue(VARIABLES_CSS.chart1).trim(),
    chart2: estilos.getPropertyValue(VARIABLES_CSS.chart2).trim(),
    muted: estilos.getPropertyValue(VARIABLES_CSS.muted).trim(),
    foreground: estilos.getPropertyValue(VARIABLES_CSS.foreground).trim(),
  }
}

/**
 * Expone el modo claro/oscuro vigente (`next-themes`) y los colores resueltos
 * del tema para gráficas (R5.8, R5.9, R12.4).
 *
 * Recalcula los colores cada vez que cambia el tema, de modo que las gráficas
 * que consumen `colores` vuelven a renderizar con la paleta correcta al
 * alternar entre claro y oscuro (dentro de ~1s, sin recarga).
 *
 * Acceso a `document` confinado a `useEffect` para ser seguro en SSR.
 */
export function useTema(): UseTema {
  const { theme, resolvedTheme } = useNextTheme()
  const tema: "light" | "dark" =
    (resolvedTheme ?? theme) === "dark" ? "dark" : "light"

  const [colores, setColores] = React.useState<ColoresTema>(COLORES_VACIOS)

  React.useEffect(() => {
    setColores(leerColores())
    // Re-lee cuando cambia el tema activo: la clase `.dark` ya fue aplicada al
    // `<html>` por next-themes, por lo que `getComputedStyle` devuelve los
    // valores del tema vigente.
  }, [tema])

  return { tema, colores }
}
