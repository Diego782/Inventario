import { describe, it, expect, vi } from "vitest"
import { slugificar, slugUnico } from "@/lib/auth/slug"

describe("slugificar", () => {
  it("produce solo [a-z0-9-] y |slug|<=80 para 'Café del Ñandú!'", () => {
    const result = slugificar("Café del Ñandú!")
    expect(result).toMatch(/^[a-z0-9-]+$/)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result).toBe("cafe-del-nandu")
  })

  it("devuelve 'org' para cadena vacía", () => {
    expect(slugificar("")).toBe("org")
  })

  it("devuelve 'org' para cadena de solo símbolos", () => {
    expect(slugificar("!!!@@@###")).toBe("org")
  })

  it("recorta a 80 caracteres", () => {
    const largo = "a".repeat(100)
    const result = slugificar(largo)
    expect(result.length).toBeLessThanOrEqual(80)
  })

  it("elimina guiones al inicio y al final", () => {
    expect(slugificar("--hola--")).toBe("hola")
  })
})

describe("slugUnico", () => {
  it("devuelve el slug base si no existe", async () => {
    const tx = {
      organizacion: { findFirst: vi.fn().mockResolvedValue(null) },
    }
    const result = await slugUnico(tx, "Mi Tienda")
    expect(result).toBe("mi-tienda")
  })

  it("agrega sufijo -2 si el base ya existe", async () => {
    const tx = {
      organizacion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "1" })
          .mockResolvedValueOnce(null),
      },
    }
    const result = await slugUnico(tx, "Mi Tienda")
    expect(result).toBe("mi-tienda-2")
  })

  it("agrega sufijo -3 si base y -2 ya existen", async () => {
    const tx = {
      organizacion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "1" })
          .mockResolvedValueOnce({ id: "2" })
          .mockResolvedValueOnce(null),
      },
    }
    const result = await slugUnico(tx, "Mi Tienda")
    expect(result).toBe("mi-tienda-3")
  })

  it("respeta 80 chars con sufijo", async () => {
    const nombre = "a".repeat(80)
    const tx = {
      organizacion: {
        findFirst: vi
          .fn()
          .mockResolvedValueOnce({ id: "1" })
          .mockResolvedValueOnce(null),
      },
    }
    const result = await slugUnico(tx, nombre)
    expect(result.length).toBeLessThanOrEqual(80)
    expect(result).toMatch(/^[a-z0-9-]+$/)
    expect(result.endsWith("-2")).toBe(true)
  })
})
