/**
 * Test unitario para lib/tema/aplicar-color.ts
 * Validates: Requirements R6.7, R4.1
 */

import { describe, it, expect } from "vitest"
import { aplicarColorTema } from "@/lib/tema/aplicar-color"
import type { ColorTema } from "@/lib/schemas/configuracion"

function crearRootDoble() {
  const props = new Map<string, string>()
  return {
    props,
    style: {
      setProperty(name: string, value: string) {
        props.set(name, value)
      },
    },
  }
}

const COLOR: ColorTema = {
  color_hue: 200,
  color_saturation: 0.5,
  color_lightness: 0.4,
}

describe("aplicarColorTema", () => {
  it("registra --primary, --sidebar-accent, --ring y --chart-1..5 (modo claro)", () => {
    const root = crearRootDoble()
    aplicarColorTema(root, COLOR, false)

    for (const variable of [
      "--primary",
      "--sidebar-accent",
      "--ring",
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--chart-4",
      "--chart-5",
    ]) {
      expect(root.props.has(variable)).toBe(true)
    }
  })

  it("registra --primary, --sidebar-accent, --ring y --chart-1..5 (modo oscuro)", () => {
    const root = crearRootDoble()
    aplicarColorTema(root, COLOR, true)

    for (const variable of [
      "--primary",
      "--sidebar-accent",
      "--ring",
      "--chart-1",
      "--chart-2",
      "--chart-3",
      "--chart-4",
      "--chart-5",
    ]) {
      expect(root.props.has(variable)).toBe(true)
    }
  })

  it("deriva los valores del ColorTema sin literales de color codificados", () => {
    const root = crearRootDoble()
    aplicarColorTema(root, COLOR, false)

    // --primary se deriva directamente del Color_Tema
    expect(root.props.get("--primary")).toBe("oklch(0.4 0.5 200)")
    // todos los valores escritos usan oklch derivado, no hex/rgb/hsl/nombres CSS
    for (const value of root.props.values()) {
      expect(value).toMatch(/^oklch\(/)
      expect(value).not.toMatch(/#|rgb|hsl|\bred\b|\bblue\b/i)
    }
  })

  it("es determinista: la misma entrada produce la misma salida", () => {
    const a = crearRootDoble()
    const b = crearRootDoble()
    aplicarColorTema(a, COLOR, true)
    aplicarColorTema(b, COLOR, true)
    expect(Object.fromEntries(a.props)).toEqual(Object.fromEntries(b.props))
  })
})
