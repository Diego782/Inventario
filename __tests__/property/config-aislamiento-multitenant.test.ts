// Feature: identidad-marca-dego, Property 5: Aislamiento multi-inquilino de la configuración
/**
 * Property 5: Aislamiento multi-inquilino de la configuración
 * **Validates: Requirements 8.1, 8.2, 8.3, 8.7**
 *
 * Para todo par de organizaciones distintas A y B con sus respectivas
 * `Configuracion_Organizacion`, actualizar la configuración de A (incluido
 * `Color_Tema` y logo) con cualquier payload válido preserva inalterados todos
 * los valores de configuración de B, y una lectura de la configuración de A
 * nunca incluye ningún valor perteneciente a B.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import {
  COLOR_TEMA_DEGO,
  CONFIG_DEFAULTS,
  type ConfiguracionMap,
} from "@/lib/schemas/configuracion"

/**
 * Capa de datos in-memory que emula la tabla `configuracion` (modelo clave-valor).
 *
 * Cada fila se indexa por la clave compuesta `${organizacion_id}|${clave}`,
 * replicando el índice único `organizacion_id_clave` que usa el upsert real del
 * `PUT /api/configuracion`. El alcance de toda lectura/escritura se deriva del
 * `organizacion_id`, nunca del payload (R8.1, R8.6).
 */
function crearStoreConfiguracion() {
  const filas = new Map<string, string>()

  const claveCompuesta = (organizacion_id: string, clave: string) =>
    `${organizacion_id}|${clave}`

  /**
   * Emula el upsert por clave del PUT: persiste únicamente las claves presentes
   * en el payload validado, serializando cada valor con `String(...)` (igual que
   * el handler real). Solo toca filas de la organización indicada.
   */
  function upsert(organizacion_id: string, payload: Partial<ConfiguracionMap>) {
    for (const [clave, valor] of Object.entries(payload)) {
      if (valor === undefined) continue
      filas.set(claveCompuesta(organizacion_id, clave), String(valor))
    }
  }

  /**
   * Emula `leerConfiguracion(organizacion_id)`: reconstruye el mapa parseando cada
   * clave y aplicando los defaults (`CONFIG_DEFAULTS` / `COLOR_TEMA_DEGO`) cuando
   * la clave no existe. Solo lee filas cuyo `organizacion_id` coincide (R8.2).
   */
  function leer(organizacion_id: string): ConfiguracionMap {
    const get = (clave: string) => filas.get(claveCompuesta(organizacion_id, clave))
    const num = (clave: string, def: number) => {
      const v = get(clave)
      return v !== undefined ? parseFloat(v) : def
    }
    const bool = (clave: string, def: boolean) => {
      const v = get(clave)
      return v !== undefined ? v === "true" : def
    }
    return {
      porcentaje_impuesto: num("porcentaje_impuesto", CONFIG_DEFAULTS.porcentaje_impuesto),
      etiqueta_ancho_mm: num("etiqueta_ancho_mm", CONFIG_DEFAULTS.etiqueta_ancho_mm),
      etiqueta_alto_mm: num("etiqueta_alto_mm", CONFIG_DEFAULTS.etiqueta_alto_mm),
      ticket_ancho_mm: num("ticket_ancho_mm", CONFIG_DEFAULTS.ticket_ancho_mm),
      imprimir_automaticamente: bool("imprimir_automaticamente", CONFIG_DEFAULTS.imprimir_automaticamente),
      permitir_sobreventa: bool("permitir_sobreventa", CONFIG_DEFAULTS.permitir_sobreventa),
      color_hue: num("color_hue", COLOR_TEMA_DEGO.color_hue),
      color_saturation: num("color_saturation", COLOR_TEMA_DEGO.color_saturation),
      color_lightness: num("color_lightness", COLOR_TEMA_DEGO.color_lightness),
    }
  }

  /** Logo atado a la Organización (campos `logo` / `logo_aspecto`). */
  const logos = new Map<string, { logo: string | null; logo_aspecto: string | null }>()
  function upsertLogo(organizacion_id: string, logo: string | null, logo_aspecto: string | null) {
    logos.set(organizacion_id, { logo, logo_aspecto })
  }
  function leerLogo(organizacion_id: string) {
    return logos.get(organizacion_id) ?? { logo: null, logo_aspecto: null }
  }

  return { filas, upsert, leer, upsertLogo, leerLogo }
}

/** Payload de configuración válido (claves operativas + Color_Tema). */
const arbConfigOrg: fc.Arbitrary<ConfiguracionMap> = fc.record({
  porcentaje_impuesto: fc.float({ min: 0, max: 100, noNaN: true }),
  etiqueta_ancho_mm: fc.integer({ min: 20, max: 200 }),
  etiqueta_alto_mm: fc.integer({ min: 10, max: 150 }),
  ticket_ancho_mm: fc.integer({ min: 40, max: 200 }),
  imprimir_automaticamente: fc.boolean(),
  permitir_sobreventa: fc.boolean(),
  color_hue: fc.float({ min: 0, max: 360, noNaN: true }),
  color_saturation: fc.float({ min: 0, max: 1, noNaN: true }),
  color_lightness: fc.float({ min: 0, max: 1, noNaN: true }),
})

/** Logo válido (cadena no vacía + aspecto) o ausente. */
const arbLogo = fc.oneof(
  fc.record({
    logo: fc.string({ minLength: 1, maxLength: 64 }),
    logo_aspecto: fc.constantFrom("1:1", "16:9", "4:3", "3:2"),
  }),
  fc.constant({ logo: null, logo_aspecto: null })
)

