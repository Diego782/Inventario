/**
 * app/api/auth/logout/route.ts
 * Endpoint de cierre de sesión. Idempotente: siempre retorna 200.
 *
 * Validates: Requirements R4.5
 */

import { cookies } from "next/headers"
import { COOKIE_SESION, invalidarSesionPorCookie } from "@/lib/auth/sesion"
import { ok } from "@/lib/api/respuestas"

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_SESION)?.value

  // Invalidar sesión en BD si existe cookie
  if (token) {
    await invalidarSesionPorCookie(token)
  }

  // Borrar la cookie (Max-Age=0)
  cookieStore.set(COOKIE_SESION, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  })

  // Siempre 200 (idempotente)
  return ok({ ok: true })
}
