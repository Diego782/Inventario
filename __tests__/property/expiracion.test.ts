// Feature: usuarios-y-accesos, Property 3: Invariante de expiración de tokens y sesiones
import fc from "fast-check"
import { esVigente } from "@/lib/auth/tokens"

/**
 * Property 3: Invariante de expiración de tokens y sesiones
 * Validates: Requirements 16.2
 *
 * Para toda `expira_en` y `ahora`, `esVigente` es true sii `ahora <= expira_en`;
 * para `ahora > expira_en` siempre false.
 */
describe("Property 3: Invariante de expiración de tokens y sesiones", () => {
  it("esVigente(expira_en, ahora) === (ahora <= expira_en) para fechas arbitrarias", () => {
    fc.assert(
      fc.property(fc.date(), fc.date(), (expira_en, ahora) => {
        const resultado = esVigente(expira_en, ahora)
        const esperado = ahora <= expira_en
        return resultado === esperado
      }),
      { numRuns: 100 }
    )
  })
})
