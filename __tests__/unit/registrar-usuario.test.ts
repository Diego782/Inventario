/**
 * Test unitario para registrarUsuario.
 * Validates: Requirements R2.4, R2.5, R2.7, R2.8, R2.9, R2.10
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock de Prisma
const mockFindUnique = vi.fn()
const mockCreate = vi.fn()
const mockTokenCreate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    usuario: {
      findUnique: (...args: unknown[]) => mockFindUnique(...args),
      create: (...args: unknown[]) => mockCreate(...args),
    },
    tokenVerificacion: {
      create: (...args: unknown[]) => mockTokenCreate(...args),
    },
  },
}))

// Mock de password
vi.mock("@/lib/auth/password", () => ({
  hashContrasena: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
}))

// Mock de tokens
vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn().mockReturnValue({ plano: "token-plano-123", hash: "hash-del-token" }),
}))

// Mock de vigencia
vi.mock("@/lib/auth/vigencia", () => ({
  vigenciaTokenHoras: vi.fn().mockReturnValue(24),
}))

// Mock de enviar correo
const mockEnviarCorreo = vi.fn()
const mockConstruirEnlace = vi.fn()

vi.mock("@/lib/correo/enviar", () => ({
  enviarCorreo: (...args: unknown[]) => mockEnviarCorreo(...args),
  construirEnlace: (...args: unknown[]) => mockConstruirEnlace(...args),
}))

vi.mock("@/lib/correo/plantillas", () => ({
  plantillaVerificacion: vi.fn().mockReturnValue({
    asunto: "Verifica tu correo",
    html: "<p>Verifica</p>",
    texto: "Verifica tu correo",
  }),
}))

import { registrarUsuario } from "@/lib/dominio/usuarios"
import { CorreoDuplicadoError } from "@/lib/dominio/errores-auth"
import { hashContrasena } from "@/lib/auth/password"
import { generarToken } from "@/lib/auth/tokens"

describe("registrarUsuario", () => {
  const inputValido = {
    correo: "Test@Example.COM",
    nombre: "  Juan Pérez  ",
    contrasena: "password123",
  }

  const usuarioCreado = {
    id: "uuid-123",
    correo: "test@example.com",
    nombre: "Juan Pérez",
    hash_contrasena: "$2a$12$hashedpassword",
    estado: "pendiente",
    correo_verificado: false,
    creado_en: new Date("2024-01-01"),
    actualizado_en: new Date("2024-01-01"),
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockFindUnique.mockResolvedValue(null)
    mockCreate.mockResolvedValue(usuarioCreado)
    mockTokenCreate.mockResolvedValue({ id: "token-id" })
    mockEnviarCorreo.mockResolvedValue({ entregado: true, modo: "consola" })
    mockConstruirEnlace.mockReturnValue("https://app.test/?token=token-plano-123&accion=verificar")
  })

  it("crea usuario con estado pendiente y hash bcrypt (R2.4, R2.5)", async () => {
    const resultado = await registrarUsuario(inputValido)

    expect(hashContrasena).toHaveBeenCalledWith("password123")
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        correo: "test@example.com",
        nombre: "Juan Pérez",
        hash_contrasena: "$2a$12$hashedpassword",
        estado: "pendiente",
        correo_verificado: false,
      }),
    })
    expect(resultado.usuario.estado).toBe("pendiente")
    expect(resultado.usuario.correo_verificado).toBe(false)
  })

  it("normaliza correo a minúsculas (R2.9)", async () => {
    await registrarUsuario(inputValido)

    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { correo: "test@example.com" },
    })
    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ correo: "test@example.com" }),
    })
  })

  it("rechaza correo duplicado con CorreoDuplicadoError (R2.10)", async () => {
    mockFindUnique.mockResolvedValue(usuarioCreado)

    await expect(registrarUsuario(inputValido)).rejects.toThrow(CorreoDuplicadoError)
    expect(mockCreate).not.toHaveBeenCalled()
  })

  it("genera token de verificación con hash y expira_en (R2.7)", async () => {
    await registrarUsuario(inputValido)

    expect(generarToken).toHaveBeenCalled()
    expect(mockTokenCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        usuario_id: "uuid-123",
        token_hash: "hash-del-token",
        expira_en: expect.any(Date),
      }),
    })

    const llamada = mockTokenCreate.mock.calls[0][0]
    const expiraEn = llamada.data.expira_en as Date
    // Verificar que expira en ~24h (con margen de 1 minuto)
    const diferenciaMs = expiraEn.getTime() - Date.now()
    const horasEsperadas = 24 * 60 * 60 * 1000
    expect(diferenciaMs).toBeGreaterThan(horasEsperadas - 60_000)
    expect(diferenciaMs).toBeLessThanOrEqual(horasEsperadas)
  })

  it("envía correo de verificación exitosamente", async () => {
    const resultado = await registrarUsuario(inputValido)

    expect(mockConstruirEnlace).toHaveBeenCalledWith("token-plano-123", "verificar")
    expect(mockEnviarCorreo).toHaveBeenCalledWith({
      para: "test@example.com",
      asunto: "Verifica tu correo",
      html: "<p>Verifica</p>",
      texto: "Verifica tu correo",
    })
    expect(resultado.envioCorreo).toBe("ok")
  })

  it("conserva usuario si envío de correo falla (R2.8)", async () => {
    mockEnviarCorreo.mockRejectedValue(new Error("SMTP error"))

    const resultado = await registrarUsuario(inputValido)

    expect(resultado.usuario.id).toBe("uuid-123")
    expect(resultado.envioCorreo).toBe("fallido")
  })

  it("no incluye hash_contrasena en el resultado (R2.6)", async () => {
    const resultado = await registrarUsuario(inputValido)

    expect(resultado.usuario).not.toHaveProperty("hash_contrasena")
  })
})
