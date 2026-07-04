// Feature: gestion-clientes-y-fiadores, Property 8: Validación de campos de Cliente
/**
 * Property 8: Validación de campos de Cliente
 * **Validates: Requirements 4.2, 4.10, 4.11, 4.13**
 *
 * Para toda combinación de cédula, nombre, teléfono y correo:
 *   - La creación/edición se acepta si y solo si:
 *       · cédula: 5–20 caracteres alfanuméricos (^[a-zA-Z0-9]{5,20}$)
 *       · nombre: no vacío y ≤ 100 caracteres
 *       · teléfono: 7–15 dígitos (^\d{7,15}$)
 *       · correo (opcional): si se proporciona, formato usuario@dominio.tld y ≤ 254 caracteres
 *   - En cualquier otro caso se produce un error de validación.
 */

import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { crearClienteSchema, editarClienteSchema } from "@/lib/schemas/cliente"

// ── Generadores de campos VÁLIDOS ─────────────────────────────────────────

/** Cédula válida: 5–20 caracteres alfanuméricos exactos. */
const arbCedulaValida = fc.stringMatching(/^[a-zA-Z0-9]{5,20}$/)

/** Nombre válido: no vacío y longitud ≤ 100. */
const arbNombreValido = fc
  .string({ minLength: 1, maxLength: 100 })
  // Asegurar que el trim no deje cadena vacía
  .filter((s) => s.trim().length > 0)

/** Teléfono válido: 7–15 dígitos. */
const arbTelefonoValido = fc.stringMatching(/^\d{7,15}$/)

/**
 * Correo válido: usuario@dominio.tld con longitud ≤ 254.
 * Generamos correos de forma controlada para garantizar formato válido.
 */
const arbCorreoValido: fc.Arbitrary<string> = fc
  .tuple(
    fc.stringMatching(/^[a-z][a-z0-9]{0,19}$/),   // usuario: 1–20 chars alfanum
    fc.stringMatching(/^[a-z][a-z0-9]{1,20}$/),   // dominio: 2–21 chars alfanum
    fc.constantFrom("com", "org", "net", "io", "co") // tld
  )
  .map(([user, domain, tld]) => `${user}@${domain}.${tld}`)
  .filter((email) => email.length <= 254)

// ── Generadores de campos INVÁLIDOS ──────────────────────────────────────

/** Cédula inválida: demasiado corta (< 5 chars), demasiado larga (> 20) o con caracteres no alfanuméricos. */
const arbCedulaInvalida = fc.oneof(
  // Demasiado corta (0–4 caracteres alfanuméricos)
  fc.stringMatching(/^[a-zA-Z0-9]{0,4}$/),
  // Demasiado larga (21–40 caracteres alfanuméricos)
  fc.stringMatching(/^[a-zA-Z0-9]{21,40}$/),
  // Contiene caracteres no alfanuméricos (espacios, guiones, símbolos)
  fc.tuple(
    fc.stringMatching(/^[a-zA-Z0-9]{2,8}$/),
    fc.constantFrom("-", "_", " ", "@", ".", "!", "#"),
    fc.stringMatching(/^[a-zA-Z0-9]{2,8}$/)
  ).map(([a, sep, b]) => `${a}${sep}${b}`),
)

/** Nombre inválido: vacío o mayor a 100 caracteres. */
const arbNombreInvalido = fc.oneof(
  // Vacío (cadena vacía o solo espacios)
  fc.constant(""),
  fc.constant("   "),
  // Demasiado largo (101–200 caracteres)
  fc.string({ minLength: 101, maxLength: 200 }),
)

/** Teléfono inválido: demasiado corto (< 7), demasiado largo (> 15) o contiene no-dígitos. */
const arbTelefonoInvalido = fc.oneof(
  // Demasiado corto (0–6 dígitos)
  fc.stringMatching(/^\d{0,6}$/),
  // Demasiado largo (16–30 dígitos)
  fc.stringMatching(/^\d{16,30}$/),
  // Contiene letras u otros caracteres
  fc.tuple(
    fc.stringMatching(/^\d{3,7}$/),
    fc.constantFrom("a", "b", "X", "-", "+", " "),
    fc.stringMatching(/^\d{3,7}$/)
  ).map(([a, sep, b]) => `${a}${sep}${b}`),
)

/**
 * Correo inválido: sin @, doble @, espacio en usuario o demasiado largo (>254 chars).
 *
 * We focus on clearly invalid formats to avoid ambiguity with lenient validators.
 */
const arbCorreoInvalido = fc.oneof(
  // Sin símbolo @ (solo letras/dígitos)
  fc.stringMatching(/^[a-z]{3,30}$/),
  // Doble @ (claramente inválido)
  fc.tuple(
    fc.stringMatching(/^[a-z]{2,8}$/),
    fc.stringMatching(/^[a-z]{2,8}$/),
    fc.constantFrom("com", "org", "net")
  ).map(([u, d, tld]) => `${u}@@${d}.${tld}`),
  // Espacio sin quoting en el usuario (inválido en formato estándar)
  fc.tuple(
    fc.stringMatching(/^[a-z]{2,8}$/),
    fc.stringMatching(/^[a-z]{2,8}$/),
    fc.constantFrom("com", "org")
  ).map(([u, d, tld]) => `${u} extra@${d}.${tld}`),
  // Demasiado largo (> 254 chars): construido de forma determinista
  // local(100) + "@" + domain(100) + ".com" = 208 chars → no, use 125+125
  fc.tuple(
    fc.stringMatching(/^[a-z]{10,20}$/),
    fc.integer({ min: 1, max: 10 })
  ).map(([segment, n]) => {
    // Repeat to build a local part of ≥120 chars
    const local = segment.repeat(Math.ceil(120 / segment.length)).slice(0, 120)
    const domain = segment.repeat(Math.ceil(120 / segment.length)).slice(0, 120)
    return `${local}@${domain}.com`  // 120 + 1 + 120 + 4 = 245... need more
  }).map((email) => {
    // Pad to guarantee > 254
    if (email.length <= 254) {
      const extra = "a".repeat(255 - email.length)
      // Insert extra into local part before @
      const atIdx = email.indexOf("@")
      return email.slice(0, atIdx) + extra + email.slice(atIdx)
    }
    return email
  }),
)

