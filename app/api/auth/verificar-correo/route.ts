/**
 * app/api/auth/verificar-correo/route.ts
 * Endpoint público de verificación de correo electrónico.
 *
 * Validates: Requirements R3.4, R3.5, R3.6
 */

import { NextRequest } from "next/server"
import { withValidation } from "@/lib/api/with-validation"
import { verificarCorreoSchema } from "@/lib/schemas/auth"
import { verificarCorreo } from "@/lib/dominio/usuarios"
import { TokenInvalidoError } from "@/lib/dominio/errores-auth"
import { ok } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"

export async function POST(req: NextRequest) {
  return withValidation(verificarCorreoSchema, req, async (input) => {
    try {
      await verificarCorreo(input.token)
      return ok({ ok: true })
    } catch (error) {
      if (error instanceof TokenInvalidoError) {
        return errorAuth("TOKEN_INVALIDO", 400)
      }
      return errorAuth("ERROR_INTERNO", 500)
    }
  })
}
