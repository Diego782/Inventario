// Feature: usuarios-y-accesos, Property 7: Invariante de control de acceso
// **Validates: Requirements 11.4, 11.10, 12.1, 12.2, 12.4, 12.6, 12.7**
import { describe, it } from "vitest"
import * as fc from "fast-check"
import { tienePermiso, seccionesVisibles, type Permiso } from "@/lib/auth/permisos"
import { SECCIONES, ACCIONES, type Seccion, type Accion } from "@/lib/auth/secciones"

// ---- Generador: subconjunto arbitrario de permisos ----

const arbPermisos: fc.Arbitrary<Permiso[]> = fc
  .subarray(
    SECCIONES.flatMap((seccion) =>
      ACCIONES.map((accion) => ({ seccion, accion }))
    )
  )

describe("Property 7: Invariante de control de acceso", () => {
  it("P7.1 — tienePermiso(P, s, a) es true sii (s, a) ∈ P", () => {
    fc.assert(
      fc.property(arbPermisos, (permisos) => {
        for (const seccion of SECCIONES) {
          for (const accion of ACCIONES) {
            const enConjunto = permisos.some(
              (p) => p.seccion === seccion && p.accion === accion
            )
            const resultado = tienePermiso(permisos, seccion, accion)
            if (resultado !== enConjunto) return false
          }
        }
        return true
      }),
      { numRuns: 100 }
    )
  })

  it("P7.2 — seccionesVisibles(P) es exactamente { s : (s, 'ver') ∈ P }", () => {
    fc.assert(
      fc.property(arbPermisos, (permisos) => {
        const visibles = seccionesVisibles(permisos)
        const esperadas = SECCIONES.filter((s) =>
          permisos.some((p) => p.seccion === s && p.accion === "ver")
        )

        if (visibles.length !== esperadas.length) return false

        for (const s of esperadas) {
          if (!visibles.includes(s)) return false
        }
        for (const s of visibles) {
          if (!esperadas.includes(s)) return false
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})
