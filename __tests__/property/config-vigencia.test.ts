// Feature: usuarios-y-accesos, Property 4: Saneamiento de la vigencia configurable
// **Validates: Requirements 3.2, 3.3**
import { describe, it } from "vitest"
import * as fc from "fast-check"
import { vigenciaTokenHoras } from "@/lib/auth/vigencia"

describe("Property 4: Saneamiento de la vigencia configurable por entorno", () => {
  it("P4.1 — Para cualquier entero en [1, 168], vigenciaTokenHoras retorna ese entero", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 168 }), (n) => {
        const resultado = vigenciaTokenHoras(String(n))
        return resultado === n
      }),
      { numRuns: 100 }
    )
  })

  it("P4.2 — Para cualquier entero fuera de [1, 168], vigenciaTokenHoras retorna 24", () => {
    const fueraDeRango = fc.oneof(
      fc.integer({ max: 0 }),
      fc.integer({ min: 169 })
    )
    fc.assert(
      fc.property(fueraDeRango, (n) => {
        const resultado = vigenciaTokenHoras(String(n))
        return resultado === 24
      }),
      { numRuns: 100 }
    )
  })

  it("P4.3 — Para undefined, vacío o strings no numéricos, vigenciaTokenHoras retorna 24", () => {
    const invalidos = fc.oneof(
      fc.constantFrom(undefined, "", "abc"),
      fc.string().filter((s) => isNaN(parseInt(s, 10)))
    )
    fc.assert(
      fc.property(invalidos, (input) => {
        const resultado = vigenciaTokenHoras(input)
        return resultado === 24
      }),
      { numRuns: 100 }
    )
  })

  it("P4.4 — El resultado siempre es un entero en [1, 168]", () => {
    const cualquierInput = fc.oneof(
      fc.integer().map(String),
      fc.string(),
      fc.constantFrom(undefined, "", "abc", "0", "169", "999", "-1")
    )
    fc.assert(
      fc.property(cualquierInput, (input) => {
        const resultado = vigenciaTokenHoras(input)
        return (
          Number.isInteger(resultado) &&
          resultado >= 1 &&
          resultado <= 168
        )
      }),
      { numRuns: 100 }
    )
  })
})
