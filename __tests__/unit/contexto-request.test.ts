/**
 * __tests__/unit/contexto-request.test.ts
 * Pruebas ejemplares del guard `resolverContexto`.
 * Validates: Requirements R8.8, R11.4, R12.4, R13.8, R16.4
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock de leerSesion
vi.mock("@/lib/auth/sesion", () => ({
  leerSesion: vi.fn(),
}))

// Mock de prisma
vi.mock("@/lib/db", () => ({
  prisma: {
    membresia: {
      findUnique: vi.fn(),
    },
  },
}))

import { resolverContexto } from "@/lib/auth/contexto-request"
import { leerSesion } from "@/lib/auth/sesion"
import { prisma } from "@/lib/db"

const mockLeerSesion = leerSesion as ReturnType<typeof vi.fn>
const mockFindUnique = prisma.membresia.findUnique as ReturnType<typeof vi.fn>

describe("resolverContexto — 5 caminos", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("1. Sin sesión → error 401 NO_AUTENTICADO", async () => {
    mockLeerSesion.mockResolvedValue(null)

    const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })

    expect(resultado.error).toBeDefined()
    expect(resultado.error!.status).toBe(401)
    const body = await resultado.error!.json()
    expect(body.error.codigo).toBe("NO_AUTENTICADO")
  })

  it("2. Solo sesión → ctx con organizacionActiva null", async () => {
    mockLeerSesion.mockResolvedValue({
      usuario: { id: "u1", correo: "test@mail.com", nombre: "Test" },
      sesion: { id: "s1", organizacion_activa_id: null },
    })

    const resultado = await resolverContexto("solo-sesion")

    expect(resultado.ctx).toBeDefined()
    expect(resultado.ctx!.usuarioActual.id).toBe("u1")
    expect(resultado.ctx!.organizacionActiva).toBeNull()
    expect(resultado.ctx!.permisos).toEqual([])
    expect(resultado.ctx!.sesionId).toBe("s1")
  })

  it("3. Sin org activa (organizacion_activa_id=null con seccion/accion) → error 409", async () => {
    mockLeerSesion.mockResolvedValue({
      usuario: { id: "u1", correo: "test@mail.com", nombre: "Test" },
      sesion: { id: "s1", organizacion_activa_id: null },
    })

    const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })

    expect(resultado.error).toBeDefined()
    expect(resultado.error!.status).toBe(409)
    const body = await resultado.error!.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  it("4. Sin permiso (membresía sin el permiso requerido) → error 403", async () => {
    mockLeerSesion.mockResolvedValue({
      usuario: { id: "u1", correo: "test@mail.com", nombre: "Test" },
      sesion: { id: "s1", organizacion_activa_id: "org1" },
    })

    mockFindUnique.mockResolvedValue({
      estado: "activa",
      organizacion: { id: "org1", nombre: "Mi Org", slug: "mi-org" },
      rol: {
        nombre: "Vendedor",
        permisos: [{ seccion: "ventas", accion: "ver" }],
      },
    })

    const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

    expect(resultado.error).toBeDefined()
    expect(resultado.error!.status).toBe(403)
    const body = await resultado.error!.json()
    expect(body.error.codigo).toBe("PERMISO_DENEGADO")
  })

  it("5. Autorizado → ctx con datos completos", async () => {
    mockLeerSesion.mockResolvedValue({
      usuario: { id: "u1", correo: "test@mail.com", nombre: "Test" },
      sesion: { id: "s1", organizacion_activa_id: "org1" },
    })

    mockFindUnique.mockResolvedValue({
      estado: "activa",
      organizacion: { id: "org1", nombre: "Mi Org", slug: "mi-org" },
      rol: {
        nombre: "Propietario",
        permisos: [
          { seccion: "inventario", accion: "ver" },
          { seccion: "inventario", accion: "editar" },
        ],
      },
    })

    const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })

    expect(resultado.ctx).toBeDefined()
    expect(resultado.ctx!.usuarioActual).toEqual({
      id: "u1",
      correo: "test@mail.com",
      nombre: "Test",
    })
    expect(resultado.ctx!.organizacionActiva).toEqual({
      id: "org1",
      nombre: "Mi Org",
      slug: "mi-org",
    })
    expect(resultado.ctx!.rol).toBe("Propietario")
    expect(resultado.ctx!.permisos).toEqual([
      { seccion: "inventario", accion: "ver" },
      { seccion: "inventario", accion: "editar" },
    ])
    expect(resultado.ctx!.sesionId).toBe("s1")
  })
})
