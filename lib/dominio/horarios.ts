/**
 * lib/dominio/horarios.ts
 * Lógica de dominio para crear, editar, listar y eliminar horarios de miembros.
 *
 * Validates: Requirements R14.1, R14.2, R14.3, R14.4, R14.5, R14.6, R14.10
 */

import { prisma } from "@/lib/db"
import { toHorarioDTO, type HorarioMiembroDTO } from "@/lib/api/serializadores-auth"
import { MembresiaFueraDeOrganizacionError } from "@/lib/dominio/errores-auth"
import type { CrearHorarioInput, EditarHorarioInput } from "@/lib/schemas/horarios"

/**
 * Crea un nuevo HorarioMiembro para una membresía de la organización indicada.
 *
 * Pasos:
 * 1. Verifica que la membresía indicada en `input.membresia_id` pertenezca a
 *    `organizacionId` → lanza `MembresiaFueraDeOrganizacionError` si no (R14.3).
 * 2. Persiste el registro `HorarioMiembro`.
 * 3. Retorna el `HorarioMiembroDTO` creado (R14.2).
 *
 * @throws {MembresiaFueraDeOrganizacionError} si la membresía no pertenece a la org
 */
export async function crearHorario(
  organizacionId: string,
  input: CrearHorarioInput
): Promise<HorarioMiembroDTO> {
  // 1. Verificar que la membresía pertenece a la organización (R14.3)
  const membresia = await prisma.membresia.findFirst({
    where: {
      id: input.membresia_id,
      organizacion_id: organizacionId,
    },
  })

  if (!membresia) {
    throw new MembresiaFueraDeOrganizacionError()
  }

  // 2. Persistir el HorarioMiembro (R14.2, R14.4)
  const horario = await prisma.horarioMiembro.create({
    data: {
      membresia_id: input.membresia_id,
      dia: input.dia,
      tipo: input.tipo,
      hora_inicio: input.hora_inicio ?? null,
      hora_fin: input.hora_fin ?? null,
    },
  })

  // 3. Retornar el DTO
  return toHorarioDTO(horario)
}

/**
 * Edita un HorarioMiembro existente de la organización indicada.
 *
 * Pasos:
 * 1. Busca el horario por `horarioId` y verifica que su membresía pertenezca a
 *    `organizacionId` → lanza error si no existe o es de otra org.
 * 2. Aplica los campos proporcionados en `input` (actualización parcial).
 * 3. Retorna el `HorarioMiembroDTO` actualizado (R14.10).
 *
 * @throws {Error} "HORARIO_NO_ENCONTRADO" si el horario no existe en la org
 */
export async function editarHorario(
  horarioId: string,
  organizacionId: string,
  input: EditarHorarioInput
): Promise<HorarioMiembroDTO> {
  // 1. Buscar el horario y verificar que su membresía pertenece a la organización
  const horario = await prisma.horarioMiembro.findFirst({
    where: {
      id: horarioId,
      membresia: {
        organizacion_id: organizacionId,
      },
    },
  })

  if (!horario) {
    throw new Error("HORARIO_NO_ENCONTRADO")
  }

  // 2. Actualizar los campos proporcionados (R14.10)
  const data: {
    dia?: number
    tipo?: "normal" | "vacaciones" | "incapacidad" | "descanso"
    hora_inicio?: string | null
    hora_fin?: string | null
  } = {}

  if (input.dia !== undefined) data.dia = input.dia
  if (input.tipo !== undefined) data.tipo = input.tipo
  if ("hora_inicio" in input) data.hora_inicio = input.hora_inicio ?? null
  if ("hora_fin" in input) data.hora_fin = input.hora_fin ?? null

  const horarioActualizado = await prisma.horarioMiembro.update({
    where: { id: horarioId },
    data,
  })

  // 3. Retornar el DTO actualizado
  return toHorarioDTO(horarioActualizado)
}

/**
 * Lista todos los HorarioMiembro de la organización indicada.
 * Opcionalmente filtra por membresía.
 *
 * @param organizacionId - ID de la organización activa
 * @param membresiaId - (opcional) filtrar por membresía específica
 * @returns HorarioMiembroDTO[] de todas las membresías activas de la org (R14.6)
 */
export async function listarHorarios(
  organizacionId: string,
  membresiaId?: string
): Promise<HorarioMiembroDTO[]> {
  const horarios = await prisma.horarioMiembro.findMany({
    where: {
      membresia: {
        organizacion_id: organizacionId,
        ...(membresiaId ? { id: membresiaId } : {}),
      },
    },
    orderBy: [
      { membresia_id: "asc" },
      { dia: "asc" },
    ],
  })

  return horarios.map(toHorarioDTO)
}

/**
 * Elimina un HorarioMiembro de la organización indicada.
 *
 * Verifica que el horario pertenezca a la organización antes de eliminar.
 *
 * @throws {Error} "HORARIO_NO_ENCONTRADO" si el horario no existe en la org
 */
export async function eliminarHorario(
  horarioId: string,
  organizacionId: string
): Promise<{ ok: true }> {
  // Verificar que el horario pertenece a la organización
  const horario = await prisma.horarioMiembro.findFirst({
    where: {
      id: horarioId,
      membresia: {
        organizacion_id: organizacionId,
      },
    },
  })

  if (!horario) {
    throw new Error("HORARIO_NO_ENCONTRADO")
  }

  await prisma.horarioMiembro.delete({
    where: { id: horarioId },
  })

  return { ok: true }
}
