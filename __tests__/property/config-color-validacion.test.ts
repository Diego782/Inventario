// Feature: identidad-marca-dego, Property 6: Rechazo y no-mutación ante payload inválido
// **Validates: Requirements 6.5**
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  actualizarConfiguracionSchema,
  COLOR_TEMA_DEGO,
} from "@/lib/schemas/configuracion"
import type { ColorTema } from "@/lib/schemas/configuracion"

/**
 * Generador de payloads INVÁLIDOS para las claves `color_*`.
 *
 * Cubre los dos modos de invalidez exigidos por R6.5:
 *   1) valor fuera de rango (hue < 0 o > 360, saturation/lightness < 0 o > 1)
 *   2) valor de tipo erróneo (string, boolean, null) donde se espera number
 *
 * Cada payload generado falla `actualizarConfiguracionSchema` por al menos
 * uno de los tres campos de color.
 */

// hue fuera de rango: < 0 o > 360
const arbHueFueraRango = fc.oneof(
  fc.float({ min: Math.fround(360.0001), max: 1e6, noNaN: true }),
  fc.float({ min: -1e6, max: Math.fround(-0.0001), noNaN: true })
)

// saturation/lightness fuera de rango: < 0 o > 1
const arbUnitFueraRango = fc.oneof(
  fc.float({ min: Math.fround(1.0001), max: 1e6, noNaN: true }),
  fc.float({ min: -1e6, max: Math.fround(-0.0001), noNaN: true })
)

// valores de tipo erróneo: nunca un number válido
const arbTipoErroneo = fc.oneof(
  fc.string(),
  fc.boolean(),
  fc.constant(null),
  fc.constant("0.5"), // numérico pero como string → tipo erróneo para z.number()
  fc.constant(Number.NaN)
)

/**
 * arbPayloadInvalido: produce un objeto con al menos un campo `color_*`
 * inválido (fuera de rango o tipo erróneo). Garantiza la invalidez eligiendo
 * un campo "culpable" que siempre incumple el esquema.
 */
const arbPayloadInvalido: fc.Arbitrary<Record<string, unknown>> = fc
  .record({
    color_hue: fc.oneof(arbHueFueraRango, arbTipoErroneo),
    color_saturation: fc.oneof(arbUnitFueraRango, arbTipoErroneo),
    color_lightness: fc.oneof(arbUnitFueraRango, arbTipoErroneo),
    culpable: fc.constantFrom(
      "color_hue",
      "color_saturation",
      "color_lightness"
    ),
  })
  .map(({ color_hue, color_saturation, color_lightness, culpable }) => {
    // Empezamos con un payload válido y corrompemos solo el campo culpable,
    // de modo que la invalidez sea determinista e inequívoca.
    const valido: Record<string, unknown> = {
      color_hue: 200,
      color_saturation: 0.5,
      color_lightness: 0.4,
    }
    const invalido = { ...valido }
    if (culpable === "color_hue") invalido.color_hue = color_hue
    if (culpable === "color_saturation") invalido.color_saturation = color_saturation
    if (culpable === "color_lightness") invalido.color_lightness = color_lightness
    return invalido
  })

/**
 * Capa de datos in-memory que emula la tabla `configuracion` (clave-valor),
 * con upsert por `organizacion_id_clave` y lectura con `parseFloat`/defaults.
 * Refleja la lógica del handler PUT /api/configuracion.
 */
