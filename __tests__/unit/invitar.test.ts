/**
 * __tests__/unit/invitar.test.ts
 * Tests for lib/dominio/invitaciones.ts — invitar function
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    rol: { findFirst: vi.fn() },
    membresia: { findFirst: vi.fn() },
    organizacion: { findUniqueOrThrow: vi.fn() },
    invitacion: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
  },
}))

// Mock tokens
vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn(() => ({ plano: "token-plano-123", hash: "hash-abc" })),
}))

// Mock correo
vi.mock("@/lib/correo/enviar", () => ({
  enviarCorreo: vi.fn(async () => ({ entregado: true, modo: "consola" })),
  construirEnlace: vi.fn(() => "https://app.test/?token=token-plano-123&accion=invitacion"),
}))

vi.mock("@/lib/correo/plantillas", () => ({
  plantillaInvitacion: vi.fn(() => ({
    asunto: "Invitación",
    html: "<p>Invitación</p>",
    texto: "Invitación",
  })),
}))

import { prisma } from "@/lib/db"
import { invitar } from "@/lib/dominio/invitaciones"
import { MiembroExistenteError, RolFueraDeOrganizacionError } from "@/lib/dominio/errores-auth"
import { enviarCorreo } from "@/lib/correo/enviar"

const ORG_ID = "org-111"
const ROL_ID = "rol-222"
const USER_ID = "user-333"
const CORREO = "invitado@example.com"

beforeEach(() => {
  vi.clearAllMocks()
  process.env.INVITACION_TOKEN_HORAS = "72"
})

describe("invitar", () => {
  it("throws RolFueraDeOrganizacionError when rol does not belong to org (R9.9)", async () => {
    vi.mocked(prisma.rol.findFirst).mockResolvedValue(null)

    await expect(invitar(ORG_ID, CORREO, ROL_ID, USER_ID)).rejects.toThrow(
      RolFueraDeOrganizacionError
    )
    expect(prisma.rol.findFirst).toHaveBeenCalledWith({
      where: { id: ROL_ID, organizacion_id: ORG_ID },
    })
  })

  it("throws MiembroExistenteError when correo is already an active member (R9.5)", async () => {
    vi.mocked(prisma.rol.findFirst).mockResolvedValue({ id: ROL_ID, nombre: "Editor" } as any)
    vi.mocked(prisma.membresia.findFirst).mockResolvedValue({ id: "mem-1" } as any)

    await expect(invitar(ORG_ID, CORREO, ROL_ID, USER_ID)).rejects.toThrow(
      MiembroExistenteError
    )
  })

  it("creates a new invitation and sends email (R9.2, R9.3)", async () => {
    vi.mocked(prisma.rol.findFirst).mockResolvedValue({ id: ROL_ID, nombre: "Editor" } as any)
    vi.mocked(prisma.membresia.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.organizacion.findUniqueOrThrow).mockResolvedValue({ nombre: "Mi Org" } as any)
    vi.mocked(prisma.invitacion.findFirst).mockResolvedValue(null)

    const created = {
      id: "inv-1",
      organizacion_id: ORG_ID,
      correo: CORREO,
      rol_id: ROL_ID,
      estado: "pendiente",
      expira_en: new Date(),
      invitado_por: USER_ID,
      creado_en: new Date(),
    }
    vi.mocked(prisma.invitacion.create).mockResolvedValue(created as any)

    const result = await invitar(ORG_ID, CORREO, ROL_ID, USER_ID)

    expect(result.id).toBe("inv-1")
    expect(result.estado).toBe("pendiente")
    expect(prisma.invitacion.create).toHaveBeenCalled()
    expect(enviarCorreo).toHaveBeenCalled()
  })

  it("regenerates token for existing pending invitation (R9.6)", async () => {
    vi.mocked(prisma.rol.findFirst).mockResolvedValue({ id: ROL_ID, nombre: "Editor" } as any)
    vi.mocked(prisma.membresia.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.organizacion.findUniqueOrThrow).mockResolvedValue({ nombre: "Mi Org" } as any)

    const existing = {
      id: "inv-existing",
      organizacion_id: ORG_ID,
      correo: CORREO,
      rol_id: ROL_ID,
      estado: "pendiente",
      token_hash: "old-hash",
      expira_en: new Date(),
      invitado_por: USER_ID,
      creado_en: new Date(),
    }
    vi.mocked(prisma.invitacion.findFirst).mockResolvedValue(existing as any)

    const updated = { ...existing, token_hash: "hash-abc" }
    vi.mocked(prisma.invitacion.update).mockResolvedValue(updated as any)

    const result = await invitar(ORG_ID, CORREO, ROL_ID, USER_ID)

    expect(result.id).toBe("inv-existing")
    expect(prisma.invitacion.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "inv-existing" },
        data: expect.objectContaining({ token_hash: "hash-abc" }),
      })
    )
    expect(prisma.invitacion.create).not.toHaveBeenCalled()
    expect(enviarCorreo).toHaveBeenCalled()
  })

  it("normalizes correo to lowercase (R9.2)", async () => {
    vi.mocked(prisma.rol.findFirst).mockResolvedValue({ id: ROL_ID, nombre: "Editor" } as any)
    vi.mocked(prisma.membresia.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.organizacion.findUniqueOrThrow).mockResolvedValue({ nombre: "Mi Org" } as any)
    vi.mocked(prisma.invitacion.findFirst).mockResolvedValue(null)
    vi.mocked(prisma.invitacion.create).mockResolvedValue({
      id: "inv-2",
      organizacion_id: ORG_ID,
      correo: "upper@example.com",
      rol_id: ROL_ID,
      estado: "pendiente",
      expira_en: new Date(),
      invitado_por: USER_ID,
      creado_en: new Date(),
    } as any)

    await invitar(ORG_ID, "UPPER@Example.COM", ROL_ID, USER_ID)

    expect(prisma.invitacion.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ correo: "upper@example.com" }),
      })
    )
  })
})
