/**
 * app/api/auth/reenviar-verificacion/route.ts
 * Endpoint público para reenviar el correo de verificación.
 *
 * Validates: Requirements R3.8, R3.9, R3.10
 *
 * - Rate-limit por correo: 5 solicitudes/hora (R3.10)
 * - Respuesta uniforme 200 { ok: true } para no revelar existencia (R3.8)
 * - La 6.ª solicitud en una hora retorna 429 LIMITE_REENVIO_EXCEDIDO
 */

import { NextRequest } from "next/server"
import { withValidation } from "@/lib/api/with-validation"
import { reenviarVerificacionSchema } from "@/lib/schemas/auth"
import { reenviarVerificacion } from "@/lib/dominio/usuarios"
import { consumir, LIMITE_REENVIO } from "@/lib/auth/rate-limit"
import { ok } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"

export async function POST(req: NextRequest) {
  return withValidation(reenviarVerificacionSchema, req, async (input) => {
    const correoNormalizado = input.correo.toLowerCase().trim()

    // R3.10: Rate-limit por correo (5/hora)
    const permitido = consumir(
      `reenvio:${correoNormalizado}`,
      LIMITE_REENVIO.limite,
      LIMITE_REENVIO.ventanaMs
    )

    if (!permitido) {
      return errorAuth("LIMITE_REENVIO_EXCEDIDO", 429)
    }

    try {
      await reenviarVerificacion(correoNormalizado)
    } catch {
      // Silenciar errores para no revelar existencia
    }

    // Siempre responder 200 { ok: true } (respuesta uniforme)
    return ok({ ok: true })
  })
}
