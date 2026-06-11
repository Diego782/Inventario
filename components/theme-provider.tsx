"use client"

import { ReactNode, useState } from "react"
import {
  ThemeProvider as NextThemesProvider,
  useTheme as useNextTheme,
} from "next-themes"

/**
 * Modo claro/oscuro (R9.7): delegado por completo a `next-themes`.
 *
 * Este componente se reduce a un wrapper de `next-themes` con
 * `attribute="class"` que gestiona ÚNICAMENTE la preferencia de modo
 * claro/oscuro del navegador. Ya NO inyecta variables de color (`--primary`,
 * `--sidebar-accent`, `--ring`, `--chart-*`) ni lee/escribe las claves
 * heredadas `invenpro-color` / `invenpro-theme` como fuente de verdad del
 * color (R9.1). La autoridad del `Color_Tema` pasa al `IdentidadVisualProvider`
 * (ver `hooks/use-identidad-visual.tsx`, tarea 5.2).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="light"
      enableSystem={false}
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  )
}

// ---------------------------------------------------------------------------
// Compatibilidad temporal
//
// El color primario (`Color_Tema`) se gestiona ahora en el
// `IdentidadVisualProvider` (tarea 5.2). Mientras ese provider y el rediseño de
// `ConfiguracionSection` no estén integrados, se conserva un shim mínimo para
// que los consumidores existentes sigan compilando. Este shim NO inyecta
// variables CSS ni persiste nada: la fuente de verdad del color será la API.
// TODO(5.2): eliminar este shim y migrar los consumidores a `useIdentidadVisual`.
// ---------------------------------------------------------------------------

export interface ThemeColors {
  hue: number
  saturation: number
  lightness: number
  name: string
}

// Catálogo de colores pastel predefinidos. Es solo data (sin referencia a
// `--primary` ni a las claves heredadas); el `IdentidadVisualProvider` decidirá
// cómo se aplican.
export const presetColors: ThemeColors[] = [
  { hue: 25, saturation: 0.12, lightness: 0.58, name: "Coral" },
  { hue: 250, saturation: 0.12, lightness: 0.65, name: "Lavanda" },
  { hue: 145, saturation: 0.1, lightness: 0.6, name: "Menta" },
  { hue: 35, saturation: 0.12, lightness: 0.65, name: "Melocoton" },
  { hue: 280, saturation: 0.1, lightness: 0.65, name: "Lila" },
  { hue: 330, saturation: 0.1, lightness: 0.68, name: "Rosa" },
  { hue: 180, saturation: 0.1, lightness: 0.6, name: "Aqua" },
  { hue: 60, saturation: 0.1, lightness: 0.7, name: "Vainilla" },
]

type Theme = "light" | "dark"

/**
 * Shim de compatibilidad sobre `next-themes`.
 *
 * Expone `theme`/`setTheme` reales (modo claro/oscuro) y un par
 * `primaryColor`/`setPrimaryColor` en memoria (sin efecto sobre las variables
 * CSS) para mantener compilando a los consumidores previos hasta la tarea 5.2.
 */
export function useTheme() {
  const { theme, resolvedTheme, setTheme: setNextTheme } = useNextTheme()
  const [primaryColor, setPrimaryColor] = useState<ThemeColors>(presetColors[0])

  return {
    theme: (resolvedTheme ?? theme ?? "light") as Theme,
    setTheme: (next: Theme) => setNextTheme(next),
    primaryColor,
    setPrimaryColor,
  }
}
