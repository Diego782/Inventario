// __tests__/unit/mensajes-error.test.ts
import { describe, it, expect } from "vitest"
import { MENSAJES_ERROR, toastDeError } from "@/lib/mensajes-error"

const CODIGOS_REQUERIDOS = [
  "VALIDACION",
  "SKU_DUPLICADO",
  "CODIGO_BARRAS_DUPLICADO",
  "CODIGO_BARRAS_INVALIDO",
  "STOCK_NEGATIVO",
  "USAR_AJUSTE_STOCK",
  "PRODUCTO_NO_ENCONTRADO",
  "VENTA_FALLIDA",
  "VENTA_TIMEOUT",
  "LIMITE_FOLIO_DIARIO",
  "BD_NO_DISPONIBLE",
  "CATEGORIA_DUPLICADA",
  "CONFLICTO",
  "RED",
]

describe("Catálogo de mensajes de error en español", () => {
  it("Todos los códigos requeridos tienen un mensaje no vacío", () => {
    for (const codigo of CODIGOS_REQUERIDOS) {
      const mensaje = MENSAJES_ERROR[codigo]
      expect(mensaje, `Falta mensaje para código: ${codigo}`).toBeDefined()
      expect(mensaje.length, `Mensaje vacío para código: ${codigo}`).toBeGreaterThan(0)
    }
  })

  it("toastDeError retorna el mensaje correcto para SKU_DUPLICADO", () => {
    expect(toastDeError("SKU_DUPLICADO")).toBe("Ya existe un producto con ese SKU.")
  })

  it("toastDeError retorna el fallback para códigos desconocidos", () => {
    expect(toastDeError("CODIGO_INEXISTENTE", "fallback")).toBe("fallback")
  })

  it("toastDeError retorna mensaje genérico cuando no hay fallback", () => {
    const resultado = toastDeError("CODIGO_INEXISTENTE")
    expect(resultado).toBeTruthy()
    expect(resultado.length).toBeGreaterThan(0)
  })
})
