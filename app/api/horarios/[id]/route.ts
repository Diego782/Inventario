/**
 * app/api/horarios/[id]/route.ts
 *
 * PATCH: Edita un horario existente.
 *        Requiere permiso (horarios, editar).
 *        Valida con editarHorarioSchema.
 *        Llama editarHorario(id, ctx.organizacionActiva.id, input).
 *        HORARIO_NO_ENCONTRADO → 404.
 *        Éxito → 200 HorarioMiembroDTO.
 *
 * DELETE: Elimina un horario.
 *         Requiere permiso (horarios, eliminar).
 *         Llama eliminarHorario(id, ctx.organizacionActiva.id).
 *         HORARIO_NO_ENCONTRADO → 404.
 *         Éxito → 200 { ok: true }.
 *
 * Validates: Requirements R14.10, R14.11
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { editarHorarioSchema } from "@/lib/schemas/horarios"
import { editarHorario, eliminarHorario } from "@/lib/dominio/horarios"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/horarios/{id}
 * Edita los campos de un horario de la organización activa.
 * Requiere permiso (horarios, editar).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  // Guard: requiere permiso (horarios, editar)
  const resultado = await resolverContexto({ seccion: "horarios", accion: "editar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  return withValidation(editarHorarioSchema, req, async (input) => {
    try {
      const horarioDTO = await editarHorario(id, ctx.organizacionActiva.id, input)
      return ok(horarioDTO)
    } catch (error) {
      if (error instanceof Error && error.message === "HORARIO_NO_ENCONTRADO") {
        return errorAuth("HORARIO_NO_ENCONTRADO", 404)
      }
      return errorAuth("ERROR_INTERNO", 500)
    }
  })
}

/**
 * DELETE /api/horarios/{id}
 * Elimina un horario de la organización activa.
 * Requiere permiso (horarios, eliminar).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  // Guard: requiere permiso (horarios, eliminar)
  const resultado = await resolverContexto({ seccion: "horarios", accion: "eliminar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  try {
    await eliminarHorario(id, ctx.organizacionActiva.id)
    return ok({ ok: true })
  } catch (error) {
    if (error instanceof Error && error.message === "HORARIO_NO_ENCONTRADO") {
      return errorAuth("HORARIO_NO_ENCONTRADO", 404)
    }
    return errorAuth("ERROR_INTERNO", 500)
  }
}
