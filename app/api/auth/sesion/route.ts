/**
 * app/api/auth/sesion/route.ts
 * Endpoint para consultar la sesión actual del usuario.
 *
 * Validates: Requirements R4.6, R4.7
 */

import { leerSesion } from "@/lib/auth/sesion"
import { ok } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"

export async function GET() {
  const sesion = await leerSesion()

  if (!sesion) {
    // R4.7: Sin sesión o expirada → 401 SESION_INVALIDA
    return errorAuth("SESION_INVALIDA", 401)
  }

  // R4.6: Sesión válida → 200 con UsuarioDTO
  return ok(sesion.usuario)
}
