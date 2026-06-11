/**
 * app/api/auth/registro/route.ts
 * Endpoint público de registro de usuario con rate-limit por IP.
 *
 * Validates: Requirements R2.1, R2.3, R2.4, R2.6, R2.10, R15.1, R16.3
 */

import { NextRequest } from "next/server"
import { withValidation } from "@/lib/api/with-validation"
import { registroSchema } from "@/lib/schemas/auth"
import { registrarUsuario } from "@/lib/dominio/usuarios"
import { CorreoDuplicadoError } from "@/lib/dominio/errores-auth"
import { ErrorEnvioCorreo } from "@/lib/correo/errores"
import { ErrorAppUrl } from "@/lib/correo/errores"
import { consumir, LIMITE_LOGIN } from "@/lib/auth/rate-limit"
import { creado } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"

export async function POST(req: NextRequest) {
  // R16.3: Rate-limit por IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"
  const permitido = consumir(
    `registro-ip:${ip}`,
    LIMITE_LOGIN.limite,
    LIMITE_LOGIN.ventanaMs
  )

  if (!permitido) {
    return errorAuth("DEMASIADOS_INTENTOS", 429)
  }

  return withValidation(registroSchema, req, async (input) => {
    try {
      const resultado = await registrarUsuario(input)

      // R2.6: Responder con UsuarioDTO (sin hash_contrasena)
      return creado({
        id: resultado.usuario.id,
        correo: resultado.usuario.correo,
        nombre: resultado.usuario.nombre,
        correo_verificado: resultado.usuario.correo_verificado,
        estado: resultado.usuario.estado,
        creado_en: resultado.usuario.creado_en.toISOString(),
      })
    } catch (error) {
      // R2.10: Correo duplicado → 409
      if (error instanceof CorreoDuplicadoError) {
        return errorAuth("CORREO_DUPLICADO", 409)
      }

      // R6.6: APP_URL no configurada → 500
      if (error instanceof ErrorAppUrl) {
        return errorAuth("APP_URL_NO_CONFIGURADA", 500)
      }

      // R6.4: Envío de correo fallido → 502
      if (error instanceof ErrorEnvioCorreo) {
        return errorAuth("ENVIO_CORREO_FALLIDO", 502)
      }

      // Error inesperado — log para diagnóstico
      console.error("[registro] Error inesperado:", error)
      return errorAuth("ERROR_INTERNO", 500)
    }
  })
}
