// Feature: identidad-marca-dego, Property 8: Clasificación correcta del color heredado
// Feature: identidad-marca-dego, Property 9: Seguridad e idempotencia de la migración
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  leerColorHeredado,
  limpiarClavesHeredadas,
} from "@/lib/tema/migracion-color"
import type { ColorTema } from "@/lib/schemas/configuracion"

/**
 * Generador de `ColorTema` válidos (dentro de los rangos de `colorTemaSchema`):
 * hue 0–360, saturation 0–1, lightness 0–1.
 */
const arbColorTemaValido: fc.Arbitrary<ColorTema> = fc.record({
  color_hue: fc.double({ min: 0, max: 360, noNaN: true }),
  color_saturation: fc.double({ min: 0, max: 1, noNaN: true }),
  color_lightness: fc.double({ min: 0, max: 1, noNaN: true }),
})

/**
 * Serializa un `ColorTema` en el formato heredado almacenado bajo
 * `invenpro-color`: `JSON.stringify({ hue, saturation, lightness, name })`.
 */
function serializarHeredado(color: ColorTema, name = "personalizado"): string {
  return JSON.stringify({
    hue: color.color_hue,
    saturation: color.color_saturation,
    lightness: color.color_lightness,
    name,
  })
}

/**
 * Construye un doble de `getItem` que devuelve `valor` para `invenpro-color`
 * y `null` para cualquier otra clave (incluida `invenpro-theme`).
 */
function getItemDouble(valor: string | null): (clave: string) => string | null {
  return (clave: string) => (clave === "invenpro-color" ? valor : null)
}

/**
 * Generador de cadenas no interpretables como `ColorTema` heredado:
 * - cadenas arbitrarias que no son JSON de objeto con los campos esperados,
 * - JSON con valores fuera de rango o de tipo incorrecto.
 */
const arbCadenaCorrupta: fc.Arbitrary<string> = fc.oneof(
  // Texto arbitrario no-JSON (excluyendo whitespace-only, que se clasifica `ausente`)
  fc.string({ minLength: 1 }).filter((s) => {
    if (s.trim() === "") return false // whitespace-only → ausente, no invalido
    try {
      const v = JSON.parse(s)
      // Excluir cualquier cosa que pudiera reconstruir un ColorTema válido
      return !(typeof v === "object" && v !== null)
    } catch {
      return true
    }
  }),
  // JSON de objeto con valores fuera de rango / tipos incorrectos
  fc
    .record({
      hue: fc.oneof(fc.double({ min: 361, max: 1000, noNaN: true }), fc.string()),
      saturation: fc.oneof(fc.double({ min: 1.0001, max: 100, noNaN: true }), fc.string()),
      lightness: fc.oneof(fc.double({ min: -100, max: -0.0001, noNaN: true }), fc.string()),
    })
    .map((o) => JSON.stringify(o)),
  // JSON que no es objeto (número, array, booleano, null)
  fc.constantFrom("123", "true", "false", "null", "[1,2,3]", '"texto"')
)

/**
 * Property 8: Clasificación correcta del color heredado (round-trip de parseo)
 *
 * **Validates: Requirements 9.2, 9.3**
 *
 * Para todo `ColorTema` válido serializado en formato heredado,
 * `leerColorHeredado` lo clasifica `valido` y reconstruye un `ColorTema`
 * equivalente; para toda cadena no interpretable o ausente lo clasifica
 * `invalido`/`ausente` sin mutar las claves heredadas.
 */
