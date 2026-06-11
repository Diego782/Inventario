/**
 * Test unitario para lib/dominio/horarios.ts
 * Validates: Requirements R14.2, R14.3, R14.6, R14.10
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ---- Mocks de Prisma ----
const mockMembresiaFindFirst = vi.fn()
const mockHorarioCreate = vi.fn()
const mockHorarioFindFirst = vi.fn()
const mockHorarioUpdate = vi.fn()
const mockHorarioFindMany = vi.fn()
const mockHorarioDelete = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    membresia: {
      findFirst: (...args: unknown[]) => mockMembresiaFindFirst(...args),
    },
    horarioMiembro: {
      create: (...args: unknown[]) => mockHorarioCreate(...args),
      findFirst: (...args: unknown[]) => mockHorarioFindFirst(...args),
      update: (...args: unknown[]) => mockHorarioUpdate(...args),
      findMany: (...args: unknown[]) => mockHorarioFindMany(...args),
      delete: (...args: unknown[]) => mockHorarioDelete(...args),
    },
  },
}))

import {
  crearHorario,
  editarHorario,
  listarHorarios,
  eliminarHorario,
} from "@/lib/dominio/horarios"
import { MembresiaFueraDeOrganizacionError } from "@/lib/dominio/errores-auth"

// ---- Fixtures ----
const ORG_ID = "org-uuid-001"
const OTRA_ORG_ID = "org-uuid-002"
const MEMBRESIA_ID = "membresia-uuid-001"
const HORARIO_ID = "horario-uuid-001"

const membresiaEnOrg = {
  id: MEMBRESIA_ID,
  usuario_id: "usuario-uuid-001",
  organizacion_id: ORG_ID,
  rol_id: "rol-uuid-001",
  estado: "activa" as const,
  creado_en: new Date("2024-01-01"),
}

const horarioBase = {
  id: HORARIO_ID,
  membresia_id: MEMBRESIA_ID,
  dia: 1,
  hora_inicio: "09:00",
  hora_fin: "17:00",
  tipo: "normal" as const,
  creado_en: new Date("2024-01-01"),
}

beforeEach(() => {
  vi.clearAllMocks()
})

// ============================================================
// crearHorario
// ============================================================
describe("crearHorario", () => {
  it("crea un horario cuando la membresía pertenece a la organización (R14.2)", async () => {
    mockMembresiaFindFirst.mockResolvedValue(membresiaEnOrg)
    mockHorarioCreate.mockResolvedValue(horarioBase)

    const result = await crearHorario(ORG_ID, {
      membresia_id: MEMBRESIA_ID,
      dia: 1,
      tipo: "normal",
      hora_inicio: "09:00",
      hora_fin: "17:00",
    })

    expect(result.id).toBe(HORARIO_ID)
    expect(result.membresia_id).toBe(MEMBRESIA_ID)
    expect(result.dia).toBe(1)
    expect(result.tipo).toBe("normal")
    expect(result.hora_inicio).toBe("09:00")
    expect(result.hora_fin).toBe("17:00")

    // Verifica que se buscó la membresía con el organizacion_id correcto
    expect(mockMembresiaFindFirst).toHaveBeenCalledWith({
      where: {
        id: MEMBRESIA_ID,
        organizacion_id: ORG_ID,
      },
    })
  })

  it("lanza MembresiaFueraDeOrganizacionError cuando la membresía no pertenece a la org (R14.3)", async () => {
    // La membresía no existe en esta organización
    mockMembresiaFindFirst.mockResolvedValue(null)

    await expect(
      crearHorario(OTRA_ORG_ID, {
        membresia_id: MEMBRESIA_ID,
        dia: 1,
        tipo: "normal",
        hora_inicio: "09:00",
        hora_fin: "17:00",
      })
    ).rejects.toThrow(MembresiaFueraDeOrganizacionError)

    // No debe intentar crear el horario
    expect(mockHorarioCreate).not.toHaveBeenCalled()
  })

  it("crea un horario de tipo vacaciones sin horas (R14.4)", async () => {
    const horarioVacaciones = {
      ...horarioBase,
      tipo: "vacaciones" as const,
      hora_inicio: null,
      hora_fin: null,
    }
    mockMembresiaFindFirst.mockResolvedValue(membresiaEnOrg)
    mockHorarioCreate.mockResolvedValue(horarioVacaciones)

    const result = await crearHorario(ORG_ID, {
      membresia_id: MEMBRESIA_ID,
      dia: 3,
      tipo: "vacaciones",
    })

    expect(result.tipo).toBe("vacaciones")
    expect(result.hora_inicio).toBeNull()
    expect(result.hora_fin).toBeNull()
  })
})

// ============================================================
// editarHorario
// ============================================================
describe("editarHorario", () => {
  it("edita un horario existente de la organización (R14.10)", async () => {
    const horarioActualizado = { ...horarioBase, hora_inicio: "10:00", hora_fin: "18:00" }
    mockHorarioFindFirst.mockResolvedValue(horarioBase)
    mockHorarioUpdate.mockResolvedValue(horarioActualizado)

    const result = await editarHorario(HORARIO_ID, ORG_ID, {
      hora_inicio: "10:00",
      hora_fin: "18:00",
    })

    expect(result.hora_inicio).toBe("10:00")
    expect(result.hora_fin).toBe("18:00")

    // Verifica que se buscó el horario con el filtro de organización
    expect(mockHorarioFindFirst).toHaveBeenCalledWith({
      where: {
        id: HORARIO_ID,
        membresia: {
          organizacion_id: ORG_ID,
        },
      },
    })
  })

  it("lanza HORARIO_NO_ENCONTRADO si el horario no existe en la org", async () => {
    mockHorarioFindFirst.mockResolvedValue(null)

    await expect(
      editarHorario(HORARIO_ID, OTRA_ORG_ID, { dia: 2 })
    ).rejects.toThrow("HORARIO_NO_ENCONTRADO")

    expect(mockHorarioUpdate).not.toHaveBeenCalled()
  })
})

// ============================================================
// listarHorarios
// ============================================================
describe("listarHorarios", () => {
  it("lista todos los horarios de la organización (R14.6)", async () => {
    const horarios = [
      horarioBase,
      { ...horarioBase, id: "horario-uuid-002", dia: 2 },
    ]
    mockHorarioFindMany.mockResolvedValue(horarios)

    const result = await listarHorarios(ORG_ID)

    expect(result).toHaveLength(2)
    expect(result[0].id).toBe(HORARIO_ID)
    expect(result[1].dia).toBe(2)

    // Verifica que se filtra por organizacion_id
    expect(mockHorarioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          membresia: expect.objectContaining({
            organizacion_id: ORG_ID,
          }),
        }),
      })
    )
  })

  it("filtra por membresiaId cuando se proporciona", async () => {
    mockHorarioFindMany.mockResolvedValue([horarioBase])

    await listarHorarios(ORG_ID, MEMBRESIA_ID)

    expect(mockHorarioFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          membresia: expect.objectContaining({
            organizacion_id: ORG_ID,
            id: MEMBRESIA_ID,
          }),
        }),
      })
    )
  })

  it("retorna array vacío si no hay horarios", async () => {
    mockHorarioFindMany.mockResolvedValue([])

    const result = await listarHorarios(ORG_ID)

    expect(result).toEqual([])
  })
})

// ============================================================
// eliminarHorario
// ============================================================
describe("eliminarHorario", () => {
  it("elimina un horario existente de la organización", async () => {
    mockHorarioFindFirst.mockResolvedValue(horarioBase)
    mockHorarioDelete.mockResolvedValue(horarioBase)

    const result = await eliminarHorario(HORARIO_ID, ORG_ID)

    expect(result).toEqual({ ok: true })
    expect(mockHorarioDelete).toHaveBeenCalledWith({
      where: { id: HORARIO_ID },
    })
  })

  it("lanza HORARIO_NO_ENCONTRADO si el horario no existe en la org", async () => {
    mockHorarioFindFirst.mockResolvedValue(null)

    await expect(
      eliminarHorario(HORARIO_ID, OTRA_ORG_ID)
    ).rejects.toThrow("HORARIO_NO_ENCONTRADO")

    expect(mockHorarioDelete).not.toHaveBeenCalled()
  })
})
