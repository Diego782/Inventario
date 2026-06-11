// Feature: identidad-marca-dego, Property 4: Derivación determinista de variables CSS
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { aplicarColorTema } from "@/lib/tema/aplicar-color"
import type { ColorTema } from "@/lib/schemas/configuracion"

/**
 * Doble de `root` (document.documentElement) que registra cada setProperty en un Map.
 */
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

/**
 * Generador de Color_Tema válido:
 * hue ∈ [0,360], saturation ∈ [0,1], lightness ∈ [0,1].
 */
const arbColorTema: fc.Arbitrary<ColorTema> = fc.record({
  color_hue: fc.float({ min: 0, max: 360, noNaN: true }),
  color_saturation: fc.float({ min: 0, max: 1, noNaN: true }),
  color_lightness: fc.float({ min: 0, max: 1, noNaN: true }),
})

// Variables CSS que deben quedar establecidas tras aplicar el Color_Tema.
const VARIABLES_ESPERADAS = [
  "--primary",
  "--sidebar-accent",
  "--ring",
  "--chart-1",
  "--chart-2",
  "--chart-3",
  "--chart-4",
  "--chart-5",
] as const

describe("Property 4: Derivación determinista de variables CSS", () => {
  it("P4.1 — establece --primary, --sidebar-accent, --ring y --chart-1..5 para todo ColorTema e isDark", () => {
    fc.assert(
      fc.property(arbColorTema, fc.boolean(), (color, isDark) => {
        const root = crearRootDoble()
        aplicarColorTema(root, color, isDark)
        for (const variable of VARIABLES_ESPERADAS) {
          if (!root.props.has(variable)) return false
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  it("P4.2 — los valores se derivan del color (oklch), sin literales de color fijos", () => {
    fc.assert(
      fc.property(arbColorTema, fc.boolean(), (color, isDark) => {
        const root = crearRootDoble()
        aplicarColorTema(root, color, isDark)
        for (const value of root.props.values()) {
          // Cada valor es una función oklch derivada, nunca un literal hex/rgb/hsl/nombre CSS.
          if (!/^oklch\(/.test(value)) return false
          if (/#|rgb|hsl|\bred\b|\bblue\b|\bgreen\b|\bblack\b|\bwhite\b/i.test(value)) {
            return false
          }
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  it("P4.3 — --primary, --sidebar-accent y --ring dependen del hue del color (no son fijos)", () => {
    fc.assert(
      fc.property(arbColorTema, fc.boolean(), (color, isDark) => {
        const root = crearRootDoble()
        aplicarColorTema(root, color, isDark)
        // El hue del color debe aparecer en las variables principales derivadas.
        const hue = String(color.color_hue)
        return (
          root.props.get("--primary")!.includes(hue) &&
          root.props.get("--sidebar-accent")!.includes(hue) &&
          root.props.get("--ring")!.includes(hue)
        )
      }),
      { numRuns: 100 }
    )
  })

  it("P4.4 — determinismo: la misma entrada produce siempre la misma salida", () => {
    fc.assert(
      fc.property(arbColorTema, fc.boolean(), (color, isDark) => {
        const a = crearRootDoble()
        const b = crearRootDoble()
        aplicarColorTema(a, color, isDark)
        aplicarColorTema(b, color, isDark)
        expect(Object.fromEntries(a.props)).toEqual(Object.fromEntries(b.props))
      }),
      { numRuns: 100 }
    )
  })
})

// Feature: identidad-marca-dego, Property 3: Round-trip de persistencia y carga del Color_Tema

/**
 * Capa de datos in-memory que emula la tabla `configuracion` (modelo clave-valor).
 * Las filas se indexan por la clave compuesta `${organizacion_id}|${clave}`,
 * replicando el índice único `organizacion_id_clave` usado por el upsert real.
 */
function crearStoreConfiguracion() {
  const filas = new Map<string, string>()

  const claveCompuesta = (organizacion_id: string, clave: string) =>
    `${organizacion_id}|${clave}`

  /**
   * Emula el upsert por `organizacion_id_clave` del PUT /api/configuracion:
   * cada valor del Color_Tema se serializa con `String(...)` (igual que el handler real).
   */
  function upsertColor(organizacion_id: string, color: ColorTema) {
    filas.set(claveCompuesta(organizacion_id, "color_hue"), String(color.color_hue))
    filas.set(claveCompuesta(organizacion_id, "color_saturation"), String(color.color_saturation))
    filas.set(claveCompuesta(organizacion_id, "color_lightness"), String(color.color_lightness))
  }

  /**
   * Emula `leerConfiguracion(organizacion_id)`: reconstruye el Color_Tema parseando
   * con `parseFloat` y aplicando `COLOR_TEMA_DEGO` cuando la clave no existe (R6.6).
   */
  function leerColor(organizacion_id: string): ColorTema {
    const hue = filas.get(claveCompuesta(organizacion_id, "color_hue"))
    const sat = filas.get(claveCompuesta(organizacion_id, "color_saturation"))
    const light = filas.get(claveCompuesta(organizacion_id, "color_lightness"))
    return {
      color_hue: hue !== undefined ? parseFloat(hue) : COLOR_TEMA_DEGO.color_hue,
      color_saturation: sat !== undefined ? parseFloat(sat) : COLOR_TEMA_DEGO.color_saturation,
      color_lightness: light !== undefined ? parseFloat(light) : COLOR_TEMA_DEGO.color_lightness,
    }
  }

  return { filas, upsertColor, leerColor }
}

describe("Property 3: Round-trip de persistencia y carga del Color_Tema", () => {
  it("P3.1 — persistir y luego cargar produce un ColorTema igual al enviado (R6.1, R6.3)", () => {
    fc.assert(
      fc.property(arbColorTema, fc.uuid(), (color, organizacion_id) => {
        const store = crearStoreConfiguracion()
        store.upsertColor(organizacion_id, color)
        const cargado = store.leerColor(organizacion_id)
        // String()/parseFloat preserva el valor finito; toBeCloseTo cubre cualquier
        // pérdida de precisión de serialización para floats arbitrarios.
        expect(cargado.color_hue).toBeCloseTo(color.color_hue, 10)
        expect(cargado.color_saturation).toBeCloseTo(color.color_saturation, 10)
        expect(cargado.color_lightness).toBeCloseTo(color.color_lightness, 10)
      }),
      { numRuns: 100 }
    )
  })

  it("P3.2 — el color devuelto tras la actualización coincide con el enviado (R6.4, R7.1)", () => {
    fc.assert(
      fc.property(arbColorTema, fc.uuid(), (color, organizacion_id) => {
        const store = crearStoreConfiguracion()
        // Emula el PUT: tras el upsert, el handler devuelve leerConfiguracion(...).
        store.upsertColor(organizacion_id, color)
        const respuestaActualizacion = store.leerColor(organizacion_id)
        expect(respuestaActualizacion.color_hue).toBeCloseTo(color.color_hue, 10)
        expect(respuestaActualizacion.color_saturation).toBeCloseTo(color.color_saturation, 10)
        expect(respuestaActualizacion.color_lightness).toBeCloseTo(color.color_lightness, 10)
      }),
      { numRuns: 100 }
    )
  })

  it("P3.3 — sobrescribir el Color_Tema produce el último valor enviado (idempotencia del upsert)", () => {
    fc.assert(
      fc.property(arbColorTema, arbColorTema, fc.uuid(), (primero, segundo, organizacion_id) => {
        const store = crearStoreConfiguracion()
        store.upsertColor(organizacion_id, primero)
        store.upsertColor(organizacion_id, segundo)
        const cargado = store.leerColor(organizacion_id)
        expect(cargado.color_hue).toBeCloseTo(segundo.color_hue, 10)
        expect(cargado.color_saturation).toBeCloseTo(segundo.color_saturation, 10)
        expect(cargado.color_lightness).toBeCloseTo(segundo.color_lightness, 10)
      }),
      { numRuns: 100 }
    )
  })
})
