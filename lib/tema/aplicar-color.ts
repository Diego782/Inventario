import type { ColorTema } from "@/lib/schemas/configuracion"

/**
 * Destino mínimo y testeable sobre el que se inyectan las variables CSS de color.
 * En producción se usa `document.documentElement`, pero al tiparlo así la función
 * puede recibir un doble de prueba sin depender del DOM.
 */
export type RootEstilizable = {
  style: { setProperty(name: string, value: string): void }
}

/**
 * Aplica el `Color_Tema` de una identidad visual inyectando las variables CSS
 * derivadas del color. Función pura respecto del `root` recibido: todos los
 * valores se calculan a partir de `color` (hue/saturation/lightness) y de `isDark`,
 * sin literales de color codificados (R4.1).
 *
 * Diseño del sidebar:
 * - Fondo neutro (blanco en claro / gris oscuro en oscuro) con texto de contraste.
 * - El Color_Tema se usa solo en los acentos: item activo, hover suave, foco y
 *   detalles (logo/avatar).
 *
 * Establece `--primary`, `--ring`, las variables `--sidebar*`, `--sidebar-hover`
 * y `--chart-1..5` (R6.7).
 */
export function aplicarColorTema(
  root: RootEstilizable,
  color: ColorTema,
  isDark: boolean
): void {
  const hue = color.color_hue
  const s = color.color_saturation
  const lightness = color.color_lightness

  const set = (name: string, value: string) => root.style.setProperty(name, value)

  const primario = `oklch(${lightness} ${s} ${hue})`

  // Texto que contrasta sobre el color primario (item activo).
  // Si el primario es claro usamos texto oscuro; si es oscuro, texto claro.
  const textoSobrePrimario =
    lightness > 0.65 ? `oklch(0.2 0 0)` : `oklch(0.99 0 0)`

  // Color primario y anillo de foco: derivados directamente del Color_Tema.
  set("--primary", primario)
  set("--primary-foreground", textoSobrePrimario)
  set("--ring", primario)

  // -------------------------------------------------------------------------
  // Sidebar: fondo neutro + acentos con el Color_Tema.
  // -------------------------------------------------------------------------
  if (isDark) {
    // Fondo gris oscuro, texto claro.
    set("--sidebar", `oklch(0.2 0 0)`)
    set("--sidebar-foreground", `oklch(0.95 0 0)`)
    set("--sidebar-border", `oklch(0.3 0 0)`)
    // Item activo: color primario sólido.
    set("--sidebar-accent", primario)
    set("--sidebar-accent-foreground", textoSobrePrimario)
    // Hover suave: tinte del primario sobre el fondo oscuro.
    set("--sidebar-hover", `oklch(0.3 ${s * 0.6} ${hue})`)
    // Detalles (logo/avatar): primario.
    set("--sidebar-primary", primario)
    set("--sidebar-primary-foreground", textoSobrePrimario)
    set("--sidebar-ring", primario)
  } else {
    // Fondo blanco, texto oscuro.
    set("--sidebar", `oklch(0.99 0 0)`)
    set("--sidebar-foreground", `oklch(0.22 0 0)`)
    set("--sidebar-border", `oklch(0.92 0 0)`)
    // Item activo: color primario sólido.
    set("--sidebar-accent", primario)
    set("--sidebar-accent-foreground", textoSobrePrimario)
    // Hover suave: tinte muy claro del primario.
    set("--sidebar-hover", `oklch(0.95 ${s * 0.5} ${hue})`)
    // Detalles (logo/avatar): primario.
    set("--sidebar-primary", primario)
    set("--sidebar-primary-foreground", textoSobrePrimario)
    set("--sidebar-ring", primario)
  }

  // Serie de gráficos: derivada del Color_Tema. Solo chart-2..4 difieren entre
  // modo claro y oscuro, igual que en la implementación original.
  set("--chart-1", primario)
  if (isDark) {
    set("--chart-2", `oklch(${lightness + 0.05} ${s * 0.8} ${hue})`)
    set("--chart-3", `oklch(${lightness - 0.1} ${s} ${hue})`)
    set("--chart-4", `oklch(${lightness + 0.1} ${s * 0.5} ${hue})`)
  } else {
    set("--chart-2", `oklch(${lightness + 0.1} ${s * 0.8} ${hue})`)
    set("--chart-3", `oklch(${lightness - 0.15} ${s} ${hue})`)
    set("--chart-4", `oklch(${lightness + 0.15} ${s * 0.5} ${hue})`)
  }
  set("--chart-5", `oklch(${lightness - 0.05} ${s * 1.1} ${hue})`)
}
