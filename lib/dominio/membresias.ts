/**
 * lib/dominio/membresias.ts
 * Lógica de dominio para gestionar membresías de una organización.
 * Validates: Requirements R11.7, R11.8, R11.9
 */

import { prisma } from "@/lib/db"
import { toMiembroDTO, type MiembroDTO } from "@/lib/api/serializadores-auth"
import {
  RolFueraDeOrganizacionError,
  RolPropietarioProtegidoError,
} from "@/lib/dominio/errores-auth"

/**
 * Asigna un nuevo rol a una membresía existente.
 *
 * Reglas:
 * - No se puede asignar el Rol_Propietario (es_sistema=true) a nadie → RolPropietarioProtegidoError.
 * - No se puede cambiar el rol del propietario actual → RolPropietarioProtegidoError.
 * - El rol debe pertenecer a la organización → RolFueraDeOrganizacionError (R11.9).
 *
 * @throws {Error} "MEMBRESIA_NO_ENCONTRADA" si la membresía no existe en la org
 * @throws {RolFueraDeOrganizacionError} si el nuevo rol no pertenece a la org
 * @throws {RolPropietarioProtegidoError} si se intenta tocar el rol propietario
 */
export async function asignarRol(
  membresiaId: string,
  nuevoRolId: string,
  organizacionId: string
): Promise<MiembroDTO> {
  // 1. Buscar la membresía y verificar que pertenece a la organización
  const membresia = await prisma.membresia.findFirst({
    where: {
      id: membresiaId,
      organizacion_id: organizacionId,
    },
    include: {
      usuario: true,
      rol: true,
    },
  })

  if (!membresia) {
    throw new Error("MEMBRESIA_NO_ENCONTRADA")
  }

  // 2. No se puede cambiar el rol del propietario
  if (membresia.rol.es_sistema) {
    throw new RolPropietarioProtegidoError()
  }

  // 3. Buscar el nuevo rol y verificar que pertenece a la organización (R11.9)
  const nuevoRol = await prisma.rol.findFirst({
    where: {
      id: nuevoRolId,
      organizacion_id: organizacionId,
    },
  })

  if (!nuevoRol) {
    throw new RolFueraDeOrganizacionError()
  }

  // 4. No se puede asignar el rol Propietario a nadie
  if (nuevoRol.es_sistema) {
    throw new RolPropietarioProtegidoError()
  }

  // 5. Actualizar el rol de la membresía
  const membresiaActualizada = await prisma.membresia.update({
    where: { id: membresiaId },
    data: { rol_id: nuevoRolId },
    include: {
      usuario: true,
      rol: true,
    },
  })

  // 6. Retornar el MiembroDTO actualizado
  return toMiembroDTO(membresiaActualizada)
}

/**
 * Elimina una membresía de la organización.
 *
 * El propietario (es_sistema=true) no puede ser eliminado nunca.
 *
 * @throws {Error} "MEMBRESIA_NO_ENCONTRADA" si no existe en la org
 * @throws {RolPropietarioProtegidoError} si se intenta eliminar al propietario
 */
export async function eliminarMembresia(
  membresiaId: string,
  organizacionId: string
): Promise<void> {
  const membresia = await prisma.membresia.findFirst({
    where: {
      id: membresiaId,
      organizacion_id: organizacionId,
    },
    include: { rol: true },
  })

  if (!membresia) {
    throw new Error("MEMBRESIA_NO_ENCONTRADA")
  }

  // El propietario no se puede eliminar
  if (membresia.rol.es_sistema) {
    throw new RolPropietarioProtegidoError()
  }

  await prisma.membresia.delete({ where: { id: membresiaId } })
}
