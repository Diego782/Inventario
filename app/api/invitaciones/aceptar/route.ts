/**
 * app/api/invitaciones/aceptar/route.ts
 * Endpoint para aceptar una invitación pendiente.
 *
 * Validates: Requirements R10.2, R10.3, R10.4, R10.7
 *
 * - Requiere sesión activa (solo-sesion) → 401 NO_AUTENTICADO si no hay sesión
 * - Valida body con aceptarInvitacionSchema
 * - Llama aceptarInvitacion(token, usuarioActual)
 * - InvitacionInvalidaError → 400 INVITACION_INVALIDA
 * - InvitacionOtroCorreoError → 403 INVITACION_OTRO_CORREO
 * - Éxito → 200 { ok: true }
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { aceptarInvitacionSchema } from "@/lib/schemas/invitaciones"
import { aceptarInvitacion } from "@/lib/dominio/invitaciones"
import {
  InvitacionInvalidaError,
  InvitacionOtroCorreoError,
} from "@/lib/dominio/errores-auth"
import { ok } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"

export async function POST(req: NextRequest) {
  // R10.2: Requiere sesión activa
  const resultado = await resolverContexto("solo-sesion")
  if (resultado.error) {
    return resultado.error
  }
  const { ctx } = resultado

  return withValidation(aceptarInvitacionSchema, req, async (input) => {
    try {
      await aceptarInvitacion(input.token, {
        id: ctx.usuarioActual.id,
        correo: ctx.usuarioActual.correo,
      })
      // R10.2, R10.3: Éxito → 200 { ok: true }
      return ok({ ok: true })
    } catch (err) {
      if (err instanceof InvitacionInvalidaError) {
        // R10.4, R10.5: Token inválido, expirado o revocado → 400
        return errorAuth("INVITACION_INVALIDA", 400)
      }
      if (err instanceof InvitacionOtroCorreoError) {
        // R10.7: Correo no coincide → 403
        return errorAuth("INVITACION_OTRO_CORREO", 403)
      }
      throw err
    }
  })
}
