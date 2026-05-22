// Feature: inventario-ventas-core, Property 1+2: Round-trip EAN-13 y Idempotencia DV
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { dvEan13, validarEan13, validarCode128, generarEan13, detectarFormato } from "@/lib/codigo-barras"

describe("Property 2: Idempotencia del dígito verificador EAN-13", () => {
  it("P2 — Para todo d de 12 dígitos, validarEan13(d + dvEan13(d)) === true", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9]{12}$/),
        (d12) => {
          const codigo = d12 + dvEan13(d12)
          return validarEan13(codigo) === true
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P2.2 — Recalcular el DV sobre los primeros 12 dígitos de un EAN-13 generado produce el mismo dígito", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[0-9]{12}$/),
        (d12) => {
          const codigo = d12 + dvEan13(d12)
          return dvEan13(codigo.slice(0, 12)) === codigo[12]
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe("Property 1 (parte pura): Round-trip de generarEan13", () => {
  it("P1 — El código generado por generarEan13 siempre valida con validarEan13", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999999999 }),
        (seed) => {
          let i = seed
          const rng = () => {
            i = (i * 1664525 + 1013904223) & 0xffffffff
            return (i >>> 0) / 0x100000000
          }
          const codigo = generarEan13("200", rng)
          return validarEan13(codigo) === true
        }
      ),
      { numRuns: 100 }
    )
  })
})

describe("validarCode128 — casos unitarios", () => {
  it("acepta cadenas ASCII imprimibles de 1–48 caracteres", () => {
    expect(validarCode128("ABC123")).toBe(true)
    expect(validarCode128("A")).toBe(true)
    expect(validarCode128("A".repeat(48))).toBe(true)
  })

  it("rechaza cadenas vacías, demasiado largas o con caracteres fuera de charset", () => {
    expect(validarCode128("")).toBe(false)
    expect(validarCode128("A".repeat(49))).toBe(false)
    expect(validarCode128("\x00ABC")).toBe(false)
    expect(validarCode128("\x7FABC")).toBe(false)
  })

  it("detectarFormato distingue EAN13 de CODE128", () => {
    const ean = generarEan13("200")
    expect(detectarFormato(ean)).toBe("EAN13")
    expect(detectarFormato("ABC-123")).toBe("CODE128")
    expect(detectarFormato("")).toBe(null)
    expect(detectarFormato("\x00")).toBe(null)
  })
})

describe("Property 1 (round-trip completo): generarEan13 → detectarFormato → EAN13", () => {
  it("P1.2 — Todo código generado por generarEan13 es detectado como EAN13 por detectarFormato", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999999999 }),
        (seed) => {
          let i = seed
          const rng = () => {
            i = (i * 1664525 + 1013904223) & 0xffffffff
            return (i >>> 0) / 0x100000000
          }
          const codigo = generarEan13("200", rng)
          return detectarFormato(codigo) === "EAN13"
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P1.3 — El código generado tiene exactamente 13 dígitos", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999999999 }),
        (seed) => {
          let i = seed
          const rng = () => {
            i = (i * 1664525 + 1013904223) & 0xffffffff
            return (i >>> 0) / 0x100000000
          }
          const codigo = generarEan13("200", rng)
          return codigo.length === 13 && /^\d{13}$/.test(codigo)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P1.4 — El código generado siempre empieza con el prefijo '200'", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 999999999 }),
        (seed) => {
          let i = seed
          const rng = () => {
            i = (i * 1664525 + 1013904223) & 0xffffffff
            return (i >>> 0) / 0x100000000
          }
          const codigo = generarEan13("200", rng)
          return codigo.startsWith("200")
        }
      ),
      { numRuns: 100 }
    )
  })
})
