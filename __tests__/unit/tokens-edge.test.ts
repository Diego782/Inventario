/**
 * __tests__/unit/tokens-edge.test.ts
 * Pruebas de edge cases para tokens inválidos, expirados y revocados.
 * Validates: Requirements R3.6, R10.4, R10.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ── Mocks de Prisma ──────────────────────────────────────────────────────────

const mockTokenFindUnique = vi.fn()
const mockTokenUpdate = vi.fn()
const mockUsuarioUpdate = vi.fn()
const mockInvitacionFindUnique = vi.fn()
const mockInvitacionUpdate = vi.fn()
const mockMembresiaFindUnique = vi.fn()
const mockMembresiaCreate = vi.fn()
const mockTransaction = vi.fn()

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
    invitacion: {
      findUnique: (...args: unknown[]) => mockInvitacionFindUnique(...args),
      update: (...args: unknown[]) => mockInvitacionUpdate(...args),
    },
    membresia: {
      findUnique: (...args: unknown[]) => mockMembresiaFindUnique(...args),
      create: (...args: unknown[]) => mockMembresiaCreate(...args),
    },
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

// ── Mocks de tokens ──────────────────────────────────────────────────────────

vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn().mockReturnValue({ plano: "token-plano", hash: "hash-token" }),
  hashToken: vi.fn((plano: string) => `hashed:${plano}`),
}))

// ── Imports bajo prueba ──────────────────────────────────────────────────────

import { verificarCorreo } from "@/lib/dominio/usuarios"
import { aceptarInvitacion } from "@/lib/dominio/invitaciones"
import { TokenInvalidoError, InvitacionInvalidaError } from "@/lib/dominio/errores-auth"

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOKEN = "mi-token-plano"
const TOKEN_HASH = `hashed:${TOKEN}`

const USUARIO_ACTUAL = { id: "user-1", correo: "invitado@example.com" }

function makeInvitacion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv-1",
    organizacion_id: "org-1",
    correo: "invitado@example.com",
    rol_id: "rol-1",
    estado: "pendiente",
    token_hash: TOKEN_HASH,
    expira_en: new Date(Date.now() + 60 * 60 * 1000), // 1 hora en el futuro
    invitado_por: "admin-id",
    creado_en: new Date(),
    rol: { id: "rol-1", nombre: "Editor" },
    ...overrides,
  }
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Edge cases de tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTokenUpdate.mockResolvedValue({})
    mockUsuarioUpdate.mockResolvedValue({})
    mockInvitacionUpdate.mockResolvedValue({})
    mockMembresiaCreate.mockResolvedValue({})

    // Por defecto, $transaction ejecuta el callback con un proxy de tx
    mockTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) => {
      const tx = {
        membresia: {
          findUnique: mockMembresiaFindUnique,
          create: mockMembresiaCreate,
        },
        invitacion: {
          update: mockInvitacionUpdate,
        },
      }
      return fn(tx)
    })
  })

  // ── verificarCorreo ────────────────────────────────────────────────────────

  describe("verificarCorreo — tokens inválidos", () => {
    it("lanza TokenInvalidoError cuando el token no existe (R3.6)", async () => {
      mockTokenFindUnique.mockResolvedValue(null)

      await expect(verificarCorreo(TOKEN)).rejects.toThrow(TokenInvalidoError)
      expect(mockTokenUpdate).not.toHaveBeenCalled()
      expect(mockUsuarioUpdate).not.toHaveBeenCalled()
    })

    it("lanza TokenInvalidoError cuando el token ha expirado (R3.6)", async () => {
      const pasado = new Date(Date.now() - 60 * 60 * 1000) // hace 1 hora
      mockTokenFindUnique.mockResolvedValue({
        id: "tok-exp",
        usuario_id: "user-1",
        token_hash: TOKEN_HASH,
        expira_en: pasado,
        consumido_en: null,
        usuario: {
          id: "user-1",
          correo_verificado: false,
          estado: "pendiente",
        },
      })

      await expect(verificarCorreo(TOKEN)).rejects.toThrow(TokenInvalidoError)
      expect(mockTokenUpdate).not.toHaveBeenCalled()
      expect(mockUsuarioUpdate).not.toHaveBeenCalled()
    })

    it("lanza TokenInvalidoError cuando el token ya fue consumido pero el usuario no está verificado (R3.6)", async () => {
      mockTokenFindUnique.mockResolvedValue({
        id: "tok-consumed",
        usuario_id: "user-1",
        token_hash: TOKEN_HASH,
        expira_en: new Date(Date.now() + 60 * 60 * 1000),
        consumido_en: new Date("2024-01-01"), // ya consumido
        usuario: {
          id: "user-1",
          correo_verificado: false, // no verificado → inválido
          estado: "pendiente",
        },
      })

      await expect(verificarCorreo(TOKEN)).rejects.toThrow(TokenInvalidoError)
      expect(mockTokenUpdate).not.toHaveBeenCalled()
      expect(mockUsuarioUpdate).not.toHaveBeenCalled()
    })
  })

  // ── aceptarInvitacion ──────────────────────────────────────────────────────

  describe("aceptarInvitacion — tokens/invitaciones inválidos", () => {
    it("lanza InvitacionInvalidaError cuando el token no existe (R10.4)", async () => {
      mockInvitacionFindUnique.mockResolvedValue(null)

      await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
        InvitacionInvalidaError
      )
      expect(mockInvitacionUpdate).not.toHaveBeenCalled()
    })

    it("lanza InvitacionInvalidaError y actualiza estado a 'expirada' cuando el token ha expirado (R10.5)", async () => {
      const invitacionExpirada = makeInvitacion({
        estado: "pendiente",
        expira_en: new Date(Date.now() - 1000), // hace 1 segundo
      })
      mockInvitacionFindUnique.mockResolvedValue(invitacionExpirada)
      mockInvitacionUpdate.mockResolvedValue({ ...invitacionExpirada, estado: "expirada" })

      await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
        InvitacionInvalidaError
      )

      // Debe actualizar el estado a "expirada" antes de lanzar el error
      expect(mockInvitacionUpdate).toHaveBeenCalledWith({
        where: { id: "inv-1" },
        data: { estado: "expirada" },
      })
    })

    it("lanza InvitacionInvalidaError cuando la invitación está revocada (R10.4)", async () => {
      mockInvitacionFindUnique.mockResolvedValue(
        makeInvitacion({ estado: "revocada" })
      )

      await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
        InvitacionInvalidaError
      )
      // No debe intentar actualizar el estado
      expect(mockInvitacionUpdate).not.toHaveBeenCalled()
    })
  })
})
