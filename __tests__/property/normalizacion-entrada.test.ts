// Feature: usuarios-y-accesos, Property 15: Condiciones de error de entrada y normalización
// **Validates: Requirements 2.9, 3.2, 4.1, 6.1**
import { describe, it } from "vitest"
import * as fc from "fast-check"
import { registroSchema, loginSchema } from "@/lib/schemas/auth"
import { vigenciaTokenHoras } from "@/lib/auth/vigencia"

// ---------------------------------------------------------------------------
// Generadores auxiliares
// ---------------------------------------------------------------------------

/**
 * Genera un correo electrónico con al menos un carácter en mayúsculas.
 * Construye la forma "LOCAL@DOMAIN.TLD" con partes en mayúsculas para
 * garantizar que la normalización a minúsculas sea observable.
 */
const arbCorreoConMayusculas = fc
  .tuple(
    fc.stringMatching(/^[a-z]{2,8}$/),   // parte local en minúsculas
    fc.stringMatching(/^[a-z]{2,8}$/),   // dominio en minúsculas
    fc.stringMatching(/^[a-z]{2,4}$/)    // TLD en minúsculas
  )
  .map(([local, domain, tld]) => {
    // Forzamos al menos una mayúscula en la parte local
    const localUpper = local.charAt(0).toUpperCase() + local.slice(1)
    return `${localUpper}@${domain}.${tld}`
  })

/**
 * Genera un nombre válido (1–160 caracteres).
 */
const arbNombreValido = fc.string({ minLength: 1, maxLength: 160 })

/**
 * Genera una contraseña válida (8–128 caracteres).
 */
const arbContrasenaValida = fc.string({ minLength: 8, maxLength: 128 })

/**
 * Genera un valor de vigencia fuera del rango [1, 168].
 * Solo incluye valores que parseInt no resuelva a un entero en [1, 168]:
 *   - enteros fuera de rango (≤0 o ≥169)
 *   - strings no numéricos (parseInt devuelve NaN)
 *   - string vacío o undefined
 */
const arbVigenciaFueraDeRango = fc.oneof(
  fc.integer({ max: 0 }).map(String),
  fc.integer({ min: 169 }).map(String),
  fc.constantFrom("", "abc", "null", "undefined", "NaN"),
  fc.constantFrom(undefined)
)

// ---------------------------------------------------------------------------
// Property 15: Condiciones de error de entrada y normalización
// ---------------------------------------------------------------------------

