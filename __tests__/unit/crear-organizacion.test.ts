/**
 * Test unitario para crearOrganizacion.
 * Validates: Requirements R8.1, R8.2, R8.3, R8.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock de la transacción y sus operaciones internas
const mockOrgCreate = vi.fn()
const mockRolCreate = vi.fn()
const mockPermisoRolCreateMany = vi.fn()
const mockMembresiaCreate = vi.fn()
const mockOrgFindFirst = vi.fn()

const mockTx = {
  organizacion: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    findFirst: (...args: unknown[]) => mockOrgFindFirst(...args),
  },
  rol: {
    create: (...args: unknown[]) => mockRolCreate(...args),
  },
  permisoRol: {
    createMany: (...args: unknown[]) => mockPermisoRolCreateMany(...args),
  },
  membresia: {
    create: (...args: unknown[]) => mockMembresiaCreate(...args),
  },
}

const mockTransaction = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

vi.mock("@/lib/auth/slug", () => ({
  slugUnico: vi.fn().mockResolvedValue("mi-organizacion"),
}))

import { crearOrganizacion } from "@/lib/dominio/organizaciones"
import { OrganizacionFallidaError } from "@/lib/dominio/errores-auth"
import { PERMISOS_PROPIETARIO } from "@/lib/auth/permisos"

describe("crearOrganizacion", () => {
  const usuarioActual = { id: "usuario-uuid-123" }
  const nombre = "Mi Organización"

  const orgCreada = {
    id: "org-uuid-456",
    nombre: "Mi Organización",
    slug: "mi-organizacion",
    creado_por: "usuario-uuid-123",
    creado_en: new Date("2024-01-01"),
    actualizado_en: new Date("2024-01-01"),
  }

  const rolCreado = {
    id: "rol-uuid-789",
    organizacion_id: "org-uuid-456",
    nombre: "Propietario",
    es_sistema: true,
    creado_en: new Date("2024-01-01"),
  }

  beforeEach(() => {
    vi.clearAllMocks()

    mockOrgFindFirst.mockResolvedValue(null)
    mockOrgCreate.mockResolvedValue(orgCreada)
    mockRolCreate.mockResolvedValue(rolCreado)
    mockPermisoRolCreateMany.mockResolvedValue({ count: 40 })
    mockMembresiaCreate.mockResolvedValue({
      id: "membresia-uuid-101",
      usuario_id: "usuario-uuid-123",
      organizacion_id: "org-uuid-456",
      rol_id: "rol-uuid-789",
      estado: "activa",
    })

    // Simular $transaction ejecutando el callback con el mock tx
    mockTransaction.mockImplementation(async (cb: Function) => cb(mockTx))
  })

  it("crea organización dentro de una transacción (R8.1)", async () => {
    const resultado = await crearOrganizacion(usuarioActual, nombre)

    expect(mockTransaction).toHaveBeenCalledTimes(1)
    expect(mockOrgCreate).toHaveBeenCalledWith({
      data: {
        nombre: "Mi Organización",
        slug: "mi-organizacion",
        creado_por: "usuario-uuid-123",
      },
    })
    expect(resultado.id).toBe("org-uuid-456")
    expect(resultado.nombre).toBe("Mi Organización")
    expect(resultado.slug).toBe("mi-organizacion")
  })

  it("crea Rol_Propietario con es_sistema=true (R8.2)", async () => {
    await crearOrganizacion(usuarioActual, nombre)

    expect(mockRolCreate).toHaveBeenCalledWith({
      data: {
        organizacion_id: "org-uuid-456",
        nombre: "Propietario",
        es_sistema: true,
      },
    })
  })

  it("crea exactamente 40 permisos_rol para el Rol_Propietario (R8.2)", async () => {
    await crearOrganizacion(usuarioActual, nombre)

    expect(mockPermisoRolCreateMany).toHaveBeenCalledTimes(1)
    const llamada = mockPermisoRolCreateMany.mock.calls[0][0]
    expect(llamada.data).toHaveLength(PERMISOS_PROPIETARIO.length)
    expect(llamada.data).toHaveLength(40)

    // Verificar que cada permiso refiere al rol creado
    for (const permiso of llamada.data) {
      expect(permiso.rol_id).toBe("rol-uuid-789")
      expect(permiso).toHaveProperty("seccion")
      expect(permiso).toHaveProperty("accion")
    }
  })

  it("crea membresía activa del creador con el Rol_Propietario (R8.2, R8.3)", async () => {
    await crearOrganizacion(usuarioActual, nombre)

    expect(mockMembresiaCreate).toHaveBeenCalledWith({
      data: {
        usuario_id: "usuario-uuid-123",
        organizacion_id: "org-uuid-456",
        rol_id: "rol-uuid-789",
        estado: "activa",
      },
    })
  })

  it("lanza OrganizacionFallidaError si la transacción falla (R8.5)", async () => {
    mockTransaction.mockRejectedValue(new Error("DB connection lost"))

    await expect(crearOrganizacion(usuarioActual, nombre)).rejects.toThrow(
      OrganizacionFallidaError
    )
  })

  it("lanza OrganizacionFallidaError si la creación del rol falla (R8.5)", async () => {
    mockRolCreate.mockRejectedValue(new Error("Unique constraint violated"))
    mockTransaction.mockImplementation(async (cb: Function) => cb(mockTx))

    await expect(crearOrganizacion(usuarioActual, nombre)).rejects.toThrow(
      OrganizacionFallidaError
    )
  })

  it("garantiza exactamente un propietario por organización (R8.3)", async () => {
    await crearOrganizacion(usuarioActual, nombre)

    // Solo se crea UNA membresía
    expect(mockMembresiaCreate).toHaveBeenCalledTimes(1)
    // Solo se crea UN rol
    expect(mockRolCreate).toHaveBeenCalledTimes(1)
  })
})