function crearStoreConfiguracion() {
  const filas = new Map<string, string>()
  const claveCompuesta = (organizacion_id: string, clave: string) =>
    `${organizacion_id}|${clave}`

  function upsertColor(organizacion_id: string, color: ColorTema) {
    filas.set(claveCompuesta(organizacion_id, "color_hue"), String(color.color_hue))
    filas.set(
      claveCompuesta(organizacion_id, "color_saturation"),
      String(color.color_saturation)
    )
    filas.set(
      claveCompuesta(organizacion_id, "color_lightness"),
      String(color.color_lightness)
    )
  }

  function leerColor(organizacion_id: string): ColorTema {
    const hue = filas.get(claveCompuesta(organizacion_id, "color_hue"))
    const sat = filas.get(claveCompuesta(organizacion_id, "color_saturation"))
    const light = filas.get(claveCompuesta(organizacion_id, "color_lightness"))
    return {
      color_hue: hue !== undefined ? parseFloat(hue) : COLOR_TEMA_DEGO.color_hue,
      color_saturation:
        sat !== undefined ? parseFloat(sat) : COLOR_TEMA_DEGO.color_saturation,
      color_lightness:
        light !== undefined ? parseFloat(light) : COLOR_TEMA_DEGO.color_lightness,
    }
  }

  return { filas, upsertColor, leerColor }
}

/**
 * Emula el handler PUT /api/configuracion en lo relativo a la validación:
 * valida con Zod y SOLO persiste si la validación tiene éxito. Devuelve el
 * código HTTP correspondiente (422 ante fallo de validación).
 */
function manejarPut(
  store: ReturnType<typeof crearStoreConfiguracion>,
  organizacion_id: string,
  payload: unknown
): { status: number; detalle?: Record<string, string[]> } {
  const parsed = actualizarConfiguracionSchema.safeParse(payload)
  if (!parsed.success) {
    // Mapeable a HTTP 422 con detalle por campo.
    return {
      status: 422,
      detalle: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    }
  }
  // Solo se persiste cuando la validación pasa.
  const data = parsed.data
  if (
    data.color_hue !== undefined &&
    data.color_saturation !== undefined &&
    data.color_lightness !== undefined
  ) {
    store.upsertColor(organizacion_id, {
      color_hue: data.color_hue,
      color_saturation: data.color_saturation,
      color_lightness: data.color_lightness,
    })
  }
  return { status: 200 }
}

describe("Property 6: Rechazo y no-mutación ante payload inválido", () => {
  it("P6.1 — todo payload de color inválido falla safeParse (R6.5)", () => {
    fc.assert(
      fc.property(arbPayloadInvalido, (payload) => {
        const resultado = actualizarConfiguracionSchema.safeParse(payload)
        return resultado.success === false
      }),
      { numRuns: 100 }
    )
  })

  it("P6.2 — el fallo es mapeable a HTTP 422 con detalle por campo (R6.5)", () => {
    fc.assert(
      fc.property(arbPayloadInvalido, fc.uuid(), (payload, organizacion_id) => {
        const store = crearStoreConfiguracion()
        const res = manejarPut(store, organizacion_id, payload)
        // 422 y al menos un campo de color con detalle del motivo.
        if (res.status !== 422) return false
        const campos = Object.keys(res.detalle ?? {})
        return campos.some((c) =>
          ["color_hue", "color_saturation", "color_lightness"].includes(c)
        )
      }),
      { numRuns: 100 }
    )
  })

  it("P6.3 — ante payload inválido el ColorTema persistido permanece sin cambios (R6.5)", () => {
    fc.assert(
      fc.property(
        // color preexistente válido + payload inválido
        fc.record({
          color_hue: fc.float({ min: 0, max: 360, noNaN: true }),
          color_saturation: fc.float({ min: 0, max: 1, noNaN: true }),
          color_lightness: fc.float({ min: 0, max: 1, noNaN: true }),
        }),
        arbPayloadInvalido,
        fc.uuid(),
        (colorPrevio, payloadInvalido, organizacion_id) => {
          const store = crearStoreConfiguracion()
          // Estado inicial: un color válido ya persistido.
          store.upsertColor(organizacion_id, colorPrevio)
          const antes = store.leerColor(organizacion_id)

          // Intento de actualización con payload inválido → debe ser rechazado.
          const res = manejarPut(store, organizacion_id, payloadInvalido)
          expect(res.status).toBe(422)

          // El color persistido no cambió.
          const despues = store.leerColor(organizacion_id)
          expect(despues).toEqual(antes)
        }
      ),
      { numRuns: 100 }
    )
  })
})
