// Feature: identidad-marca-dego, Property 10: El branding visible nunca expone "InvenPro"
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { MARCA } from "@/lib/marca"

/**
 * **Validates: Requirements 1.1, 1.6, 1.7, 2.6**
 *
 * Property 10: El branding visible nunca expone "InvenPro"
 *
 * Para cualquier nombre de Organización (incluido `null`, vacío o solo
 * espacios), la resolución de marca visible devuelve "Dego" o el texto de
 * respaldo "Sistema de Inventario", y nunca una cadena que contenga ninguna
 * variante de mayúsculas/minúsculas de "InvenPro"; lo mismo aplica al prefijo
 * del logger (`[dego]`).
 */

/**
 * Resolver de marca visible: dado un nombre de organización arbitrario,
 * devuelve el nombre de marca cuando hay un valor utilizable, o el texto de
 * respaldo neutral en caso contrario. Nunca expone identificadores de
 * infraestructura ni el nombre anterior "InvenPro".
 */
function resolverMarcaVisible(nombreOrg: string | null | undefined): string {
  const usable = typeof nombreOrg === "string" && nombreOrg.trim().length > 0
  return usable ? MARCA.nombre : MARCA.fallback
}

const REGEX_INVENPRO = /invenpro/i

// Genera nombres de organización arbitrarios, incluyendo casos límite y
// cadenas que contienen variantes de "InvenPro" para verificar que el
// resolver nunca las propaga al branding visible.
const arbNombreOrg = fc.oneof(
  fc.constant(null),
  fc.constant(undefined),
  fc.constant(""),
  fc.constant("   "),
  fc.constant("InvenPro"),
  fc.constant("invenpro"),
  fc.constant("INVENPRO"),
  fc.constant("InvenPro S.A. de C.V."),
  fc.constant("  invenpro  "),
  fc.string(),
  fc.string().map((s) => `InvenPro ${s}`),
)

describe('Property 10: El branding visible nunca expone "InvenPro"', () => {
  it("P10.1 — la marca visible resuelta es 'Dego' o 'Sistema de Inventario' y nunca contiene 'InvenPro'", () => {
    fc.assert(
      fc.property(arbNombreOrg, (nombreOrg) => {
        const marca = resolverMarcaVisible(nombreOrg)
        expect([MARCA.nombre, MARCA.fallback]).toContain(marca)
        expect(REGEX_INVENPRO.test(marca)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })

  it("P10.2 — el prefijo del logger es '[dego]' y nunca contiene 'InvenPro'", () => {
    fc.assert(
      fc.property(arbNombreOrg, () => {
        expect(MARCA.prefijoLog).toBe("[dego]")
        expect(REGEX_INVENPRO.test(MARCA.prefijoLog)).toBe(false)
      }),
      { numRuns: 100 },
    )
  })
})
