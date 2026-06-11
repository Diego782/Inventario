/**
 * app/api/organizaciones/[id]/route.ts
 * PATCH: actualiza el nombre, logo y proporción de logo de una organización.
 *
 * Requiere sesión con la organización indicada como activa y permiso
 * (configuracion, administrar). Solo permite editar la organización activa
 * del contexto para respetar el aislamiento multi-inquilino.
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { actualizarOrganizacionSchema } from "@/lib/schemas/organizaciones"
import { toOrganizacionDTO } from "@/lib/api/serializadores-auth"
import { ok, errorNoEncontrado } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { mapPrismaError } from "@/lib/api/errores"

type Params = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "configuracion", accion: "administrar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  // Solo se puede editar la organización activa del contexto (aislamiento tenant)
  if (id !== ctx.organizacionActiva!.id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  return withValidation(actualizarOrganizacionSchema, req, async (input) => {
    try {
      const existente = await prisma.organizacion.findUnique({ where: { id } })
      if (!existente) {
        return errorNoEncontrado("NO_ENCONTRADO", "Organización no encontrada.")
      }

      const org = await prisma.organizacion.update({
        where: { id },
        data: {
          ...(input.nombre !== undefined && { nombre: input.nombre }),
          ...(input.logo !== undefined && { logo: input.logo }),
          ...(input.logo_aspecto !== undefined && { logo_aspecto: input.logo_aspecto }),
        },
      })

      return ok(toOrganizacionDTO(org))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
