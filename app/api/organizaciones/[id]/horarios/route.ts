/**
 * app/api/organizaciones/[id]/horarios/route.ts
 *
 * GET:  Lista horarios de la organización.
 *       Requiere permiso (horarios, ver).
 *       Devuelve HorarioMiembroDTO[].
 *
 * POST: Crea un horario para una membresía de la organización.
 *       Requiere permiso (horarios, crear).
 *       Valida con crearHorarioSchema. Llama crearHorario().
 *       MembresiaFueraDeOrganizacionError → 400.
 *       Éxito → 201 HorarioMiembroDTO.
 *
 * Validates: Requirements R14.1, R14.2, R14.3, R14.6
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { crearHorarioSchema } from "@/lib/schemas/horarios"
import { crearHorario, listarHorarios } from "@/lib/dominio/horarios"
import { MembresiaFueraDeOrganizacionError } from "@/lib/dominio/errores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok, creado } from "@/lib/api/respuestas"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/organizaciones/{id}/horarios
 * Lista todos los horarios de la organización activa.
 * Requiere permiso (horarios, ver).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "horarios", accion: "ver" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el ID en la URL coincida con la organización activa
  if (!ctx.organizacionActiva || ctx.organizacionActiva.id !== id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  const horarios = await listarHorarios(id)

  return ok(horarios)
}

/**
 * POST /api/organizaciones/{id}/horarios
 * Crea un nuevo horario para una membresía de la organización activa.
 * Requiere permiso (horarios, crear).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "horarios", accion: "crear" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el ID en la URL coincida con la organización activa
  if (!ctx.organizacionActiva || ctx.organizacionActiva.id !== id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  return withValidation(crearHorarioSchema, req, async (input) => {
    try {
      const horario = await crearHorario(id, input)
      return creado(horario)
    } catch (error) {
      // R14.3: membresía no pertenece a la organización → 400
      if (error instanceof MembresiaFueraDeOrganizacionError) {
        return errorAuth("MEMBRESIA_FUERA_DE_ORGANIZACION", 400)
      }
      throw error
    }
  })
}
