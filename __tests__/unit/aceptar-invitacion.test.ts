/**
 * __tests__/unit/aceptar-invitacion.test.ts
 * Tests for lib/dominio/invitaciones.ts — aceptarInvitacion function
 * Validates: Requirements R10.2, R10.3, R10.4, R10.5, R10.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    invitacion: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membresia: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

// Mock tokens — hashToken returns predictable value
vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn(() => ({ plano: "token-plano-123", hash: "hash-abc" })),
  hashToken: vi.fn((plano: string) => `hashed:${plano}`),
}))

import { prisma } from "@/lib/db"
import { aceptarInvitacion } from "@/lib/dominio/invitaciones"
import {
  InvitacionInvalidaError,
  InvitacionOtroCorreoError,
} from "@/lib/dominio/errores-auth"

const ORG_ID = "org-111"
const ROL_ID = "rol-222"
const USER_ID = "user-333"
const TOKEN = "token-plano-abc"
const TOKEN_HASH = `hashed:${TOKEN}`

const USUARIO_ACTUAL = { id: USER_ID, correo: "invitado@example.com" }

function makeInvitacion(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "inv-1",
    organizacion_id: ORG_ID,
    correo: "invitado@example.com",
    rol_id: ROL_ID,
    estado: "pendiente",
    token_hash: TOKEN_HASH,
    expira_en: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
    invitado_por: "admin-id",
    creado_en: new Date(),
    rol: { id: ROL_ID, nombre: "Editor" },
    ...overrides,
  }
}

beforeEach(() => {
  vi.clearAllMocks()

  // Default $transaction: execute the callback with a tx proxy
  vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
    const tx = {
      membresia: {
        findUnique: vi.mocked(prisma.membresia.findUnique),
        create: vi.mocked(prisma.membresia.create),
      },
      invitacion: {
        update: vi.mocked(prisma.invitacion.update),
      },
    }
    return fn(tx)
  })
})

describe("aceptarInvitacion", () => {
  it("throws InvitacionInvalidaError when token does not exist (R10.4)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(null)

    await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
      InvitacionInvalidaError
    )
    expect(prisma.invitacion.findUnique).toHaveBeenCalledWith({
      where: { token_hash: TOKEN_HASH },
      include: { rol: true },
    })
  })

  it("throws InvitacionInvalidaError when invitation is revocada (R10.4)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(
      makeInvitacion({ estado: "revocada" }) as any
    )

    await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
      InvitacionInvalidaError
    )
  })

  it("updates estado to expirada and throws InvitacionInvalidaError when expired (R10.5)", async () => {
    const expiredInvitacion = makeInvitacion({
      estado: "pendiente",
      expira_en: new Date(Date.now() - 1000), // 1 second ago
    })
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(expiredInvitacion as any)
    vi.mocked(prisma.invitacion.update).mockResolvedValue({ ...expiredInvitacion, estado: "expirada" } as any)

    await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
      InvitacionInvalidaError
    )
    expect(prisma.invitacion.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { estado: "expirada" },
    })
  })

  it("does not update estado again if already expirada when expired (R10.5)", async () => {
    const expiredInvitacion = makeInvitacion({
      estado: "expirada",
      expira_en: new Date(Date.now() - 1000),
    })
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(expiredInvitacion as any)

    await expect(aceptarInvitacion(TOKEN, USUARIO_ACTUAL)).rejects.toThrow(
      InvitacionInvalidaError
    )
    // Should NOT call update since estado is already "expirada"
    expect(prisma.invitacion.update).not.toHaveBeenCalled()
  })

  it("throws InvitacionOtroCorreoError when correo does not match (R10.7)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(
      makeInvitacion({ correo: "otro@example.com" }) as any
    )

    await expect(
      aceptarInvitacion(TOKEN, { id: USER_ID, correo: "invitado@example.com" })
    ).rejects.toThrow(InvitacionOtroCorreoError)
  })

  it("throws InvitacionOtroCorreoError with case-insensitive comparison (R10.7)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(
      makeInvitacion({ correo: "OTRO@EXAMPLE.COM" }) as any
    )

    await expect(
      aceptarInvitacion(TOKEN, { id: USER_ID, correo: "invitado@example.com" })
    ).rejects.toThrow(InvitacionOtroCorreoError)
  })

  it("creates membership and marks invitation as aceptada (R10.2)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(makeInvitacion() as any)
    vi.mocked(prisma.membresia.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.membresia.create).mockResolvedValue({} as any)
    vi.mocked(prisma.invitacion.update).mockResolvedValue({} as any)

    const result = await aceptarInvitacion(TOKEN, USUARIO_ACTUAL)

    expect(result).toEqual({ ok: true })
    expect(prisma.membresia.create).toHaveBeenCalledWith({
      data: {
        usuario_id: USER_ID,
        organizacion_id: ORG_ID,
        rol_id: ROL_ID,
        estado: "activa",
      },
    })
    expect(prisma.invitacion.update).toHaveBeenCalledWith({
      where: { id: "inv-1" },
      data: { estado: "aceptada" },
    })
  })

  it("returns ok:true without creating duplicate membership (idempotent, R10.3)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(makeInvitacion() as any)
    vi.mocked(prisma.membresia.findUnique).mockResolvedValue({
      id: "mem-existing",
      usuario_id: USER_ID,
      organizacion_id: ORG_ID,
    } as any)

    const result = await aceptarInvitacion(TOKEN, USUARIO_ACTUAL)

    expect(result).toEqual({ ok: true })
    // Should NOT create a new membership
    expect(prisma.membresia.create).not.toHaveBeenCalled()
  })

  it("normalizes correo comparison to lowercase (R10.7)", async () => {
    vi.mocked(prisma.invitacion.findUnique).mockResolvedValue(
      makeInvitacion({ correo: "INVITADO@EXAMPLE.COM" }) as any
    )
    vi.mocked(prisma.membresia.findUnique).mockResolvedValue(null)
    vi.mocked(prisma.membresia.create).mockResolvedValue({} as any)
    vi.mocked(prisma.invitacion.update).mockResolvedValue({} as any)

    // Should NOT throw — both normalize to "invitado@example.com"
    const result = await aceptarInvitacion(TOKEN, {
      id: USER_ID,
      correo: "invitado@example.com",
    })
    expect(result).toEqual({ ok: true })
  })
})
