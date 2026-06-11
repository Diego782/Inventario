// Feature: identidad-marca-dego, Property 11: Límites y formato del esquema de login
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { loginSchema } from "@/lib/schemas/auth"

/**
 * Property 11: Límites y formato del esquema de login.
 * Validates: Requirements 3.5, 3.6
 *
 * `loginSchema.safeParse` tiene éxito si y solo si:
 *  - el correo tiene formato válido y su longitud (tras trim/lowercase) es ≤ 254, y
 *  - la contraseña no está vacía y tiene longitud ≤ 128.
 *
 * `loginSchema` define:
 *   correo:     z.string().trim().toLowerCase().email().max(254)
 *   contrasena: z.string().min(1).max(128)
 *
 * Para evitar reimplementar la regex de email de Zod (lo que haría circular el
 * "si y solo si"), los generadores de correo emiten el valor junto a una bandera
 * `formatoValido` conocida por construcción. El oráculo combina esa bandera con
 * los límites de longitud calculados numéricamente sobre el valor ya normalizado
 * (trim + toLowerCase), idéntico a lo que valida el esquema.
 */

// Alfabeto ASCII controlado: la longitud de la cadena resultante es determinista
// (sin pares suplentes), lo que permite comparar `.length` con los límites de Zod.
const ALFABETO = "abcdefghijABCDEFGHIJ0123456789!@#$%^&*() ".split("")

function cadenaDeLongitud(min: number, max: number): fc.Arbitrary<string> {
  return fc
    .array(fc.constantFrom(...ALFABETO), { minLength: min, maxLength: max })
    .map((cs) => cs.join(""))
}

type CorreoCaso = { correo: string; formatoValido: boolean }

// --- Correos con formato VÁLIDO (Zod los acepta tras normalizar) ---

// Correo simple válido cuya longitud normalizada es pequeña (< 254).
const arbCorreoValidoCorto: fc.Arbitrary<CorreoCaso> = fc
  .tuple(
    fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
        minLength: 1,
        maxLength: 20,
      })
      .map((cs) => cs.join("")),
    fc
      .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789".split("")), {
        minLength: 1,
        maxLength: 15,
      })
      .map((cs) => cs.join("")),
    fc.constantFrom("co", "com", "net", "org", "mx", "io")
  )
  .map(([local, dominio, tld]) => ({
    correo: `${local}@${dominio}.${tld}`,
    formatoValido: true,
  }))

// Correo válido con MAYÚSCULAS y espacios alrededor: trim + toLowerCase lo normalizan
// a un correo válido. Ejercita R2.9 (normalización) sin alterar la validez.
const arbCorreoValidoNormalizable: fc.Arbitrary<CorreoCaso> = arbCorreoValidoCorto.map(
  ({ correo }) => ({
    correo: `   ${correo.toUpperCase()}   `,
    formatoValido: true,
  })
)

// Correo válido de longitud variable (incluida la frontera de 254): la parte local
// se rellena para que la longitud normalizada caiga alrededor del límite.
const arbCorreoValidoLargo: fc.Arbitrary<CorreoCaso> = fc
  .integer({ min: 1, max: 300 })
  .map((longLocal) => ({
    // dominio fijo "@b.co" (5 chars) → longitud normalizada = longLocal + 5
    correo: `${"a".repeat(longLocal)}@b.co`,
    formatoValido: true,
  }))

// --- Correos con formato INVÁLIDO (Zod los rechaza incluso tras normalizar) ---
// Se excluyen casos que solo difieren por espacios al inicio/fin, porque trim()
// los volvería válidos.
const arbCorreoInvalido: fc.Arbitrary<CorreoCaso> = fc
  .constantFrom(
    "",
    "   ",
    "plainaddress",
    "sin-arroba.com",
    "@sin-local.com",
    "sin-tld@dominio",
    "a@b",
    "dos@@arrobas.com",
    "espacio interno@dominio.com",
    "correo@ dominio.com",
    "correo@dominio .com",
    "@",
    "@.com",
    "usuario@.com"
  )
  .map((correo) => ({ correo, formatoValido: false }))

const arbCorreoCaso: fc.Arbitrary<CorreoCaso> = fc.oneof(
  arbCorreoValidoCorto,
  arbCorreoValidoNormalizable,
  arbCorreoValidoLargo,
  arbCorreoInvalido
)

// Contraseñas de longitudes variadas: vacía, válida (1..128) y excedida (129..200).
const arbContrasena: fc.Arbitrary<string> = fc.oneof(
  fc.constant(""),
  cadenaDeLongitud(1, 128),
  cadenaDeLongitud(129, 200)
)

/** Oráculo independiente del esquema, alineado con trim().toLowerCase().email().max(254). */
function exitoEsperado(caso: CorreoCaso, contrasena: string): boolean {
  const correoNormalizado = caso.correo.trim().toLowerCase()
  const correoOk = caso.formatoValido && correoNormalizado.length <= 254
  const contrasenaOk = contrasena.length >= 1 && contrasena.length <= 128
  return correoOk && contrasenaOk
}

describe("Property 11: Límites y formato del esquema de login", () => {
  it("P11 — safeParse tiene éxito si y solo si correo válido (≤254) y contraseña no vacía (≤128)", () => {
    fc.assert(
      fc.property(arbCorreoCaso, arbContrasena, (caso, contrasena) => {
        const resultado = loginSchema.safeParse({
          correo: caso.correo,
          contrasena,
        })
        return resultado.success === exitoEsperado(caso, contrasena)
      }),
      { numRuns: 100 }
    )
  })

  it("P11.1 — correo válido + contraseña 1..128 ⇒ éxito", () => {
    fc.assert(
      fc.property(arbCorreoValidoCorto, cadenaDeLongitud(1, 128), (caso, contrasena) => {
        return loginSchema.safeParse({ correo: caso.correo, contrasena }).success === true
      }),
      { numRuns: 100 }
    )
  })

  it("P11.2 — correo malformado ⇒ fallo, sin importar la contraseña", () => {
    fc.assert(
      fc.property(arbCorreoInvalido, arbContrasena, (caso, contrasena) => {
        return loginSchema.safeParse({ correo: caso.correo, contrasena }).success === false
      }),
      { numRuns: 100 }
    )
  })

  it("P11.3 — contraseña vacía ⇒ fallo aunque el correo sea válido", () => {
    fc.assert(
      fc.property(arbCorreoValidoCorto, (caso) => {
        return (
          loginSchema.safeParse({ correo: caso.correo, contrasena: "" }).success === false
        )
      }),
      { numRuns: 100 }
    )
  })

  it("P11.4 — contraseña con longitud > 128 ⇒ fallo aunque el correo sea válido", () => {
    fc.assert(
      fc.property(arbCorreoValidoCorto, cadenaDeLongitud(129, 200), (caso, contrasena) => {
        return (
          loginSchema.safeParse({ correo: caso.correo, contrasena }).success === false
        )
      }),
      { numRuns: 100 }
    )
  })

  it("P11.5 — frontera de longitud del correo: válido ⇔ longitud normalizada ≤ 254", () => {
    fc.assert(
      fc.property(arbCorreoValidoLargo, cadenaDeLongitud(1, 128), (caso, contrasena) => {
        const longNormalizada = caso.correo.trim().toLowerCase().length
        const esperado = longNormalizada <= 254
        return (
          loginSchema.safeParse({ correo: caso.correo, contrasena }).success === esperado
        )
      }),
      { numRuns: 100 }
    )
  })
})
