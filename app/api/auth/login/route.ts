/**
 * app/api/auth/login/route.ts
 * Endpoint público de inicio de sesión.
 *
 * Validates: Requirements R4.1, R4.3, R4.4, R4.8, R16.3, R16.5
 */

import { NextRequest } from "next/server"
import { withValidation } from "@/lib/api/with-validation"
import { loginSchema } from "@/lib/schemas/auth"
import { consumir, LIMITE_LOGIN } from "@/lib/auth/rate-limit"
import { verificarContrasena } from "@/lib/auth/password"
import { crearSesion, COOKIE_SESION } from "@/lib/auth/sesion"
import { vidaSesionMs } from "@/lib/auth/vigencia"
import { toUsuarioDTO } from "@/lib/api/serializadores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { prisma } from "@/lib/db"

export async function POST(req: NextRequest) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown"

  return withValidation(loginSchema, req, async (input) => {
    const { correo, contrasena } = input

    // R4.8: Rate-limit por correo y por IP
    const permitidoCorreo = consumir(
      `login:${correo}`,
      LIMITE_LOGIN.limite,
      LIMITE_LOGIN.ventanaMs
    )
    const permitidoIp = consumir(
      `login-ip:${ip}`,
      LIMITE_LOGIN.limite,
      LIMITE_LOGIN.ventanaMs
    )

    if (!permitidoCorreo || !permitidoIp) {
      return errorAuth("DEMASIADOS_INTENTOS", 429)
    }

    // Buscar usuario por correo
    const usuario = await prisma.usuario.findUnique({
      where: { correo },
    })

    // R4.3, R16.5: No revelar si el correo existe
    if (!usuario) {
      return errorAuth("CREDENCIALES_INVALIDAS", 401)
    }

    // Verificar contraseña
    const contrasenaValida = await verificarContrasena(contrasena, usuario.hash_contrasena)
    if (!contrasenaValida) {
      return errorAuth("CREDENCIALES_INVALIDAS", 401)
    }

    // R4.4: Usuario pendiente (correo no verificado)
    if (usuario.estado === "pendiente") {
      return errorAuth("CORREO_NO_VERIFICADO", 403)
    }

    // R4.1: Usuario activo → crear sesión + cookie
    const tokenSesion = await crearSesion(usuario.id)
    const maxAgeSeconds = Math.floor(vidaSesionMs() / 1000)

    const cookieValue = [
      `${COOKIE_SESION}=${tokenSesion}`,
      "HttpOnly",
      ...(process.env.NODE_ENV === "production" ? ["Secure"] : []),
      "SameSite=Lax",
      "Path=/",
      `Max-Age=${maxAgeSeconds}`,
    ].join("; ")

    const body = JSON.stringify(toUsuarioDTO(usuario))

    return new Response(body, {
      status: 200,
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Set-Cookie": cookieValue,
      },
    })
  })
}
