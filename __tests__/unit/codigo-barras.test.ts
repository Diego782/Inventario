// __tests__/unit/codigo-barras.test.ts
import { describe, it, expect } from "vitest"
import { generarEan13, validarEan13, dvEan13 } from "@/lib/codigo-barras"

describe("generarEan13 con RNG determinista", () => {
  it("genera un código EAN-13 válido con prefijo '200' y RNG fijo", () => {
    // RNG determinista: siempre retorna 0.5
    const rng = () => 0.5
    const codigo = generarEan13("200", rng)
    expect(codigo).toHaveLength(13)
    expect(validarEan13(codigo)).toBe(true)
    expect(codigo.startsWith("200")).toBe(true)
  })

  it("genera el mismo código con el mismo RNG determinista", () => {
    let i = 42
    const rng = () => {
      i = (i * 1664525 + 1013904223) & 0xffffffff
      return (i >>> 0) / 0x100000000
    }
    const c1 = generarEan13("200", rng)

    i = 42 // reset
    const rng2 = () => {
      i = (i * 1664525 + 1013904223) & 0xffffffff
      return (i >>> 0) / 0x100000000
    }
    const c2 = generarEan13("200", rng2)

    expect(c1).toBe(c2)
    expect(validarEan13(c1)).toBe(true)
  })

  it("lanza error con prefijo inválido", () => {
    expect(() => generarEan13("ABC")).toThrow()
    expect(() => generarEan13("1234567890123")).toThrow() // 13 dígitos, demasiado largo
  })

  it("dvEan13 calcula el dígito verificador correctamente para casos conocidos", () => {
    // EAN-13 conocido: 5901234123457
    expect(dvEan13("590123412345")).toBe("7")
    // EAN-13 conocido: 4006381333931
    expect(dvEan13("400638133393")).toBe("1")
  })
})
