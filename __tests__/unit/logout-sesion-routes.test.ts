/**
 * Unit tests for POST /api/auth/logout and GET /api/auth/sesion routes.
 * Validates: Requirements R4.5, R4.6, R4.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock next/headers cookies
const mockGet = vi.fn()
const mockSet = vi.fn()
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: mockGet,
    set: mockSet,
  })),
}))

// Mock sesion module
const mockLeerSesion = vi.fn()
const mockInvalidarSesionPorCookie = vi.fn()
vi.mock("@/lib/auth/sesion", () => ({
  COOKIE_SESION: "sesion_invenpro",
  leerSesion: (...args: unknown[]) => mockLeerSesion(...args),
  invalidarSesionPorCookie: (...args: unknown[]) => mockInvalidarSesionPorCookie(...args),
}))

describe("POST /api/auth/logout", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("R4.5: retorna 200 { ok: true } cuando hay cookie de sesión", async () => {
    mockGet.mockReturnValue({ value: "token-abc" })
    mockInvalidarSesionPorCookie.mockResolvedValue(undefined)

    const { POST } = await import("@/app/api/auth/logout/route")
    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockInvalidarSesionPorCookie).toHaveBeenCalledWith("token-abc")
    expect(mockSet).toHaveBeenCalledWith("sesion_invenpro", "", expect.objectContaining({
      maxAge: 0,
      httpOnly: true,
      path: "/",
    }))
  })

  it("R4.5: retorna 200 { ok: true } incluso sin cookie (idempotente)", async () => {
    mockGet.mockReturnValue(undefined)

    const { POST } = await import("@/app/api/auth/logout/route")
    const res = await POST()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual({ ok: true })
    expect(mockInvalidarSesionPorCookie).not.toHaveBeenCalled()
  })

  it("R4.5: doble POST retorna 200 ambas veces", async () => {
    // First call with cookie
    mockGet.mockReturnValue({ value: "token-abc" })
    mockInvalidarSesionPorCookie.mockResolvedValue(undefined)

    const { POST } = await import("@/app/api/auth/logout/route")
    const res1 = await POST()
    expect(res1.status).toBe(200)

    // Second call without cookie (already cleared)
    mockGet.mockReturnValue(undefined)
    const res2 = await POST()
    expect(res2.status).toBe(200)
  })
})

describe("GET /api/auth/sesion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("R4.6: con sesión válida retorna 200 con UsuarioDTO", async () => {
    const usuarioDTO = {
      id: "usr-123",
      correo: "test@example.com",
      nombre: "Test User",
      correo_verificado: true,
      estado: "activo",
      creado_en: "2024-01-01T00:00:00.000Z",
    }
    mockLeerSesion.mockResolvedValue({
      usuario: usuarioDTO,
      sesion: { id: "ses-123", organizacion_activa_id: null },
    })

    const { GET } = await import("@/app/api/auth/sesion/route")
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body).toEqual(usuarioDTO)
  })

  it("R4.7: sin sesión retorna 401 SESION_INVALIDA", async () => {
    mockLeerSesion.mockResolvedValue(null)

    const { GET } = await import("@/app/api/auth/sesion/route")
    const res = await GET()
    const body = await res.json()

    expect(res.status).toBe(401)
    expect(body.error.codigo).toBe("SESION_INVALIDA")
  })
})
