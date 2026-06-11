import { describe, it, expect } from "vitest"
import { PERMISOS_PROPIETARIO, tienePermiso, seccionesVisibles, type Permiso } from "@/lib/auth/permisos"

describe("permisos", () => {
  it("PERMISOS_PROPIETARIO tiene 40 entradas (8 secciones × 5 acciones)", () => {
    expect(PERMISOS_PROPIETARIO.length).toBe(40)
  })

  it("tienePermiso devuelve false para lista vacía", () => {
    expect(tienePermiso([], "usuarios", "ver")).toBe(false)
  })

  it("tienePermiso devuelve true cuando el permiso existe", () => {
    const permisos: Permiso[] = [{ seccion: "inventario", accion: "editar" }]
    expect(tienePermiso(permisos, "inventario", "editar")).toBe(true)
  })

  it("tienePermiso devuelve false cuando la sección no coincide", () => {
    const permisos: Permiso[] = [{ seccion: "ventas", accion: "ver" }]
    expect(tienePermiso(permisos, "inventario", "ver")).toBe(false)
  })

  it("seccionesVisibles retorna solo secciones con acción 'ver'", () => {
    const permisos: Permiso[] = [
      { seccion: "dashboard", accion: "ver" },
      { seccion: "ventas", accion: "ver" },
      { seccion: "inventario", accion: "editar" },
    ]
    const visibles = seccionesVisibles(permisos)
    expect(visibles).toEqual(["dashboard", "ventas"])
  })

  it("seccionesVisibles retorna array vacío si no hay permisos 'ver'", () => {
    const permisos: Permiso[] = [{ seccion: "dashboard", accion: "editar" }]
    expect(seccionesVisibles(permisos)).toEqual([])
  })
})
