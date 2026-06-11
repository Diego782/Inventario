/**
 * app/api/organizaciones/[id]/invitaciones/route.ts
 *
 * POST: Crea (o regenera) una invitación para la organización.
 *       Requiere permiso (usuarios, administrar).
 *       Valida con invitarSchema. Llama invitar().
 *       MiembroExistenteError → 409, RolFueraDeOrganizacionError → 400.
 *       Nueva invitación → 201 InvitacionDTO; regenerada → 200 InvitacionDTO.
 *
 * GET:  Lista invitaciones de la organización.
 *       Requiere permiso (usuarios, ver).
 *       Devuelve InvitacionDTO[].
 *
 * Validates: Requirements R9.1, R9.2, R9.5, R9.7, R9.8, R9.9
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { invitarSchema } from "@/lib/schemas/invitaciones"
import { invitar } from "@/lib/dominio/invitaciones"
import { MiembroExistenteError, RolFueraDeOrganizacionError } from "@/lib/dominio/errores-auth"
import { toInvitacionDTO } from "@/lib/api/serializadores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok, creado } from "@/lib/api/respuestas"
import { prisma } from "@/lib/db"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/organizaciones/{id}/invitaciones
 * Lista todas las invitaciones de la organización.
 * Requiere permiso (usuarios, ver).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "ver" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el ID en la URL coincida con la organización activa
  if (!ctx.organizacionActiva || ctx.organizacionActiva.id !== id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  const invitaciones = await prisma.invitacion.findMany({
    where: { organizacion_id: id },
    include: { rol: true },
    orderBy: { creado_en: "desc" },
  })

  return ok(invitaciones.map(toInvitacionDTO))
}

/**
 * POST /api/organizaciones/{id}/invitaciones
 * Crea o regenera una invitación para la organización.
 * Requiere permiso (usuarios, administrar).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el ID en la URL coincida con la organización activa
  if (!ctx.organizacionActiva || ctx.organizacionActiva.id !== id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  return withValidation(invitarSchema, req, async (input) => {
    // Determinar si ya existía una invitación pendiente antes de llamar a invitar()
    const invitacionPrevia = await prisma.invitacion.findFirst({
      where: {
        organizacion_id: id,
        correo: input.correo,
        estado: "pendiente",
      },
    })

    try {
      const resultado = await invitar(
        id,
        input.correo,
        input.rol_id,
        ctx.usuarioActual.id,
        input.nombre
      )

      // Obtener la invitación con el rol incluido para serializar
      const invitacionConRol = await prisma.invitacion.findUniqueOrThrow({
        where: { id: resultado.id },
        include: { rol: true },
      })

      const dto = toInvitacionDTO(invitacionConRol)

      // R9.6: Si ya existía invitación pendiente → 200 (regenerada); si es nueva → 201
      if (invitacionPrevia) {
        return ok(dto)
      }
      return creado(dto)
    } catch (error) {
      // R9.5: Correo ya es miembro activo → 409
      if (error instanceof MiembroExistenteError) {
        return errorAuth("MIEMBRO_EXISTENTE", 409)
      }
      // R9.9: rol_id no pertenece a la organización → 400
      if (error instanceof RolFueraDeOrganizacionError) {
        return errorAuth("ROL_FUERA_DE_ORGANIZACION", 400)
      }
      throw error
    }
  })
}
