/**
 * app/api/roles/[id]/route.ts
 *
 * PATCH: Edita un rol existente.
 *        Requiere permiso (usuarios, administrar).
 *        Valida con editarRolSchema.
 *        Llama editarRol(id, orgId, input).
 *        RolPropietarioProtegidoError → 403 ROL_PROPIETARIO_PROTEGIDO.
 *        Éxito → 200 RolDTO.
 *
 * DELETE: Elimina un rol.
 *         Requiere permiso (usuarios, administrar).
 *         Llama eliminarRol(id, orgId).
 *         RolPropietarioProtegidoError → 403 ROL_PROPIETARIO_PROTEGIDO.
 *         PropietarioRequeridoError → 409 PROPIETARIO_REQUERIDO.
 *         Éxito → 200 { ok: true }.
 *
 * Validates: Requirements R11.5, R11.6, R11.7
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { editarRolSchema } from "@/lib/schemas/roles"
import { editarRol, eliminarRol } from "@/lib/dominio/roles"
import {
  RolPropietarioProtegidoError,
  PropietarioRequeridoError,
} from "@/lib/dominio/errores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"
import { Prisma } from "@prisma/client"

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/roles/{id}
 * Edita el nombre y/o los permisos de un rol.
 * Requiere permiso (usuarios, administrar).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  // Guard: requiere permiso (usuarios, administrar)
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  return withValidation(editarRolSchema, req, async (input) => {
    try {
      const rolDTO = await editarRol(id, ctx.organizacionActiva.id, input)
      return ok(rolDTO)
    } catch (error) {
      // R11.6: Proteger el Rol_Propietario → 403
      if (error instanceof RolPropietarioProtegidoError) {
        return errorAuth("ROL_PROPIETARIO_PROTEGIDO", 403)
      }
      // Rol no encontrado en la organización
      if (error instanceof Error && error.message === "ROL_NO_ENCONTRADO") {
        return errorAuth("ROL_NO_ENCONTRADO", 404)
      }
      // Nombre duplicado en la organización (Prisma unique constraint)
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2002"
      ) {
        return errorAuth("ROL_INVALIDO", 400)
      }
      return errorAuth("ERROR_INTERNO", 500)
    }
  })
}

/**
 * DELETE /api/roles/{id}
 * Elimina un rol de la organización activa.
 * Requiere permiso (usuarios, administrar).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  // Guard: requiere permiso (usuarios, administrar)
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  try {
    await eliminarRol(id, ctx.organizacionActiva.id)
    return ok({ ok: true })
  } catch (error) {
    // R11.6: Proteger el Rol_Propietario → 403
    if (error instanceof RolPropietarioProtegidoError) {
      return errorAuth("ROL_PROPIETARIO_PROTEGIDO", 403)
    }
    // R11.7: Dejaría la org sin propietario → 409
    if (error instanceof PropietarioRequeridoError) {
      return errorAuth("PROPIETARIO_REQUERIDO", 409)
    }
    // Rol no encontrado en la organización
    if (error instanceof Error && error.message === "ROL_NO_ENCONTRADO") {
      return errorAuth("ROL_NO_ENCONTRADO", 404)
    }
    return errorAuth("ERROR_INTERNO", 500)
  }
}
