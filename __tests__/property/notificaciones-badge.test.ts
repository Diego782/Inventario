// Feature: dashboard-metricas-notificaciones, Property 9: Formato del badge y aria-label del conteo
// Validates: Requirements 9.2, 9.3, 13.1
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { formatearBadge, ariaLabelCampana } from "@/lib/notificaciones/badge"

// Conteo de notificaciones no leídas (entero no negativo)
const arbConteo = fc.integer({ min: 0, max: 100000 })

describe("Property 9: Formato del badge y aria-label del conteo", () => {
  it("P9.1 — formatearBadge devuelve cadena vacía cuando n === 0", () => {
    fc.assert(
      fc.property(arbConteo, (n) => {
        if (n !== 0) return true
        return formatearBadge(n) === ""
      }),
      { numRuns: 100 }
    )
  })

  it("P9.2 — formatearBadge devuelve la representación decimal cuando 1 ≤ n ≤ 99", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 99 }), (n) => {
        return formatearBadge(n) === String(n)
      }),
      { numRuns: 100 }
    )
  })

  it('P9.3 — formatearBadge devuelve "99+" cuando n > 99', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 100000 }), (n) => {
        return formatearBadge(n) === "99+"
      }),
      { numRuns: 100 }
    )
  })

  it("P9.4 — ariaLabelCampana incluye el número exacto cuando 0 ≤ n ≤ 99", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 99 }), (n) => {
        const label = ariaLabelCampana(n)
        // El número exacto debe aparecer como token aislado en el aria-label
        return new RegExp(`(^|\\D)${n}(\\D|$)`).test(label)
      }),
      { numRuns: 100 }
    )
  })

  it('P9.5 — ariaLabelCampana incluye "99+" cuando n > 99', () => {
    fc.assert(
      fc.property(fc.integer({ min: 100, max: 100000 }), (n) => {
        return ariaLabelCampana(n).includes("99+")
      }),
      { numRuns: 100 }
    )
  })

  it("P9.6 — ariaLabelCampana siempre devuelve una cadena no vacía", () => {
    fc.assert(
      fc.property(arbConteo, (n) => {
        const label = ariaLabelCampana(n)
        return typeof label === "string" && label.length > 0
      }),
      { numRuns: 100 }
    )
  })

  it("P9.7 — ejemplos en los límites exactos", () => {
    expect(formatearBadge(0)).toBe("")
    expect(formatearBadge(1)).toBe("1")
    expect(formatearBadge(99)).toBe("99")
    expect(formatearBadge(100)).toBe("99+")
  })
})
