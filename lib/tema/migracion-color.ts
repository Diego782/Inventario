import { colorTemaSchema, type ColorTema } from "@/lib/schemas/configuracion"

/**
 * Claves heredadas de `localStorage` usadas por la versión anterior del
 * `ThemeProvider` (`components/theme-provider.tsx`). Ya no son fuente de verdad
 * del color: solo se leen para ofrecer una migración única hacia la BD (R9.1).
 *
 * - `invenpro-color`: `JSON.stringify({ hue, saturation, lightness, name })`.
 * - `invenpro-theme`: cadena de modo (`"light"` | `"dark"`), no es un color.
 */
export const CLAVES_HEREDADAS = ["invenpro-color", "invenpro-theme"] as const

/** Resultado de interpretar un valor heredado de `localStorage`. */
export type ResultadoMigracion =
  | { tipo: "valido"; color: ColorTema }
  | { tipo: "ausente" }
  | { tipo: "invalido" } // presente pero no interpretable (R9.3)

/**
 * Reconstruye un `ColorTema` a partir de la forma heredada `ThemeColors`
 * (`{ hue, saturation, lightness, name }`) y lo valida con `colorTemaSchema`.
 *
 * Devuelve `null` si el objeto no es interpretable como un `ColorTema` válido.
 */
function reconstruirColorTema(valor: unknown): ColorTema | null {
  if (typeof valor !== "object" || valor === null) {
    return null
  }

  const objeto = valor as Record<string, unknown>

  // Formato heredado: { hue, saturation, lightness, name }
  const candidato = {
    color_hue: objeto.hue,
    color_saturation: objeto.saturation,
    color_lightness: objeto.lightness,
  }

  const resultado = colorTemaSchema.safeParse(candidato)
  return resultado.success ? resultado.data : null
}

/**
 * Lee y valida la clave heredada `invenpro-color` sin mutar nada (función pura).
 *
 * - `{ tipo: "ausente" }` cuando la clave no existe o está vacía.
 * - `{ tipo: "valido", color }` cuando contiene un `ColorTema` interpretable.
 * - `{ tipo: "invalido" }` cuando está presente pero no es interpretable (R9.3).
 *
 * El accesor `getItem` se recibe por parámetro para mantener la función pura y
 * testeable sin depender del `localStorage` global.
 */
export function leerColorHeredado(
  getItem: (clave: string) => string | null
): ResultadoMigracion {
  const crudo = getItem("invenpro-color")

  if (crudo === null || crudo.trim() === "") {
    return { tipo: "ausente" }
  }

  let parseado: unknown
  try {
    parseado = JSON.parse(crudo)
  } catch {
    return { tipo: "invalido" }
  }

  const color = reconstruirColorTema(parseado)
  if (color === null) {
    return { tipo: "invalido" }
  }

  return { tipo: "valido", color }
}

/**
 * Elimina ambas claves heredadas de `localStorage` y devuelve `true` si ambas
 * quedaron ausentes tras la eliminación (R9.4).
 *
 * Los accesores `removeItem`/`getItem` se reciben por parámetro para mantener la
 * función pura y testeable.
 */
export function limpiarClavesHeredadas(
  removeItem: (clave: string) => void,
  getItem: (clave: string) => string | null
): boolean {
  for (const clave of CLAVES_HEREDADAS) {
    removeItem(clave)
  }

  return CLAVES_HEREDADAS.every((clave) => getItem(clave) === null)
}
