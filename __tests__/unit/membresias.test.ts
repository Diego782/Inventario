/**
 * Test unitario para asignarRol en lib/dominio/membresias.ts
 * Validates: Requirements R11.7, R11.8, R11.9
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---- Mocks de Prisma ----
const mockMembresiaFindFirst = vi.fn()
const mockRolFindFirst = vi.fn()
const mockMembresiaCount = vi.fn()
const mockMembresiaUpdate = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    membresia: {
      findFirst: (...args: unknown[]) => mockMembresiaFindFirst(...args),
      count: (...args: unknown[]) => mockMembresiaCount(...args),
      update: (...args: unknown[]) => mockMembresiaUpdate(...args),
    },
    rol: {
      findFirst: (...args: unknown[]) => mockRolFindFirst(...args),
    },
  },
}))

import { asignarRol } from "@/lib/dominio/membresias"
import {
  RolFueraDeOrganizacionError,
  PropietarioRequeridoError,
} from "@/lib/dominio/errores-auth"

// ---- Fixtures ----
const ORG_ID = "org-uuid-001"
const MEMBRESIA_ID = "membresia-uuid-001"
const ROL_VENDEDOR_ID = "rol-vendedor-uuid"
const ROL_PROPIETARIO_ID = "rol-propietario-uuid"
const ROL_OTRA_ORG_ID = "rol-otra-org-uuid"

const usuario = {
  id: "usuario-uuid-001",
  correo: "usuario@ejemplo.com",
  nombre: "Usuario Ejemplo",
  hash_contrasena: "hash",
  correo_verificado: true,
  estado: "activo" as const,
  creado_en: new Date("2024-01-01"),
  actualizado_en: new Date("2024-01-01"),
}

const rolVendedor = {
  id: ROL_VENDEDOR_ID,
  organizacion_id: ORG_ID,
  nombre: "Vendedor",
  es_sistema: false,
  creado_en: new Date("2024-01-01"),
}

const rolPropietario = {
  id: ROL_PROPIETARIO_ID,
  organizacion_id: ORG_ID,
  nombre: "Propietario",
  es_sistema: true,
  creado_en: new Date("2024-01-01"),
}

const membresiaConRolNormal = {
  id: MEMBRESIA_ID,
  usuario_id: usuario.id,
  organizacion_id: ORG_ID,
  rol_id: ROL_VENDEDOR_ID,
  estado: "activa" as const,
  creado_en: new Date("2024-01-01"),
  usuario,
  rol: rolVendedor,
}

const membresiaConRolPropietario = {
  id: MEMBRESIA_ID,
  usuario_id: usuario.id,
  organizacion_id: ORG_ID,
  rol_id: ROL_PROPIETARIO_ID,
  estado: "activa" as const,
  creado_en: new Date("2024-01-01"),
  usuario,
  rol: rolPropietario,
}

const rolNuevo = {
  id: "rol-nuevo-uuid",
  organizacion_id: ORG_ID,
  nombre: "Cajero",
  es_sistema: false,
  creado_en: new Date("2024-01-01"),
}

// ---- asignarRol ----
describe("asignarRol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ---- Caso exitoso: asignación válida ----
  it("asigna un rol válido de la misma org y retorna MiembroDTO (R11.8)", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    mockRolFindFirst.mockResolvedValue(rolNuevo)
    mockMembresiaUpdate.mockResolvedValue({
      ...membresiaConRolNormal,
      rol_id: rolNuevo.id,
      rol: rolNuevo,
    })

    const resultado = await asignarRol(MEMBRESIA_ID, rolNuevo.id, ORG_ID)

    expect(mockMembresiaUpdate).toHaveBeenCalledWith({
      where: { id: MEMBRESIA_ID },
      data: { rol_id: rolNuevo.id },
      include: { usuario: true, rol: true },
    })
    expect(resultado).toMatchObject({
      id: MEMBRESIA_ID,
      usuario: {
        id: usuario.id,
        correo: usuario.correo,
        nombre: usuario.nombre,
      },
      rol: rolNuevo.nombre,
      estado: "activa",
    })
  })

  it("verifica que la membresía pertenece a la organización correcta", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    mockRolFindFirst.mockResolvedValue(rolNuevo)
    mockMembresiaUpdate.mockResolvedValue({
      ...membresiaConRolNormal,
      rol: rolNuevo,
    })

    await asignarRol(MEMBRESIA_ID, rolNuevo.id, ORG_ID)

    expect(mockMembresiaFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MEMBRESIA_ID, organizacion_id: ORG_ID },
      })
    )
  })

  it("verifica que el nuevo rol pertenece a la organización correcta (R11.9)", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    mockRolFindFirst.mockResolvedValue(rolNuevo)
    mockMembresiaUpdate.mockResolvedValue({
      ...membresiaConRolNormal,
      rol: rolNuevo,
    })

    await asignarRol(MEMBRESIA_ID, rolNuevo.id, ORG_ID)

    expect(mockRolFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: rolNuevo.id, organizacion_id: ORG_ID },
      })
    )
  })

  // ---- Rol de otra organización ----
  it("lanza RolFueraDeOrganizacionError si el nuevo rol no pertenece a la org (R11.9)", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    // El rol no se encuentra en la organización
    mockRolFindFirst.mockResolvedValue(null)

    await expect(
      asignarRol(MEMBRESIA_ID, ROL_OTRA_ORG_ID, ORG_ID)
    ).rejects.toThrow(RolFueraDeOrganizacionError)

    expect(mockMembresiaUpdate).not.toHaveBeenCalled()
  })

  it("no actualiza la membresía cuando el rol es de otra org (R11.9)", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    mockRolFindFirst.mockResolvedValue(null)

    await expect(
      asignarRol(MEMBRESIA_ID, ROL_OTRA_ORG_ID, ORG_ID)
    ).rejects.toThrow(RolFueraDeOrganizacionError)

    expect(mockMembresiaUpdate).not.toHaveBeenCalled()
  })

  // ---- Protección del último propietario ----
  it("lanza PropietarioRequeridoError al degradar al único propietario (R11.7)", async () => {
    // La membresía tiene el rol propietario (es_sistema=true)
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolPropietario)
    // El nuevo rol existe en la org
    mockRolFindFirst.mockResolvedValue(rolVendedor)
    // Solo hay 1 propietario activo (el que se intenta degradar)
    mockMembresiaCount.mockResolvedValue(1)

    await expect(
      asignarRol(MEMBRESIA_ID, ROL_VENDEDOR_ID, ORG_ID)
    ).rejects.toThrow(PropietarioRequeridoError)

    expect(mockMembresiaUpdate).not.toHaveBeenCalled()
  })

  it("permite cambiar el rol de un propietario si hay otro propietario activo (R11.7)", async () => {
    // La membresía tiene el rol propietario
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolPropietario)
    // El nuevo rol existe en la org
    mockRolFindFirst.mockResolvedValue(rolVendedor)
    // Hay 2 propietarios activos, así que se puede degradar uno
    mockMembresiaCount.mockResolvedValue(2)
    mockMembresiaUpdate.mockResolvedValue({
      ...membresiaConRolPropietario,
      rol_id: ROL_VENDEDOR_ID,
      rol: rolVendedor,
    })

    const resultado = await asignarRol(MEMBRESIA_ID, ROL_VENDEDOR_ID, ORG_ID)

    expect(mockMembresiaUpdate).toHaveBeenCalled()
    expect(resultado.rol).toBe(rolVendedor.nombre)
  })

  it("no verifica propietarios si el rol actual no es de sistema", async () => {
    // La membresía tiene un rol normal (no es_sistema)
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    mockRolFindFirst.mockResolvedValue(rolNuevo)
    mockMembresiaUpdate.mockResolvedValue({
      ...membresiaConRolNormal,
      rol: rolNuevo,
    })

    await asignarRol(MEMBRESIA_ID, rolNuevo.id, ORG_ID)

    // No debe consultar el conteo de propietarios
    expect(mockMembresiaCount).not.toHaveBeenCalled()
  })

  // ---- Membresía no encontrada ----
  it("lanza error si la membresía no existe en la organización", async () => {
    mockMembresiaFindFirst.mockResolvedValue(null)

    await expect(
      asignarRol("membresia-inexistente", rolNuevo.id, ORG_ID)
    ).rejects.toThrow("MEMBRESIA_NO_ENCONTRADA")

    expect(mockRolFindFirst).not.toHaveBeenCalled()
    expect(mockMembresiaUpdate).not.toHaveBeenCalled()
  })

  it("lanza error si la membresía pertenece a otra organización", async () => {
    // findFirst retorna null porque la membresía no está en ORG_ID
    mockMembresiaFindFirst.mockResolvedValue(null)

    await expect(
      asignarRol(MEMBRESIA_ID, rolNuevo.id, "otra-org-id")
    ).rejects.toThrow("MEMBRESIA_NO_ENCONTRADA")
  })

  // ---- Retorno correcto del DTO ----
  it("retorna un MiembroDTO con los campos esperados (R11.8)", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaConRolNormal)
    mockRolFindFirst.mockResolvedValue(rolNuevo)
    mockMembresiaUpdate.mockResolvedValue({
      ...membresiaConRolNormal,
      rol_id: rolNuevo.id,
      rol: rolNuevo,
    })

    const resultado = await asignarRol(MEMBRESIA_ID, rolNuevo.id, ORG_ID)

    expect(resultado).toHaveProperty("id")
    expect(resultado).toHaveProperty("usuario")
    expect(resultado).toHaveProperty("rol")
    expect(resultado).toHaveProperty("estado")
    expect(resultado).toHaveProperty("creado_en")
    // No debe exponer datos sensibles
    expect(resultado).not.toHaveProperty("hash_contrasena")
    expect(resultado).not.toHaveProperty("hash_sesion")
  })
})
