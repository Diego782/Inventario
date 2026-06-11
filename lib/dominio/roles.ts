/**
 * lib/dominio/roles.ts
 * Lógica de dominio para crear, editar y eliminar roles de una organización.
 * Validates: Requirements R11.3, R11.5, R11.6, R11.7
 */

import { prisma } from "@/lib/db"
import { toRolDTO, type RolDTO } from "@/lib/api/serializadores-auth"
import {
  RolPropietarioProtegidoError,
  PropietarioRequeridoError,
} from "@/lib/dominio/errores-auth"

export interface InputCrearRol {
  nombre: string
  permisos?: Array<{ seccion: string; accion: string }>
}

export interface InputEditarRol {
  nombre?: string
  permisos?: Array<{ seccion: string; accion: string }>
}

/**
 * Crea un nuevo rol no-sistema para la organización indicada.
 *
 * - El nombre debe ser único dentro de la organización (R11.3).
 * - Si se proporcionan permisos, se crean los registros en permisos_rol.
 * - Retorna el RolDTO creado.
 *
 * @throws {Prisma.PrismaClientKnownRequestError} si el nombre ya existe en la org (P2002)
 */
export async function crearRol(
  organizacionId: string,
  input: InputCrearRol
): Promise<RolDTO> {
  const rol = await prisma.rol.create({
    data: {
      organizacion_id: organizacionId,
      nombre: input.nombre.trim(),
      es_sistema: false,
      permisos: input.permisos?.length
        ? {
            createMany: {
              data: input.permisos.map((p) => ({
                seccion: p.seccion,
                accion: p.accion,
              })),
              skipDuplicates: true,
            },
          }
        : undefined,
    },
    include: {
      permisos: true,
    },
  })

  return toRolDTO(rol)
}

/**
 * Edita el nombre y/o los permisos de un rol existente.
 *
 * - Verifica que el rol pertenezca a la organización indicada.
 * - Si el rol tiene es_sistema=true → lanza RolPropietarioProtegidoError (R11.6).
 * - Si se proporcionan permisos, elimina todos los existentes y los recrea (R11.5).
 * - Retorna el RolDTO actualizado.
 */
export async function editarRol(
  rolId: string,
  organizacionId: string,
  input: InputEditarRol
): Promise<RolDTO> {
  // Buscar el rol y verificar que pertenece a la organización
  const rol = await prisma.rol.findFirst({
    where: {
      id: rolId,
      organizacion_id: organizacionId,
    },
    include: { permisos: true },
  })

  if (!rol) {
    throw new Error("ROL_NO_ENCONTRADO")
  }

  // R11.6: Proteger el Rol_Propietario (es_sistema=true)
  if (rol.es_sistema) {
    throw new RolPropietarioProtegidoError()
  }

  // Construir datos de actualización
  const data: {
    nombre?: string
    permisos?: {
      deleteMany: Record<string, never>
      createMany: {
        data: Array<{ seccion: string; accion: string }>
        skipDuplicates: boolean
      }
    }
  } = {}

  if (input.nombre !== undefined) {
    data.nombre = input.nombre.trim()
  }

  if (input.permisos !== undefined) {
    // Eliminar todos los permisos existentes y recrear los nuevos
    data.permisos = {
      deleteMany: {},
      createMany: {
        data: input.permisos.map((p) => ({
          seccion: p.seccion,
          accion: p.accion,
        })),
        skipDuplicates: true,
      },
    }
  }

  const rolActualizado = await prisma.rol.update({
    where: { id: rolId },
    data,
    include: { permisos: true },
  })

  return toRolDTO(rolActualizado)
}

/**
 * Elimina un rol de la organización.
 *
 * - Verifica que el rol pertenezca a la organización indicada.
 * - Si el rol tiene es_sistema=true → lanza RolPropietarioProtegidoError (R11.6).
 * - Si eliminar el rol dejaría algún miembro sin propietario → lanza PropietarioRequeridoError (R11.7).
 *   (Esto ocurre cuando hay membresías activas asignadas a este rol y no existe otro
 *    Rol_Propietario en la organización que cubra a esos miembros.)
 * - Elimina el rol (cascade elimina permisos_rol).
 * - Retorna { ok: true }.
 */
export async function eliminarRol(
  rolId: string,
  organizacionId: string
): Promise<{ ok: true }> {
  // Buscar el rol y verificar que pertenece a la organización
  const rol = await prisma.rol.findFirst({
    where: {
      id: rolId,
      organizacion_id: organizacionId,
    },
  })

  if (!rol) {
    throw new Error("ROL_NO_ENCONTRADO")
  }

  // R11.6: Proteger el Rol_Propietario (es_sistema=true)
  if (rol.es_sistema) {
    throw new RolPropietarioProtegidoError()
  }

  // R11.7: Verificar que eliminar este rol no deje miembros sin propietario.
  // Un miembro queda "sin propietario" si tiene este rol asignado y no existe
  // ningún otro miembro activo con el Rol_Propietario (es_sistema=true) en la org.
  const membresiasCubiertas = await prisma.membresia.count({
    where: {
      rol_id: rolId,
      organizacion_id: organizacionId,
      estado: "activa",
    },
  })

  if (membresiasCubiertas > 0) {
    // Hay miembros activos con este rol. Verificar si existe al menos un
    // Rol_Propietario activo en la organización (distinto al que se elimina).
    const propietariosActivos = await prisma.membresia.count({
      where: {
        organizacion_id: organizacionId,
        estado: "activa",
        rol: {
          es_sistema: true,
        },
        // Excluir membresías del rol que se va a eliminar
        NOT: {
          rol_id: rolId,
        },
      },
    })

    if (propietariosActivos === 0) {
      // Eliminar este rol dejaría la org sin ningún propietario activo
      throw new PropietarioRequeridoError()
    }
  }

  // Eliminar el rol (cascade elimina permisos_rol por la relación onDelete: Cascade)
  await prisma.rol.delete({
    where: { id: rolId },
  })

  return { ok: true }
}
