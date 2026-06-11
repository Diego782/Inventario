/**
 * app/api/membresias/[id]/route.ts
 *
 * PATCH:  Asigna un nuevo rol a una membresía existente.
 *         Requiere permiso (usuarios, administrar).
 *         Valida con asignarRolSchema ({ rol_id: uuid }).
 *         Llama asignarRol(id, input.rol_id, ctx.organizacionActiva.id).
 *         RolFueraDeOrganizacionError → 400 ROL_FUERA_DE_ORGANIZACION (R11.9).
 *         PropietarioRequeridoError   → 409 PROPIETARIO_REQUERIDO (R11.7).
 *         MEMBRESIA_NO_ENCONTRADA     → 404 MEMBRESIA_NO_ENCONTRADA.
 *         Éxito → 200 MiembroDTO (R11.8).
 *
 * DELETE: Elimina una membresía de la organización activa.
 *         Requiere permiso (usuarios, administrar).
 *         PropietarioRequeridoError → 409 PROPIETARIO_REQUERIDO (R11.7).
 *         Éxito → 200 { ok: true }.
 *
 * Validates: Requirements R11.7, R11.8, R11.9
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { asignarRolSchema } from "@/lib/schemas/roles"
import { asignarRol, eliminarMembresia } from "@/lib/dominio/membresias"
import {
  RolFueraDeOrganizacionError,
  RolPropietarioProtegidoError,
} from "@/lib/dominio/errores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/membresias/{id}
 * Asigna un nuevo rol a la membresía indicada dentro de la organización activa.
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

  return withValidation(asignarRolSchema, req, async (input) => {
    try {
      const miembroDTO = await asignarRol(id, input.rol_id, ctx.organizacionActiva.id)
      return ok(miembroDTO)
    } catch (error) {
      if (error instanceof RolPropietarioProtegidoError) {
        return errorAuth("ROL_PROPIETARIO_PROTEGIDO", 403)
      }
      if (error instanceof RolFueraDeOrganizacionError) {
        return errorAuth("ROL_FUERA_DE_ORGANIZACION", 400)
      }
      if (error instanceof Error && error.message === "MEMBRESIA_NO_ENCONTRADA") {
        return errorAuth("MEMBRESIA_NO_ENCONTRADA", 404)
      }
      return errorAuth("ERROR_INTERNO", 500)
    }
  })
}

/**
 * DELETE /api/membresias/{id}
 * Elimina la membresía indicada dentro de la organización activa.
 * Requiere permiso (usuarios, administrar).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  try {
    await eliminarMembresia(id, ctx.organizacionActiva.id)
    return ok({ ok: true })
  } catch (error) {
    if (error instanceof RolPropietarioProtegidoError) {
      return errorAuth("ROL_PROPIETARIO_PROTEGIDO", 403)
    }
    if (error instanceof Error && error.message === "MEMBRESIA_NO_ENCONTRADA") {
      return errorAuth("MEMBRESIA_NO_ENCONTRADA", 404)
    }
    return errorAuth("ERROR_INTERNO", 500)
  }
}
