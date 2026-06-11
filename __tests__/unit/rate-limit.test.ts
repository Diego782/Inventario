import { describe, it, expect, beforeEach } from "vitest"

// We need to reset the module between tests to clear the internal Map
let consumir: typeof import("@/lib/auth/rate-limit").consumir
let LIMITE_LOGIN: typeof import("@/lib/auth/rate-limit").LIMITE_LOGIN
let LIMITE_REENVIO: typeof import("@/lib/auth/rate-limit").LIMITE_REENVIO

describe("lib/auth/rate-limit", () => {
  beforeEach(async () => {
    // Re-import to get a fresh Map each time
    vi.resetModules()
    const mod = await import("@/lib/auth/rate-limit")
    consumir = mod.consumir
    LIMITE_LOGIN = mod.LIMITE_LOGIN
    LIMITE_REENVIO = mod.LIMITE_REENVIO
  })

  it("5 llamadas con la misma clave y límite 5 retornan true y la 6.ª retorna false", () => {
    const clave = "test@example.com"
    const limite = 5
    const ventanaMs = 15 * 60 * 1000
    const ahora = 1000000

    for (let i = 0; i < 5; i++) {
      expect(consumir(clave, limite, ventanaMs, ahora + i)).toBe(true)
    }

    expect(consumir(clave, limite, ventanaMs, ahora + 5)).toBe(false)
  })

  it("permite de nuevo tras expirar la ventana", () => {
    const clave = "user@test.com"
    const limite = 5
    const ventanaMs = 1000
    const ahora = 0

    for (let i = 0; i < 5; i++) {
      expect(consumir(clave, limite, ventanaMs, ahora + i)).toBe(true)
    }

    // Blocked within window
    expect(consumir(clave, limite, ventanaMs, ahora + 500)).toBe(false)

    // After window expires, should be allowed again
    expect(consumir(clave, limite, ventanaMs, ahora + 1001)).toBe(true)
  })

  it("claves diferentes no se afectan entre sí", () => {
    const ventanaMs = 60000
    const limite = 2
    const ahora = 0

    expect(consumir("a", limite, ventanaMs, ahora)).toBe(true)
    expect(consumir("a", limite, ventanaMs, ahora)).toBe(true)
    expect(consumir("a", limite, ventanaMs, ahora)).toBe(false)

    // Different key should still be allowed
    expect(consumir("b", limite, ventanaMs, ahora)).toBe(true)
  })

  it("LIMITE_LOGIN es 5 intentos en 15 minutos", () => {
    expect(LIMITE_LOGIN.limite).toBe(5)
    expect(LIMITE_LOGIN.ventanaMs).toBe(15 * 60 * 1000)
  })

  it("LIMITE_REENVIO es 5 intentos en 1 hora", () => {
    expect(LIMITE_REENVIO.limite).toBe(5)
    expect(LIMITE_REENVIO.ventanaMs).toBe(60 * 60 * 1000)
  })
})