describe("Property 15: Condiciones de error de entrada y normalización", () => {
  // -------------------------------------------------------------------------
  // P15.1 — registroSchema normaliza el correo a minúsculas
  // -------------------------------------------------------------------------
  it("P15.1 — registroSchema normaliza cualquier correo con mayúsculas a minúsculas", () => {
    fc.assert(
      fc.property(
        arbCorreoConMayusculas,
        arbNombreValido,
        arbContrasenaValida,
        (correo, nombre, contrasena) => {
          const result = registroSchema.safeParse({ correo, nombre, contrasena })
          if (!result.success) return true // si el correo generado no es válido, se omite
          return result.data.correo === result.data.correo.toLowerCase()
        }
      ),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.2 — loginSchema normaliza el correo a minúsculas
  // -------------------------------------------------------------------------
  it("P15.2 — loginSchema normaliza cualquier correo con mayúsculas a minúsculas", () => {
    fc.assert(
      fc.property(
        arbCorreoConMayusculas,
        arbContrasenaValida,
        (correo, contrasena) => {
          const result = loginSchema.safeParse({ correo, contrasena })
          if (!result.success) return true // si el correo generado no es válido, se omite
          return result.data.correo === result.data.correo.toLowerCase()
        }
      ),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.3 — registroSchema normaliza correos de fc.emailAddress con mayúsculas
  // -------------------------------------------------------------------------
  it("P15.3 — registroSchema: el correo resultante siempre es igual a su versión en minúsculas", () => {
    fc.assert(
      fc.property(
        fc.emailAddress(),
        arbNombreValido,
        arbContrasenaValida,
        (correo, nombre, contrasena) => {
          // Forzamos mayúsculas en la parte local del correo
          const correoConMayusculas = correo.toUpperCase()
          const result = registroSchema.safeParse({
            correo: correoConMayusculas,
            nombre,
            contrasena,
          })
          if (!result.success) return true
          return result.data.correo === result.data.correo.toLowerCase()
        }
      ),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.4 — vigenciaTokenHoras devuelve 24 para cualquier valor fuera de [1, 168]
  // -------------------------------------------------------------------------
  it("P15.4 — vigenciaTokenHoras devuelve 24 para cualquier valor fuera del rango [1, 168]", () => {
    fc.assert(
      fc.property(arbVigenciaFueraDeRango, (valor) => {
        const resultado = vigenciaTokenHoras(valor)
        return resultado === 24
      }),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.5 — registroSchema rechaza payloads con campos faltantes
  // -------------------------------------------------------------------------
  it("P15.5 — registroSchema rechaza payloads con campos obligatorios faltantes", () => {
    fc.assert(
      fc.property(
        fc.record(
          {
            correo: fc.option(fc.emailAddress(), { nil: undefined }),
            nombre: fc.option(arbNombreValido, { nil: undefined }),
            contrasena: fc.option(arbContrasenaValida, { nil: undefined }),
          },
          { requiredKeys: [] }
        ).filter(
          (payload) =>
            payload.correo === undefined ||
            payload.nombre === undefined ||
            payload.contrasena === undefined
        ),
        (payload) => {
          const result = registroSchema.safeParse(payload)
          return result.success === false
        }
      ),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.6 — registroSchema rechaza payloads con tipos incorrectos
  // -------------------------------------------------------------------------
  it("P15.6 — registroSchema rechaza payloads con tipos incorrectos en los campos", () => {
    // Genera payloads donde al menos un campo tiene un tipo incorrecto
    const arbPayloadTipoIncorrecto = fc.oneof(
      // correo como número
      fc.record({
        correo: fc.integer(),
        nombre: arbNombreValido,
        contrasena: arbContrasenaValida,
      }),
      // nombre como booleano
      fc.record({
        correo: fc.emailAddress(),
        nombre: fc.boolean(),
        contrasena: arbContrasenaValida,
      }),
      // contrasena como array
      fc.record({
        correo: fc.emailAddress(),
        nombre: arbNombreValido,
        contrasena: fc.array(fc.string()),
      }),
      // correo como null
      fc.record({
        correo: fc.constant(null),
        nombre: arbNombreValido,
        contrasena: arbContrasenaValida,
      })
    )

    fc.assert(
      fc.property(arbPayloadTipoIncorrecto, (payload) => {
        const result = registroSchema.safeParse(payload)
        return result.success === false
      }),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.7 — registroSchema rechaza contraseñas fuera del rango de longitud
  // -------------------------------------------------------------------------
  it("P15.7 — registroSchema rechaza contraseñas con longitud fuera de [8, 128]", () => {
    const arbContrasenaInvalida = fc.oneof(
      fc.string({ minLength: 0, maxLength: 7 }),   // demasiado corta
      fc.string({ minLength: 129, maxLength: 200 }) // demasiado larga
    )

    fc.assert(
      fc.property(
        fc.emailAddress(),
        arbNombreValido,
        arbContrasenaInvalida,
        (correo, nombre, contrasena) => {
          const result = registroSchema.safeParse({ correo, nombre, contrasena })
          return result.success === false
        }
      ),
      { numRuns: 100 }
    )
  })

  // -------------------------------------------------------------------------
  // P15.8 — registroSchema rechaza correos con formato inválido
  // -------------------------------------------------------------------------
  it("P15.8 — registroSchema rechaza correos con formato inválido", () => {
    const arbCorreoInvalido = fc.oneof(
      fc.string({ minLength: 1, maxLength: 50 }).filter(
        (s) => !s.includes("@") || s.startsWith("@") || s.endsWith("@")
      ),
      fc.constantFrom("noesuncorreo", "@sinlocal.com", "sindominio@", "@@doble.com", "  ")
    )

    fc.assert(
      fc.property(
        arbCorreoInvalido,
        arbNombreValido,
        arbContrasenaValida,
        (correo, nombre, contrasena) => {
          const result = registroSchema.safeParse({ correo, nombre, contrasena })
          return result.success === false
        }
      ),
      { numRuns: 100 }
    )
  })
})
