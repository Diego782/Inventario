/**
 * Property 5: Idempotencia de la verificación de correo
 * **Validates: Requirements 3.4, 3.5**
 *
 * Tras la primera verificación válida el usuario queda correo_verificado=true / estado=activo;
 * re-aplicar con el token consumido deja el estado sin cambios.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// --- In-memory repositories ---
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

vi.mock("@/lib/auth/password", () => ({
  hashContrasena: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
}))

vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn().mockReturnValue({ plano: "token-plano", hash: "hash-token" }),
  hashToken: vi.fn((token: string) => `hashed_${token}`),
}))

vi.mock("@/lib/auth/vigencia", () => ({
  vigenciaTokenHoras: vi.fn().mockReturnValue(24),
}))

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

describe("Property 5: Idempotencia de la verificación de correo", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTokenUpdate.mockResolvedValue({})
    mockUsuarioUpdate.mockResolvedValue({})
  })

  it("P5 — Primera verificación activa al usuario; segunda invocación con token consumido deja el estado sin cambios", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tokenId: fc.uuid(),
          usuarioId: fc.uuid(),
          tokenPlano: fc.string({ minLength: 16, maxLength: 64 }),
          horasHastaExpiracion: fc.integer({ min: 1, max: 168 }),
        }),
        async ({ tokenId, usuarioId, tokenPlano, horasHastaExpiracion }) => {
          // Reset mocks for each property run
          mockTokenFindUnique.mockReset()
          mockTokenUpdate.mockReset()
          mockUsuarioUpdate.mockReset()
          mockTokenUpdate.mockResolvedValue({})
          mockUsuarioUpdate.mockResolvedValue({})

          // Setup: usuario en estado pendiente con token válido no expirado
          const expiraEn = new Date(Date.now() + horasHastaExpiracion * 60 * 60 * 1000)
          const tokenHash = `hashed_${tokenPlano}`

          const tokenRecord = {
            id: tokenId,
            usuario_id: usuarioId,
            token_hash: tokenHash,
            expira_en: expiraEn,
            consumido_en: null as Date | null,
            usuario: {
              id: usuarioId,
              correo_verificado: false,
              estado: "pendiente",
            },
          }

          // Configure mocks for first call (valid, unconsumed token)
          mockTokenFindUnique.mockResolvedValueOnce({ ...tokenRecord, usuario: { ...tokenRecord.usuario } })

          // --- First call: should activate the user ---
          const resultado1 = await verificarCorreo(tokenPlano)

          // After first verification: user is activo, correo_verificado=true
          expect(resultado1).toEqual({ verificado: true })
          expect(mockTokenUpdate).toHaveBeenCalledWith({
            where: { id: tokenId },
            data: { consumido_en: expect.any(Date) },
          })
          expect(mockUsuarioUpdate).toHaveBeenCalledWith({
            where: { id: usuarioId },
            data: {
              correo_verificado: true,
              estado: "activo",
            },
          })

          // --- Second call: token now consumed, user already verified (idempotent) ---
          mockTokenUpdate.mockClear()
          mockUsuarioUpdate.mockClear()

          const tokenRecordConsumed = {
            ...tokenRecord,
            consumido_en: new Date(),
            usuario: {
              id: usuarioId,
              correo_verificado: true,
              estado: "activo",
            },
          }

          mockTokenFindUnique.mockResolvedValueOnce({ ...tokenRecordConsumed })

          const resultado2 = await verificarCorreo(tokenPlano)

          // Idempotent: same success result, no state changes
          expect(resultado2).toEqual({ verificado: true })
          expect(mockTokenUpdate).not.toHaveBeenCalled()
          expect(mockUsuarioUpdate).not.toHaveBeenCalled()
        }
      ),
      { numRuns: 100 }
    )
  })
})
