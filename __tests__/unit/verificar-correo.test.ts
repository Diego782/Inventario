/**
 * Test unitario para verificarCorreo.
 * Validates: Requirements R3.4, R3.5, R3.6
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock de Prisma
const mockTokenFindUnique = vi.fn()
const mockTokenUpdate = vi.fn()
const mockUsuarioUpdate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    tokenVerificacion: {
      findUnique: (...args: unknown[]) => mockTokenFindUnique(...args),
      update: (...args: unknown[]) => mockTokenUpdate(...args),
    },
    usuario: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: (...args: unknown[]) => mockUsuarioUpdate(...args),
    },
  },
}))

// Mock de password (needed because usuarios.ts imports it)
vi.mock("@/lib/auth/password", () => ({
  hashContrasena: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
}))

// Mock de tokens
vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn().mockReturnValue({ plano: "token-plano", hash: "hash-token" }),
  hashToken: vi.fn().mockReturnValue("hashed-input-token"),
}))

// Mock de vigencia
vi.mock("@/lib/auth/vigencia", () => ({
  vigenciaTokenHoras: vi.fn().mockReturnValue(24),
}))

// Mock de correo
vi.mock("@/lib/correo/enviar", () => ({
  enviarCorreo: vi.fn().mockResolvedValue({ entregado: true }),
  construirEnlace: vi.fn().mockReturnValue("https://app.test/?token=x"),
}))

vi.mock("@/lib/correo/plantillas", () => ({
  plantillaVerificacion: vi.fn().mockReturnValue({
    asunto: "Verifica",
    html: "<p>Verifica</p>",
    texto: "Verifica",
  }),
}))

import { verificarCorreo } from "@/lib/dominio/usuarios"
import { TokenInvalidoError } from "@/lib/dominio/errores-auth"

describe("verificarCorreo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTokenUpdate.mockResolvedValue({})
    mockUsuarioUpdate.mockResolvedValue({})
  })

  it("verifica correo con token válido y no expirado (R3.4)", async () => {
    const futuro = new Date(Date.now() + 60 * 60 * 1000) // +1h
    mockTokenFindUnique.mockResolvedValue({
      id: "token-id-1",
      usuario_id: "user-id-1",
      token_hash: "hashed-input-token",
      expira_en: futuro,
      consumido_en: null,
      usuario: {
        id: "user-id-1",
        correo_verificado: false,
        estado: "pendiente",
      },
    })

    const resultado = await verificarCorreo("mi-token-plano")

    expect(resultado).toEqual({ verificado: true })

    // Marca token como consumido
    expect(mockTokenUpdate).toHaveBeenCalledWith({
      where: { id: "token-id-1" },
      data: { consumido_en: expect.any(Date) },
    })

    // Activa usuario
    expect(mockUsuarioUpdate).toHaveBeenCalledWith({
      where: { id: "user-id-1" },
      data: {
        correo_verificado: true,
        estado: "activo",
      },
    })
  })

  it("retorna éxito idempotente si token ya consumido y usuario verificado (R3.5)", async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: "token-id-2",
      usuario_id: "user-id-2",
      token_hash: "hashed-input-token",
      expira_en: new Date(Date.now() + 60 * 60 * 1000),
      consumido_en: new Date("2024-01-01"), // ya consumido
      usuario: {
        id: "user-id-2",
        correo_verificado: true, // ya verificado
        estado: "activo",
      },
    })

    const resultado = await verificarCorreo("mi-token-plano")

    expect(resultado).toEqual({ verificado: true })
    // No debe actualizar nada
    expect(mockTokenUpdate).not.toHaveBeenCalled()
    expect(mockUsuarioUpdate).not.toHaveBeenCalled()
  })

  it("lanza TokenInvalidoError si token no existe (R3.6)", async () => {
    mockTokenFindUnique.mockResolvedValue(null)

    await expect(verificarCorreo("token-inexistente")).rejects.toThrow(TokenInvalidoError)
    expect(mockTokenUpdate).not.toHaveBeenCalled()
    expect(mockUsuarioUpdate).not.toHaveBeenCalled()
  })

  it("lanza TokenInvalidoError si token ha expirado (R3.6)", async () => {
    const pasado = new Date(Date.now() - 60 * 60 * 1000) // -1h
    mockTokenFindUnique.mockResolvedValue({
      id: "token-id-3",
      usuario_id: "user-id-3",
      token_hash: "hashed-input-token",
      expira_en: pasado, // expirado
      consumido_en: null,
      usuario: {
        id: "user-id-3",
        correo_verificado: false,
        estado: "pendiente",
      },
    })

    await expect(verificarCorreo("mi-token-expirado")).rejects.toThrow(TokenInvalidoError)
    expect(mockTokenUpdate).not.toHaveBeenCalled()
    expect(mockUsuarioUpdate).not.toHaveBeenCalled()
  })

  it("lanza TokenInvalidoError si token consumido pero usuario no verificado", async () => {
    mockTokenFindUnique.mockResolvedValue({
      id: "token-id-4",
      usuario_id: "user-id-4",
      token_hash: "hashed-input-token",
      expira_en: new Date(Date.now() + 60 * 60 * 1000),
      consumido_en: new Date("2024-01-01"), // consumido
      usuario: {
        id: "user-id-4",
        correo_verificado: false, // no verificado
        estado: "pendiente",
      },
    })

    await expect(verificarCorreo("mi-token")).rejects.toThrow(TokenInvalidoError)
    expect(mockTokenUpdate).not.toHaveBeenCalled()
    expect(mockUsuarioUpdate).not.toHaveBeenCalled()
  })
})
