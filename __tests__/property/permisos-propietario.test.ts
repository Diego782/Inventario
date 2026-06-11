// Feature: usuarios-y-accesos, Property 8: Catálogo completo de permisos del Rol_Propietario
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { PERMISOS_PROPIETARIO } from "@/lib/auth/permisos"
import { SECCIONES, ACCIONES } from "@/lib/auth/secciones"

/**
 * Property 8: Catálogo completo de permisos del Rol_Propietario
 * Validates: Requirements 11.2
 *
 * PERMISOS_PROPIETARIO es exactamente el producto cartesiano
 * |SECCIONES| × |ACCIONES| sin omisiones ni duplicados.
 */
describe("Property 8: Catálogo completo de permisos del Rol_Propietario", () => {
  it("tiene exactamente |SECCIONES| × |ACCIONES| entradas", () => {
    expect(PERMISOS_PROPIETARIO.length).toBe(SECCIONES.length * ACCIONES.length)
  })

  it("para cualquier combinación (seccion, accion), el par existe en PERMISOS_PROPIETARIO", () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...SECCIONES),
        fc.constantFrom(...ACCIONES),
        (seccion, accion) => {
          const existe = PERMISOS_PROPIETARIO.some(
            (p) => p.seccion === seccion && p.accion === accion
          )
          expect(existe).toBe(true)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("no contiene duplicados", () => {
    const serialized = PERMISOS_PROPIETARIO.map(
      (p) => `${p.seccion}:${p.accion}`
    )
    const unique = new Set(serialized)
    expect(unique.size).toBe(PERMISOS_PROPIETARIO.length)
  })
})
