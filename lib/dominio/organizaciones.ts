/**
 * lib/dominio/organizaciones.ts
 * Lógica de dominio para creación de organizaciones.
 * Validates: Requirements R8.1, R8.2, R8.3, R8.5
 */

import { prisma } from "@/lib/db"
import { slugUnico } from "@/lib/auth/slug"
import { PERMISOS_PROPIETARIO } from "@/lib/auth/permisos"
import { OrganizacionFallidaError } from "@/lib/dominio/errores-auth"

export interface ResultadoCrearOrganizacion {
  id: string
  nombre: string
  slug: string
  creado_por: string
  creado_en: Date
}

/**
 * Crea una organización con su Rol_Propietario y membresía del creador
 * dentro de una única transacción.
 *
 * - Genera slug único derivado del nombre (R8.4)
 * - Crea la Organizacion (R8.1)
 * - Crea el Rol_Propietario con es_sistema=true y todos los permisos (R8.2)
 * - Crea permisos_rol para las 40 combinaciones seccion×accion (R8.2)
 * - Crea la Membresia activa del creador con el Rol_Propietario (R8.2, R8.3)
 * - Ante cualquier fallo, rollback y lanza OrganizacionFallidaError (R8.5)
 */
export async function crearOrganizacion(
  usuarioActual: { id: string },
  nombre: string
): Promise<ResultadoCrearOrganizacion> {
  try {
    const organizacion = await prisma.$transaction(async (tx) => {
      // Generar slug único
      const slug = await slugUnico(tx, nombre)

      // Crear la organización
      const org = await tx.organizacion.create({
        data: {
          nombre,
          slug,
          creado_por: usuarioActual.id,
        },
      })

      // Crear Rol_Propietario (es_sistema=true)
      const rolPropietario = await tx.rol.create({
        data: {
          organizacion_id: org.id,
          nombre: "Propietario",
          es_sistema: true,
        },
      })

      // Crear todos los permisos_rol (40 = 8 secciones × 5 acciones)
      await tx.permisoRol.createMany({
        data: PERMISOS_PROPIETARIO.map((p) => ({
          rol_id: rolPropietario.id,
          seccion: p.seccion,
          accion: p.accion,
        })),
      })

      // Crear membresía activa del creador con el Rol_Propietario
      await tx.membresia.create({
        data: {
          usuario_id: usuarioActual.id,
          organizacion_id: org.id,
          rol_id: rolPropietario.id,
          estado: "activa",
        },
      })

      return org
    })

    return {
      id: organizacion.id,
      nombre: organizacion.nombre,
      slug: organizacion.slug,
      creado_por: organizacion.creado_por,
      creado_en: organizacion.creado_en,
    }
  } catch (error) {
    if (error instanceof OrganizacionFallidaError) {
      throw error
    }
    throw new OrganizacionFallidaError()
  }
}
