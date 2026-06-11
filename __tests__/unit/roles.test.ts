/**
 * Test unitario para crearRol, editarRol y eliminarRol.
 * Validates: Requirements R11.3, R11.5, R11.6, R11.7
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---- Mocks de Prisma ----
const mockRolCreate = vi.fn()
const mockRolFindFirst = vi.fn()
const mockRolUpdate = vi.fn()
const mockRolDelete = vi.fn()
const mockMembresiaCount = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    rol: {
      create: (...args: unknown[]) => mockRolCreate(...args),
      findFirst: (...args: unknown[]) => mockRolFindFirst(...args),
      update: (...args: unknown[]) => mockRolUpdate(...args),
      delete: (...args: unknown[]) => mockRolDelete(...args),
    },
    membresia: {
      count: (...args: unknown[]) => mockMembresiaCount(...args),
    },
  },
}))

import { crearRol, editarRol, eliminarRol } from "@/lib/dominio/roles"
import {
  RolPropietarioProtegidoError,
  PropietarioRequeridoError,
} from "@/lib/dominio/errores-auth"

// ---- Fixtures ----
const ORG_ID = "org-uuid-001"
const ROL_ID = "rol-uuid-002"

const rolNormal = {
  id: ROL_ID,
  organizacion_id: ORG_ID,
  nombre: "Vendedor",
  es_sistema: false,
  creado_en: new Date("2024-01-01"),
  permisos: [
    { id: "p1", rol_id: ROL_ID, seccion: "ventas", accion: "ver" },
    { id: "p2", rol_id: ROL_ID, seccion: "ventas", accion: "crear" },
  ],
}

const rolPropietario = {
  id: "rol-propietario-uuid",
  organizacion_id: ORG_ID,
  nombre: "Propietario",
  es_sistema: true,
  creado_en: new Date("2024-01-01"),
  permisos: [],
}

// ---- crearRol ----
describe("crearRol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRolCreate.mockResolvedValue({ ...rolNormal, permisos: [] })
  })

  it("crea un rol no-sistema con nombre y sin permisos (R11.3)", async () => {
    const resultado = await crearRol(ORG_ID, { nombre: "Vendedor" })

    expect(mockRolCreate).toHaveBeenCalledWith({
      data: {
        organizacion_id: ORG_ID,
        nombre: "Vendedor",
        es_sistema: false,
        permisos: undefined,
      },
      include: { permisos: true },
    })
    expect(resultado.nombre).toBe("Vendedor")
    expect(resultado.es_sistema).toBe(false)
  })

  it("crea un rol con permisos cuando se proporcionan (R11.5)", async () => {
    const permisos = [
      { seccion: "ventas", accion: "ver" },
      { seccion: "ventas", accion: "crear" },
    ]
    mockRolCreate.mockResolvedValue({ ...rolNormal, permisos: rolNormal.permisos })

    const resultado = await crearRol(ORG_ID, { nombre: "Vendedor", permisos })

    const llamada = mockRolCreate.mock.calls[0][0]
    expect(llamada.data.permisos).toBeDefined()
    expect(llamada.data.permisos.createMany.data).toHaveLength(2)
    expect(resultado.permisos).toHaveLength(2)
  })

  it("recorta espacios del nombre (R11.3)", async () => {
    await crearRol(ORG_ID, { nombre: "  Cajero  " })

    const llamada = mockRolCreate.mock.calls[0][0]
    expect(llamada.data.nombre).toBe("Cajero")
  })

  it("retorna un RolDTO con los campos esperados", async () => {
    const resultado = await crearRol(ORG_ID, { nombre: "Vendedor" })

    expect(resultado).toHaveProperty("id")
    expect(resultado).toHaveProperty("nombre")
    expect(resultado).toHaveProperty("es_sistema")
    expect(resultado).toHaveProperty("permisos")
    expect(resultado).toHaveProperty("creado_en")
  })
})

// ---- editarRol ----
describe("editarRol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRolFindFirst.mockResolvedValue(rolNormal)
    mockRolUpdate.mockResolvedValue({ ...rolNormal, nombre: "Vendedor Senior" })
  })

  it("edita el nombre de un rol normal (R11.5)", async () => {
    const resultado = await editarRol(ROL_ID, ORG_ID, { nombre: "Vendedor Senior" })

    expect(mockRolUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROL_ID },
        data: expect.objectContaining({ nombre: "Vendedor Senior" }),
      })
    )
    expect(resultado.nombre).toBe("Vendedor Senior")
  })

  it("recorta espacios del nombre al editar (R11.5)", async () => {
    await editarRol(ROL_ID, ORG_ID, { nombre: "  Cajero  " })

    const llamada = mockRolUpdate.mock.calls[0][0]
    expect(llamada.data.nombre).toBe("Cajero")
  })

  it("reemplaza todos los permisos cuando se proporcionan (R11.5)", async () => {
    const nuevosPermisos = [{ seccion: "inventario", accion: "ver" }]
    mockRolUpdate.mockResolvedValue({
      ...rolNormal,
      permisos: [{ id: "p3", rol_id: ROL_ID, seccion: "inventario", accion: "ver" }],
    })

    await editarRol(ROL_ID, ORG_ID, { permisos: nuevosPermisos })

    const llamada = mockRolUpdate.mock.calls[0][0]
    expect(llamada.data.permisos).toBeDefined()
    expect(llamada.data.permisos.deleteMany).toEqual({})
    expect(llamada.data.permisos.createMany.data).toHaveLength(1)
    expect(llamada.data.permisos.createMany.data[0]).toEqual({
      seccion: "inventario",
      accion: "ver",
    })
  })

  it("no modifica permisos si no se proporcionan", async () => {
    await editarRol(ROL_ID, ORG_ID, { nombre: "Nuevo Nombre" })

    const llamada = mockRolUpdate.mock.calls[0][0]
    expect(llamada.data.permisos).toBeUndefined()
  })

  it("lanza RolPropietarioProtegidoError al editar un rol de sistema (R11.6)", async () => {
    mockRolFindFirst.mockResolvedValue(rolPropietario)

    await expect(
      editarRol(rolPropietario.id, ORG_ID, { nombre: "Nuevo Nombre" })
    ).rejects.toThrow(RolPropietarioProtegidoError)

    expect(mockRolUpdate).not.toHaveBeenCalled()
  })

  it("lanza error si el rol no pertenece a la organización", async () => {
    mockRolFindFirst.mockResolvedValue(null)

    await expect(
      editarRol(ROL_ID, "otra-org-id", { nombre: "Nuevo Nombre" })
    ).rejects.toThrow("ROL_NO_ENCONTRADO")
  })

  it("verifica que el rol pertenece a la organización correcta", async () => {
    await editarRol(ROL_ID, ORG_ID, { nombre: "Nuevo Nombre" })

    expect(mockRolFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROL_ID, organizacion_id: ORG_ID },
      })
    )
  })
})

// ---- eliminarRol ----
describe("eliminarRol", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRolFindFirst.mockResolvedValue(rolNormal)
    mockMembresiaCount.mockResolvedValue(0)
    mockRolDelete.mockResolvedValue(rolNormal)
  })

  it("elimina un rol normal sin miembros asignados (R11.3)", async () => {
    const resultado = await eliminarRol(ROL_ID, ORG_ID)

    expect(mockRolDelete).toHaveBeenCalledWith({ where: { id: ROL_ID } })
    expect(resultado).toEqual({ ok: true })
  })

  it("lanza RolPropietarioProtegidoError al eliminar un rol de sistema (R11.6)", async () => {
    mockRolFindFirst.mockResolvedValue(rolPropietario)

    await expect(
      eliminarRol(rolPropietario.id, ORG_ID)
    ).rejects.toThrow(RolPropietarioProtegidoError)

    expect(mockRolDelete).not.toHaveBeenCalled()
  })

  it("lanza error si el rol no pertenece a la organización", async () => {
    mockRolFindFirst.mockResolvedValue(null)

    await expect(
      eliminarRol(ROL_ID, "otra-org-id")
    ).rejects.toThrow("ROL_NO_ENCONTRADO")
  })

  it("lanza PropietarioRequeridoError si hay miembros activos y no hay otro propietario (R11.7)", async () => {
    // Hay 2 miembros activos con este rol
    mockMembresiaCount
      .mockResolvedValueOnce(2)  // membresías con este rol
      .mockResolvedValueOnce(0)  // propietarios activos distintos a este rol

    await expect(
      eliminarRol(ROL_ID, ORG_ID)
    ).rejects.toThrow(PropietarioRequeridoError)

    expect(mockRolDelete).not.toHaveBeenCalled()
  })

  it("permite eliminar un rol con miembros si existe otro propietario activo (R11.7)", async () => {
    // Hay 1 miembro con este rol, pero hay otro propietario activo
    mockMembresiaCount
      .mockResolvedValueOnce(1)  // membresías con este rol
      .mockResolvedValueOnce(1)  // propietarios activos distintos a este rol

    const resultado = await eliminarRol(ROL_ID, ORG_ID)

    expect(mockRolDelete).toHaveBeenCalledWith({ where: { id: ROL_ID } })
    expect(resultado).toEqual({ ok: true })
  })

  it("no verifica propietarios si no hay miembros activos con el rol", async () => {
    // Sin miembros activos con este rol
    mockMembresiaCount.mockResolvedValueOnce(0)

    await eliminarRol(ROL_ID, ORG_ID)

    // Solo se llama una vez (para contar membresías del rol)
    expect(mockMembresiaCount).toHaveBeenCalledTimes(1)
    expect(mockRolDelete).toHaveBeenCalled()
  })

  it("verifica que el rol pertenece a la organización correcta", async () => {
    await eliminarRol(ROL_ID, ORG_ID)

    expect(mockRolFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: ROL_ID, organizacion_id: ORG_ID },
      })
    )
  })
})
