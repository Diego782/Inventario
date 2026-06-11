import { describe, it, expect } from "vitest"
import { SECCIONES, ACCIONES, LABEL_A_SECCION } from "@/lib/auth/secciones"

describe("lib/auth/secciones", () => {
  it("SECCIONES tiene exactamente 8 elementos", () => {
    expect(SECCIONES.length).toBe(8)
  })

  it("ACCIONES tiene exactamente 5 elementos", () => {
    expect(ACCIONES.length).toBe(5)
  })

  it("LABEL_A_SECCION mapea 8 labels a secciones válidas", () => {
    const entries = Object.entries(LABEL_A_SECCION)
    expect(entries.length).toBe(8)
    for (const [, seccion] of entries) {
      expect(SECCIONES).toContain(seccion)
    }
  })
})
