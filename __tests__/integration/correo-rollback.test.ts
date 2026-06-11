/**
 * __tests__/integration/correo-rollback.test.ts
 * Pruebas de integración: envío de correo y rollback de aceptación de invitación.
 *
 * 1. Verifica que registrarUsuario conserva el usuario aunque el correo falle (R2.8).
 * 2. Verifica que aceptarInvitacion es transaccional: si falla la creación de
 *    membresía, el estado de la invitación no cambia (R10.2).
 *
 * Validates: Requirements R2.8, R10.2
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Mocks de Prisma ────────────────────────────────────────────────────────

const mockUsuarioFindUnique = vi.fn()
const mockUsuarioCreate = vi.fn()
const mockTokenVerificacionCreate = vi.fn()
const mockInvitacionFindUnique = vi.fn()
const mockInvitacionUpdate = vi.fn()
const mockMembresiaFindUnique = vi.fn()
const mockMembresiaCreate = vi.fn()
const mockTransaction = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    usuario: {
      findUnique: (...args: unknown[]) => mockUsuarioFindUnique(...args),
      create: (...args: unknown[]) => mockUsuarioCreate(...args),
    },
    tokenVerificacion: {
      create: (...args: unknown[]) => mockTokenVerificacionCreate(...args),
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

// ─── Mocks de correo ─────────────────────────────────────────────────────────

const mockEnviarCorreo = vi.fn()
const mockConstruirEnlace = vi.fn()

vi.mock("@/lib/correo/enviar", () => ({
  enviarCorreo: (...args: unknown[]) => mockEnviarCorreo(...args),
  construirEnlace: (...args: unknown[]) => mockConstruirEnlace(...args),
}))

// ─── Mocks auxiliares ────────────────────────────────────────────────────────

vi.mock("@/lib/auth/password", () => ({
  hashContrasena: vi.fn().mockResolvedValue("$2a$12$hashedpassword"),
}))

vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn().mockReturnValue({ plano: "token-plano-123", hash: "hash-del-token" }),
  hashToken: vi.fn((plano: string) => `hashed:${plano}`),
}))

vi.mock("@/lib/auth/vigencia", () => ({
  vigenciaTokenHoras: vi.fn().mockReturnValue(24),
  clampInt: vi.fn().mockReturnValue(72),
}))

vi.mock("@/lib/correo/plantillas", () => ({
  plantillaVerificacion: vi.fn().mockReturnValue({
    asunto: "Verifica tu correo",
    html: "<p>Verifica</p>",
    texto: "Verifica tu correo",
  }),
  plantillaInvitacion: vi.fn().mockReturnValue({
    asunto: "Te invitaron",
    html: "<p>Invitación</p>",
    texto: "Te invitaron",
  }),
}))

// ─── Importaciones bajo test ─────────────────────────────────────────────────

import { registrarUsuario } from "@/lib/dominio/usuarios"
import { aceptarInvitacion } from "@/lib/dominio/invitaciones"
import { InvitacionInvalidaError } from "@/lib/dominio/errores-auth"

// ─── Datos de prueba ─────────────────────────────────────────────────────────

const INPUT_REGISTRO = {
  correo: "nuevo@example.com",
  nombre: "Nuevo Usuario",
  contrasena: "password123",
}

const USUARIO_CREADO = {
  id: "usuario-uuid-001",
  correo: "nuevo@example.com",
  nombre: "Nuevo Usuario",
  hash_contrasena: "$2a$12$hashedpassword",
  estado: "pendiente",
  correo_verificado: false,
  creado_en: new Date("2024-01-01"),
  actualizado_en: new Date("2024-01-01"),
}

const ORG_ID = "org-uuid-001"
const ROL_ID = "rol-uuid-001"
const USER_ID = "user-uuid-001"
const TOKEN = "token-plano-abc"
const TOKEN_HASH = `hashed:${TOKEN}`

const USUARIO_ACTUAL = { id: USER_ID, correo: "invitado@example.com" }

function makeInvitacion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv-uuid-001",
    organizacion_id: ORG_ID,
    correo: "invitado@example.com",
    rol_id: ROL_ID,
    estado: "pendiente",
    token_hash: TOKEN_HASH,
    expira_en: new Date(Date.now() + 60 * 60 * 1000), // 1 hora desde ahora
    invitado_por: "admin-uuid",
    creado_en: new Date(),
    rol: { id: ROL_ID, nombre: "Editor" },
    ...overrides,
  }
}

// ─── Suite de pruebas ─────────────────────────────────────────────────────────

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "Integración: Correo y rollback de aceptación",
  () => {
    beforeEach(() => {
      vi.clearAllMocks()

      // Defaults para registro
      mockUsuarioFindUnique.mockResolvedValue(null)
      mockUsuarioCreate.mockResolvedValue(USUARIO_CREADO)
      mockTokenVerificacionCreate.mockResolvedValue({ id: "token-id-001" })
      mockConstruirEnlace.mockReturnValue("https://app.test/?token=token-plano-123&accion=verificar")

      // Default $transaction: ejecuta el callback con un proxy de tx
      mockTransaction.mockImplementation(async (fn: Function) => {
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

    // ── Bloque 1: registrarUsuario conserva el usuario si el correo falla (R2.8) ──

    describe("registrarUsuario — conserva el usuario aunque el correo falle (R2.8)", () => {
      it("retorna el usuario creado con envioCorreo='fallido' cuando el SMTP lanza error", async () => {
        mockEnviarCorreo.mockRejectedValue(new Error("SMTP connection refused"))

        const resultado = await registrarUsuario(INPUT_REGISTRO)

        // El usuario debe haberse creado
        expect(mockUsuarioCreate).toHaveBeenCalledOnce()
        expect(resultado.usuario.id).toBe(USUARIO_CREADO.id)
        expect(resultado.usuario.correo).toBe("nuevo@example.com")
        expect(resultado.usuario.estado).toBe("pendiente")
        expect(resultado.usuario.correo_verificado).toBe(false)

        // El envío se marca como fallido
        expect(resultado.envioCorreo).toBe("fallido")
      })

      it("el token de verificación se persiste aunque el correo falle (R2.8)", async () => {
        mockEnviarCorreo.mockRejectedValue(new Error("Timeout"))

        await registrarUsuario(INPUT_REGISTRO)

        // El token debe haberse creado antes del intento de envío
        expect(mockTokenVerificacionCreate).toHaveBeenCalledOnce()
        expect(mockTokenVerificacionCreate).toHaveBeenCalledWith({
          data: expect.objectContaining({
            usuario_id: USUARIO_CREADO.id,
            token_hash: "hash-del-token",
            expira_en: expect.any(Date),
          }),
        })
      })

      it("el usuario no incluye hash_contrasena en el resultado (R2.6)", async () => {
        mockEnviarCorreo.mockRejectedValue(new Error("SMTP error"))

        const resultado = await registrarUsuario(INPUT_REGISTRO)

        expect(resultado.usuario).not.toHaveProperty("hash_contrasena")
      })

      it("retorna envioCorreo='ok' cuando el correo se envía correctamente", async () => {
        mockEnviarCorreo.mockResolvedValue({ entregado: true, modo: "smtp" })

        const resultado = await registrarUsuario(INPUT_REGISTRO)

        expect(resultado.envioCorreo).toBe("ok")
        expect(resultado.usuario.id).toBe(USUARIO_CREADO.id)
      })

      it("no crea el usuario si el correo ya existe, independientemente del correo (R2.10)", async () => {
        mockUsuarioFindUnique.mockResolvedValue(USUARIO_CREADO)

        const { CorreoDuplicadoError } = await import("@/lib/dominio/errores-auth")
        await expect(registrarUsuario(INPUT_REGISTRO)).rejects.toThrow(CorreoDuplicadoError)

        expect(mockUsuarioCreate).not.toHaveBeenCalled()
        expect(mockEnviarCorreo).not.toHaveBeenCalled()
      })
    })

    // ── Bloque 2: aceptarInvitacion es transaccional (R10.2) ──────────────────

    describe("aceptarInvitacion — transaccionalidad: rollback si falla la membresía (R10.2)", () => {
      it("no cambia el estado de la invitación si falla la creación de membresía", async () => {
        mockInvitacionFindUnique.mockResolvedValue(makeInvitacion())
        mockMembresiaFindUnique.mockResolvedValue(null)

        // La creación de membresía falla dentro de la transacción
        mockMembresiaCreate.mockRejectedValue(new Error("DB constraint violation"))

        // La transacción debe propagar el error
        mockTransaction.mockImplementation(async (fn: Function) => {
          const tx = {
            membresia: {
              findUnique: mockMembresiaFindUnique,
              create: mockMembresiaCreate,
            },
            invitacion: {
              update: mockInvitacionUpdate,
            },
          }
          // Simula rollback: si el callback lanza, no se persiste nada
          try {
            return await fn(tx)
          } catch (err) {
            // Rollback: mockInvitacionUpdate no debe haber sido llamado con "aceptada"
            throw err
          }
        })

        await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow()

        // El estado de la invitación NO debe haberse actualizado a "aceptada"
        const llamadasUpdate = mockInvitacionUpdate.mock.calls.filter(
          (call) => call[0]?.data?.estado === "aceptada"
        )
        expect(llamadasUpdate).toHaveLength(0)
      })

      it("crea membresía y marca invitación como aceptada en la misma transacción (R10.2)", async () => {
        mockInvitacionFindUnique.mockResolvedValue(makeInvitacion())
        mockMembresiaFindUnique.mockResolvedValue(null)
        mockMembresiaCreate.mockResolvedValue({
          id: "mem-uuid-001",
          usuario_id: USER_ID,
          organizacion_id: ORG_ID,
          rol_id: ROL_ID,
          estado: "activa",
        })
        mockInvitacionUpdate.mockResolvedValue({})

        const resultado = await aceptarInvitacion(TOKEN, USUARIO_ACTUAL)

        expect(resultado).toEqual({ ok: true })

        // Ambas operaciones deben haberse ejecutado dentro de la transacción
        expect(mockMembresiaCreate).toHaveBeenCalledWith({
          data: {
            usuario_id: USER_ID,
            organizacion_id: ORG_ID,
            rol_id: ROL_ID,
            estado: "activa",
          },
        })
        expect(mockInvitacionUpdate).toHaveBeenCalledWith({
          where: { id: "inv-uuid-001" },
          data: { estado: "aceptada" },
        })
      })

      it("no crea membresía duplicada si ya existe (idempotencia, R10.3)", async () => {
        mockInvitacionFindUnique.mockResolvedValue(makeInvitacion())
        mockMembresiaFindUnique.mockResolvedValue({
          id: "mem-existente",
          usuario_id: USER_ID,
          organizacion_id: ORG_ID,
        })

        const resultado = await aceptarInvitacion(TOKEN, USUARIO_ACTUAL)

        expect(resultado).toEqual({ ok: true })
        expect(mockMembresiaCreate).not.toHaveBeenCalled()
      })

      it("lanza InvitacionInvalidaError si el token no existe (R10.4)", async () => {
        mockInvitacionFindUnique.mockResolvedValue(null)

        await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
          InvitacionInvalidaError
        )
        expect(mockTransaction).not.toHaveBeenCalled()
      })

      it("lanza InvitacionInvalidaError si la invitación está revocada (R10.4)", async () => {
        mockInvitacionFindUnique.mockResolvedValue(makeInvitacion({ estado: "revocada" }))

        await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
          InvitacionInvalidaError
        )
        expect(mockTransaction).not.toHaveBeenCalled()
      })

      it("actualiza estado a 'expirada' y lanza InvitacionInvalidaError si expiró (R10.5)", async () => {
        const invitacionExpirada = makeInvitacion({
          estado: "pendiente",
          expira_en: new Date(Date.now() - 1000), // hace 1 segundo
        })
        mockInvitacionFindUnique.mockResolvedValue(invitacionExpirada)
        mockInvitacionUpdate.mockResolvedValue({ ...invitacionExpirada, estado: "expirada" })

        await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
          InvitacionInvalidaError
        )

        // Debe actualizar el estado a "expirada" (fuera de la transacción)
        expect(mockInvitacionUpdate).toHaveBeenCalledWith({
          where: { id: "inv-uuid-001" },
          data: { estado: "expirada" },
        })
        // La transacción de membresía no debe haberse iniciado
        expect(mockTransaction).not.toHaveBeenCalled()
      })
    })
  }
)
