import { describe, it, expect } from "vitest"
import { generarToken, hashToken, coincideToken, esVigente } from "@/lib/auth/tokens"

describe("tokens", () => {
  describe("generarToken", () => {
    it("genera un token cuyo hash coincide con hashToken(plano)", () => {
      const t = generarToken()
      expect(hashToken(t.plano)).toBe(t.hash)
    })

    it("genera tokens únicos en cada invocación", () => {
      const t1 = generarToken()
      const t2 = generarToken()
      expect(t1.plano).not.toBe(t2.plano)
      expect(t1.hash).not.toBe(t2.hash)
    })

    it("el plano es base64url de 32 bytes (43 caracteres)", () => {
      const t = generarToken()
      expect(t.plano).toMatch(/^[A-Za-z0-9_-]{43}$/)
    })

    it("el hash es hex de SHA-256 (64 caracteres)", () => {
      const t = generarToken()
      expect(t.hash).toMatch(/^[0-9a-f]{64}$/)
    })
  })

  describe("hashToken", () => {
    it("produce un hash hex de 64 caracteres", () => {
      const hash = hashToken("test-token")
      expect(hash).toMatch(/^[0-9a-f]{64}$/)
    })

    it("es determinista", () => {
      expect(hashToken("abc")).toBe(hashToken("abc"))
    })
  })

  describe("coincideToken", () => {
    it("devuelve true para un par válido", () => {
      const t = generarToken()
      expect(coincideToken(t.plano, t.hash)).toBe(true)
    })

    it("devuelve false para un token incorrecto", () => {
      const t = generarToken()
      const otro = generarToken()
      expect(coincideToken(otro.plano, t.hash)).toBe(false)
    })
  })

  describe("esVigente", () => {
    it("devuelve false si la fecha de expiración ya pasó", () => {
      const pasado = new Date(Date.now() - 1000)
      expect(esVigente(pasado)).toBe(false)
    })

    it("devuelve true si la fecha de expiración está en el futuro", () => {
      const futuro = new Date(Date.now() + 60_000)
      expect(esVigente(futuro)).toBe(true)
    })

    it("devuelve true si ahora es exactamente la fecha de expiración", () => {
      const ahora = new Date("2025-01-01T00:00:00Z")
      expect(esVigente(ahora, ahora)).toBe(true)
    })

    it("acepta un parámetro ahora personalizado", () => {
      const expira = new Date("2025-06-01T00:00:00Z")
      const antes = new Date("2025-05-31T23:59:59Z")
      const despues = new Date("2025-06-01T00:00:01Z")
      expect(esVigente(expira, antes)).toBe(true)
      expect(esVigente(expira, despues)).toBe(false)
    })
  })
})