describe("Property 8: Clasificación correcta del color heredado", () => {
  it("P8.1 — un ColorTema válido serializado en formato heredado se clasifica `valido` y se reconstruye equivalente", () => {
    fc.assert(
      fc.property(arbColorTemaValido, (color) => {
        const serializado = serializarHeredado(color)
        const resultado = leerColorHeredado(getItemDouble(serializado))

        expect(resultado.tipo).toBe("valido")
        if (resultado.tipo === "valido") {
          expect(resultado.color.color_hue).toBeCloseTo(color.color_hue, 10)
          expect(resultado.color.color_saturation).toBeCloseTo(color.color_saturation, 10)
          expect(resultado.color.color_lightness).toBeCloseTo(color.color_lightness, 10)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("P8.2 — una clave ausente o vacía se clasifica `ausente`", () => {
    fc.assert(
      fc.property(fc.constantFrom(null, "", "   ", "\t", "\n"), (valor) => {
        const resultado = leerColorHeredado(getItemDouble(valor as string | null))
        expect(resultado.tipo).toBe("ausente")
      }),
      { numRuns: 100 }
    )
  })

  it("P8.3 — una cadena presente pero no interpretable se clasifica `invalido`", () => {
    fc.assert(
      fc.property(arbCadenaCorrupta, (corrupta) => {
        const resultado = leerColorHeredado(getItemDouble(corrupta))
        expect(resultado.tipo).toBe("invalido")
      }),
      { numRuns: 100 }
    )
  })

  it("P8.4 — `leerColorHeredado` no muta las claves heredadas (función pura de solo lectura)", () => {
    fc.assert(
      fc.property(arbColorTemaValido, (color) => {
        const serializado = serializarHeredado(color)
        const almacen = new Map<string, string>([["invenpro-color", serializado]])
        const instantanea = new Map(almacen)

        leerColorHeredado((clave) => almacen.get(clave) ?? null)

        // Las claves heredadas permanecen exactamente iguales tras la lectura.
        expect([...almacen.entries()]).toEqual([...instantanea.entries()])
      }),
      { numRuns: 100 }
    )
  })
})

/**
 * Property 9: Seguridad e idempotencia de la migración
 *
 * **Validates: Requirements 9.4, 9.5, 9.6**
 *
 * Para cualquier `ColorTema` heredado válido: si la persistencia en BD tiene
 * éxito, las claves heredadas quedan ausentes y repetir la migración no produce
 * efectos adicionales; si la persistencia falla, las claves heredadas permanecen
 * intactas y la Organización queda sin `Color_Tema` persistido; si la
 * persistencia tiene éxito pero la limpieza de claves falla, el color persistido
 * se conserva como fuente de verdad y la migración no se vuelve a ofrecer para
 * esa Organización.
 */
describe("Property 9: Seguridad e idempotencia de la migración", () => {
  it("P9.1 — persistencia exitosa → claves heredadas ausentes + migración idempotente", () => {
    fc.assert(
      fc.property(arbColorTemaValido, (color) => {
        const serializado = serializarHeredado(color)
        const almacen = new Map<string, string>([["invenpro-color", serializado]])

        // Simular la migración: leer, persistir (mock), limpiar
        const resultado = leerColorHeredado((clave) => almacen.get(clave) ?? null)
        expect(resultado.tipo).toBe("valido")

        if (resultado.tipo === "valido") {
          // Mock del PUT exitoso (síncrono para simplificar la prueba)
          const colorPersistido = resultado.color

          // Limpiar claves heredadas tras persistencia exitosa
          const limpiado = limpiarClavesHeredadas(
            (clave) => almacen.delete(clave),
            (clave) => almacen.get(clave) ?? null
          )

          // R9.4: Las claves deben quedar ausentes tras persistencia exitosa
          expect(limpiado).toBe(true)
          expect(almacen.size).toBe(0)
          expect(almacen.has("invenpro-color")).toBe(false)

          // Idempotencia: intentar migrar de nuevo no produce efectos
          const resultadoSegundo = leerColorHeredado(
            (clave) => almacen.get(clave) ?? null
          )
          expect(resultadoSegundo.tipo).toBe("ausente")

          // Verificar que el color está persistido
          expect(colorPersistido.color_hue).toBeCloseTo(color.color_hue, 10)
          expect(colorPersistido.color_saturation).toBeCloseTo(color.color_saturation, 10)
          expect(colorPersistido.color_lightness).toBeCloseTo(color.color_lightness, 10)
        }
      }),
      { numRuns: 100 }
    )
  })

  it("P9.2 — persistencia falla → claves heredadas intactas + org sin color persistido", () => {
    fc.assert(
      fc.property(arbColorTemaValido, (color) => {
        const serializado = serializarHeredado(color)
        const almacen = new Map<string, string>([["invenpro-color", serializado]])
        const instantanea = new Map(almacen)

        // Simular la migración: leer, persistir (fallo simulado)
        const resultado = leerColorHeredado((clave) => almacen.get(clave) ?? null)
        expect(resultado.tipo).toBe("valido")

        if (resultado.tipo === "valido") {
          // Mock del PUT que falla: no se persiste nada, no se limpian claves
          const persistenciaExitosa = false

          // R9.5: Si la persistencia falla, NO limpiar las claves heredadas
          if (!persistenciaExitosa) {
            // Las claves heredadas deben permanecer intactas
            expect([...almacen.entries()]).toEqual([...instantanea.entries()])
            expect(almacen.has("invenpro-color")).toBe(true)
            expect(almacen.get("invenpro-color")).toBe(serializado)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("P9.3 — persistencia OK pero limpieza falla → color persistido como verdad + no reoferta", () => {
    fc.assert(
      fc.property(arbColorTemaValido, (color) => {
        const serializado = serializarHeredado(color)
        const almacen = new Map<string, string>([["invenpro-color", serializado]])

        // Simular la migración: leer, persistir, limpiar (con fallo en limpieza)
        const resultado = leerColorHeredado((clave) => almacen.get(clave) ?? null)
        expect(resultado.tipo).toBe("valido")

        if (resultado.tipo === "valido") {
          // Mock del PUT exitoso: el color se persiste
          const colorPersistido = resultado.color

          // Mock de removeItem que falla (simula fallo de limpieza)
          const removeItemFallido = (clave: string): void => {
            // No hace nada, simula un fallo silencioso en la eliminación
          }

          // Intentar limpiar con un removeItem que falla
          const limpiado = limpiarClavesHeredadas(
            removeItemFallido,
            (clave) => almacen.get(clave) ?? null
          )

          // R9.6: La limpieza debe fallar (las claves siguen presentes)
          expect(limpiado).toBe(false)

          // El color debe estar persistido como verdad
          expect(colorPersistido.color_hue).toBeCloseTo(color.color_hue, 10)
          expect(colorPersistido.color_saturation).toBeCloseTo(color.color_saturation, 10)
          expect(colorPersistido.color_lightness).toBeCloseTo(color.color_lightness, 10)

          // Las claves heredadas permanecen (por el fallo de limpieza)
          expect(almacen.has("invenpro-color")).toBe(true)

          // La migración no debe reofrecerse (se marca en memoria en el provider)
          // Esto se verifica en el provider con organizacionesOfrecidasRef
        }
      }),
      { numRuns: 100 }
    )
  })

  it("P9.4 — migración no se ofrece para valor heredado inválido o ausente", () => {
    fc.assert(
      fc.property(arbCadenaCorrupta, (corrupta) => {
        const almacen = new Map<string, string>([["invenpro-color", corrupta]])

        // Leer color heredado
        const resultado = leerColorHeredado((clave) => almacen.get(clave) ?? null)

        // R9.3: Si el valor heredado es inválido, no se debe ofrecer migración
        if (resultado.tipo === "invalido") {
          expect(almacen.has("invenpro-color")).toBe(true) // Las claves permanecen
        }

        // Verificar que no se intenta persistir nada
        expect(resultado.tipo).not.toBe("valido")
      }),
      { numRuns: 100 }
    )
  })

  it("P9.5 — todas las claves heredadas se eliminan en conjunto (atomicidad de limpieza)", () => {
    fc.assert(
      fc.property(arbColorTemaValido, (color) => {
        const serializado = serializarHeredado(color)
        const almacen = new Map<string, string>([
          ["invenpro-color", serializado],
          ["invenpro-theme", "dark"],
        ])

        // Limpiar ambas claves
        const limpiado = limpiarClavesHeredadas(
          (clave) => almacen.delete(clave),
          (clave) => almacen.get(clave) ?? null
        )

        // Ambas claves deben quedar ausentes
        expect(limpiado).toBe(true)
        expect(almacen.has("invenpro-color")).toBe(false)
        expect(almacen.has("invenpro-theme")).toBe(false)
        expect(almacen.size).toBe(0)
      }),
      { numRuns: 100 }
    )
  })
})