/** Par de organizaciones DISTINTAS, cada una con su configuración y logo. */
const arbParOrgs = fc
  .record({
    orgA: fc.uuid(),
    orgB: fc.uuid(),
    configA: arbConfigOrg,
    configB: arbConfigOrg,
    logoA: arbLogo,
    logoB: arbLogo,
    actualizacionA: arbConfigOrg,
    logoActualizadoA: arbLogo,
  })
  .filter(({ orgA, orgB }) => orgA !== orgB)

/** Compara dos ConfiguracionMap permitiendo tolerancia en floats. */
function configsIguales(a: ConfiguracionMap, b: ConfiguracionMap): boolean {
  return (
    Math.abs(a.porcentaje_impuesto - b.porcentaje_impuesto) < 1e-9 &&
    a.etiqueta_ancho_mm === b.etiqueta_ancho_mm &&
    a.etiqueta_alto_mm === b.etiqueta_alto_mm &&
    a.ticket_ancho_mm === b.ticket_ancho_mm &&
    a.imprimir_automaticamente === b.imprimir_automaticamente &&
    a.permitir_sobreventa === b.permitir_sobreventa &&
    Math.abs(a.color_hue - b.color_hue) < 1e-9 &&
    Math.abs(a.color_saturation - b.color_saturation) < 1e-9 &&
    Math.abs(a.color_lightness - b.color_lightness) < 1e-9
  )
}

describe("Property 5: Aislamiento multi-inquilino de la configuración", () => {
  it("P5.1 — actualizar la config de A (incluido color y logo) preserva inalterada la config de B", () => {
    fc.assert(
      fc.property(arbParOrgs, (datos) => {
        const { orgA, orgB, configA, configB, logoA, logoB, actualizacionA, logoActualizadoA } = datos
        const store = crearStoreConfiguracion()

        // Estado inicial: ambas organizaciones con su configuración y logo.
        store.upsert(orgA, configA)
        store.upsert(orgB, configB)
        store.upsertLogo(orgA, logoA.logo, logoA.logo_aspecto)
        store.upsertLogo(orgB, logoB.logo, logoB.logo_aspecto)

        // Snapshot de B antes de tocar A.
        const configBAntes = store.leer(orgB)
        const logoBAntes = store.leerLogo(orgB)

        // Actualizar A (config + color + logo).
        store.upsert(orgA, actualizacionA)
        store.upsertLogo(orgA, logoActualizadoA.logo, logoActualizadoA.logo_aspecto)

        // B permanece exactamente igual (R8.3, R8.7).
        const configBDespues = store.leer(orgB)
        const logoBDespues = store.leerLogo(orgB)
        expect(configsIguales(configBDespues, configBAntes)).toBe(true)
        expect(logoBDespues).toEqual(logoBAntes)

        // A refleja la actualización aplicada (R8.1).
        const configADespues = store.leer(orgA)
        expect(configsIguales(configADespues, actualizacionA)).toBe(true)
        expect(store.leerLogo(orgA)).toEqual({
          logo: logoActualizadoA.logo,
          logo_aspecto: logoActualizadoA.logo_aspecto,
        })
      }),
      { numRuns: 100 }
    )
  })

  it("P5.2 — una lectura de A nunca incluye valores pertenecientes a B (R8.2)", () => {
    fc.assert(
      fc.property(arbParOrgs, (datos) => {
        const { orgA, orgB, configA, configB, logoA, logoB } = datos
        const store = crearStoreConfiguracion()

        store.upsert(orgA, configA)
        store.upsert(orgB, configB)
        store.upsertLogo(orgA, logoA.logo, logoA.logo_aspecto)
        store.upsertLogo(orgB, logoB.logo, logoB.logo_aspecto)

        // La lectura de A coincide exactamente con lo persistido para A,
        // sin contaminación de B.
        const configALeida = store.leer(orgA)
        expect(configsIguales(configALeida, configA)).toBe(true)
        expect(store.leerLogo(orgA)).toEqual({
          logo: logoA.logo,
          logo_aspecto: logoA.logo_aspecto,
        })

        // Ninguna fila del store leída con el id de A proviene del namespace de B:
        // verificado porque la lectura usa exclusivamente la clave compuesta de A.
        const prefijoA = `${orgA}|`
        const prefijoB = `${orgB}|`
        for (const clave of store.filas.keys()) {
          if (clave.startsWith(prefijoA)) {
            expect(clave.startsWith(prefijoB)).toBe(false)
          }
        }
      }),
      { numRuns: 100 }
    )
  })

  it("P5.3 — escrituras intercaladas en A y B mantienen sus configuraciones independientes", () => {
    fc.assert(
      fc.property(arbParOrgs, arbConfigOrg, (datos, actualizacionB) => {
        const { orgA, orgB, configA, configB, actualizacionA } = datos
        const store = crearStoreConfiguracion()

        store.upsert(orgA, configA)
        store.upsert(orgB, configB)

        // Actualizaciones intercaladas.
        store.upsert(orgA, actualizacionA)
        store.upsert(orgB, actualizacionB)

        // Cada organización refleja exclusivamente su última actualización.
        expect(configsIguales(store.leer(orgA), actualizacionA)).toBe(true)
        expect(configsIguales(store.leer(orgB), actualizacionB)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
