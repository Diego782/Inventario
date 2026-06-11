// Feature: usuarios-y-accesos, Property 13: Límite de tasa por ventana deslizante
import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

/**
 * Property 13: Límite de tasa por ventana deslizante
 * Validates: Requirements 3.10, 4.8, 16.3
 *
 * Para toda secuencia de intentos y (L,W), se permiten a lo sumo L por ventana W
 * y se rechaza el L+1; al envejecer los intentos fuera de W, vuelve a permitir.
 */

// Arbitrary: generates a limit L between 1 and 20
const arbLimite = fc.integer({ min: 1, max: 20 })

// Arbitrary: generates a window W between 1000ms and 100000ms
const arbVentana = fc.integer({ min: 1000, max: 100000 })

describe("Property 13: Límite de tasa por ventana deslizante", () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it("P13.1 — Se permiten exactamente L llamadas y se rechaza la L+1", async () => {
    await fc.assert(
      fc.asyncProperty(arbLimite, arbVentana, async (L, W) => {
        vi.resetModules()
        const { consumir } = await import("@/lib/auth/rate-limit")

        const clave = "test-key"
        const ahora = 1000000

        // L calls should all return true
        for (let i = 0; i < L; i++) {
          const resultado = consumir(clave, L, W, ahora)
          expect(resultado).toBe(true)
        }

        // The (L+1)th call should return false
        const rechazado = consumir(clave, L, W, ahora)
        expect(rechazado).toBe(false)
      }),
      { numRuns: 100 }
    )
  })

  it("P13.2 — Al envejecer los intentos fuera de W, vuelve a permitir", async () => {
    await fc.assert(
      fc.asyncProperty(arbLimite, arbVentana, async (L, W) => {
        vi.resetModules()
        const { consumir } = await import("@/lib/auth/rate-limit")

        const clave = "test-aging"
        const ahora = 1000000

        // Exhaust the limit
        for (let i = 0; i < L; i++) {
          consumir(clave, L, W, ahora)
        }

        // Confirm it's blocked
        expect(consumir(clave, L, W, ahora)).toBe(false)

        // Advance time past the window
        const despues = ahora + W

        // Should be allowed again
        const resultado = consumir(clave, L, W, despues)
        expect(resultado).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})