// ── Generador de entrada completamente válida ─────────────────────────────

/** Entrada válida: todos los campos obligatorios correcto, correo opcional. */
const arbEntradaValida = fc.record({
  cedula: arbCedulaValida,
  nombre: arbNombreValido,
  telefono: arbTelefonoValido,
  correo: fc.option(arbCorreoValido, { nil: null }),
})

// ── Tests de Property 8 ───────────────────────────────────────────────────

describe("Property 8: Validación de campos de Cliente", () => {
  it(
    "P8.1 — Entrada completamente válida siempre se acepta (Req 4.2, 4.11, 4.13)",
    () => {
      fc.assert(
        fc.property(arbEntradaValida, ({ cedula, nombre, telefono, correo }) => {
          const result = crearClienteSchema.safeParse({
            cedula,
            nombre,
            telefono,
            correo: correo ?? undefined,
          })

          expect(result.success).toBe(true)
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.2 — Cédula inválida siempre produce error de validación (Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          arbCedulaInvalida,
          arbNombreValido,
          arbTelefonoValido,
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.3 — Nombre inválido siempre produce error de validación (Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          arbCedulaValida,
          arbNombreInvalido,
          arbTelefonoValido,
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.4 — Teléfono inválido siempre produce error de validación (Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          arbCedulaValida,
          arbNombreValido,
          arbTelefonoInvalido,
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.5 — Correo con formato inválido siempre produce error de validación (Req 4.10, 4.13)",
    () => {
      fc.assert(
        fc.property(
          arbCedulaValida,
          arbNombreValido,
          arbTelefonoValido,
          arbCorreoInvalido,
          (cedula, nombre, telefono, correo) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono, correo })
            expect(result.success).toBe(false)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.6 — Correo ausente (undefined o null) se acepta: es campo opcional (Req 4.2)",
    () => {
      fc.assert(
        fc.property(arbCedulaValida, arbNombreValido, arbTelefonoValido, (cedula, nombre, telefono) => {
          const sinCorreo = crearClienteSchema.safeParse({ cedula, nombre, telefono })
          const correoNull = crearClienteSchema.safeParse({ cedula, nombre, telefono, correo: null })

          expect(sinCorreo.success).toBe(true)
          expect(correoNull.success).toBe(true)
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.7 — editarClienteSchema acepta cualquier subconjunto de campos válidos (Req 4.13)",
    () => {
      // Con edición parcial, cada campo presente debe ser válido individualmente.
      fc.assert(
        fc.property(
          fc.record({
            cedula: fc.option(arbCedulaValida, { nil: undefined }),
            nombre: fc.option(arbNombreValido, { nil: undefined }),
            telefono: fc.option(arbTelefonoValido, { nil: undefined }),
            correo: fc.option(arbCorreoValido, { nil: undefined }),
          }),
          (input) => {
            // Remove undefined keys to simulate partial input
            const clean = Object.fromEntries(
              Object.entries(input).filter(([, v]) => v !== undefined)
            )
            const result = editarClienteSchema.safeParse(clean)
            expect(result.success).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.8 — editarClienteSchema rechaza campos individuales inválidos cuando están presentes (Req 4.13)",
    () => {
      // At least one invalid field should cause rejection.
      const arbCampoInvalidoPresente = fc.oneof(
        // Cédula inválida presente
        arbCedulaInvalida.map((cedula) => ({ cedula })),
        // Nombre inválido presente
        arbNombreInvalido.map((nombre) => ({ nombre })),
        // Teléfono inválido presente
        arbTelefonoInvalido.map((telefono) => ({ telefono })),
        // Correo inválido presente
        arbCorreoInvalido.map((correo) => ({ correo })),
      )

      fc.assert(
        fc.property(arbCampoInvalidoPresente, (campoInvalido) => {
          const result = editarClienteSchema.safeParse(campoInvalido)
          expect(result.success).toBe(false)
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.9 — Cédula exactamente de 5 caracteres alfanuméricos se acepta (límite inferior, Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9]{5}$/),
          arbNombreValido,
          arbTelefonoValido,
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.10 — Cédula exactamente de 20 caracteres alfanuméricos se acepta (límite superior, Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          fc.stringMatching(/^[a-zA-Z0-9]{20}$/),
          arbNombreValido,
          arbTelefonoValido,
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.11 — Teléfono exactamente de 7 dígitos se acepta (límite inferior, Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          arbCedulaValida,
          arbNombreValido,
          fc.stringMatching(/^\d{7}$/),
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P8.12 — Teléfono exactamente de 15 dígitos se acepta (límite superior, Req 4.11)",
    () => {
      fc.assert(
        fc.property(
          arbCedulaValida,
          arbNombreValido,
          fc.stringMatching(/^\d{15}$/),
          (cedula, nombre, telefono) => {
            const result = crearClienteSchema.safeParse({ cedula, nombre, telefono })
            expect(result.success).toBe(true)
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
