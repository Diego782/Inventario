// Feature: usuarios-y-accesos, Property 10: Generación de slug válido y único
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { slugificar, slugUnico } from "@/lib/auth/slug"

/**
 * **Validates: Requirements 8.4**
 *
 * Property 10: Generación de slug válido y único
 * Para todo `nombre`, `slugificar` da `[a-z0-9-]` con `1<=|slug|<=80`;
 * ante colisiones, `slugUnico` anexa sufijo incremental sin exceder 80 y nunca repite.
 */
describe("Property 10: Generación de slug válido y único", () => {
  it("P10.1 — slugificar produce solo [a-z0-9-] con longitud entre 1 y 80 para cualquier string", () => {
    fc.assert(
      fc.property(fc.string(), (nombre) => {
        const slug = slugificar(nombre)
        expect(slug).toMatch(/^[a-z0-9-]+$/)
        expect(slug.length).toBeGreaterThanOrEqual(1)
        expect(slug.length).toBeLessThanOrEqual(80)
      }),
      { numRuns: 100 }
    )
  })

  it("P10.2 — slugificar produce solo [a-z0-9-] con longitud entre 1 y 80 para strings con caracteres especiales/unicode", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[\u0000-\uFFFF]{0,120}$/),
        (nombre) => {
          const slug = slugificar(nombre)
          expect(slug).toMatch(/^[a-z0-9-]+$/)
          expect(slug.length).toBeGreaterThanOrEqual(1)
          expect(slug.length).toBeLessThanOrEqual(80)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P10.3 — slugUnico genera slugs únicos y ≤80 chars ante colisiones simuladas", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1, maxLength: 100 }),
        fc.integer({ min: 0, max: 5 }),
        async (nombre, numColisiones) => {
          // In-memory stub that simulates collisions
          const existingSlugs = new Set<string>()
          const base = slugificar(nombre)

          // Pre-populate existing slugs to simulate collisions
          if (numColisiones > 0) {
            existingSlugs.add(base)
          }
          for (let i = 2; i <= numColisiones; i++) {
            const sufijo = `-${i}`
            const candidato = base.slice(0, 80 - sufijo.length) + sufijo
            existingSlugs.add(candidato)
          }

          const tx = {
            organizacion: {
              findFirst: async ({ where }: { where: { slug: string } }) => {
                return existingSlugs.has(where.slug) ? { id: "exists" } : null
              },
            },
          }

          const resultado = await slugUnico(tx, nombre)

          // Must be valid slug characters
          expect(resultado).toMatch(/^[a-z0-9-]+$/)
          // Must not exceed 80 chars
          expect(resultado.length).toBeLessThanOrEqual(80)
          expect(resultado.length).toBeGreaterThanOrEqual(1)
          // Must be unique (not in existing set)
          expect(existingSlugs.has(resultado)).toBe(false)
        }
      ),
      { numRuns: 100 }
    )
  })
})
