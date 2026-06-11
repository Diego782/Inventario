/**
 * app/api/permisos/route.ts
 * GET /api/permisos
 * Devuelve los permisos del Usuario_Actual en la Organizacion_Activa.
 *
 * Validates: Requirements R12.1, R12.3
 */

import { leerSesion } from "@/lib/auth/sesion"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"
import { prisma } from "@/lib/db"
import type { Permiso } from "@/lib/auth/permisos"
import type { Seccion, Accion } from "@/lib/auth/secciones"

/**
 * GET /api/permisos
 * Requiere sesión válida. Si no hay organización activa devuelve permisos vacíos.
 * Si hay organización activa, devuelve los permisos del rol del usuario en ella.
 */
export async function GET(): Promise<Response> {
  // 1. Resolver sesión
  const sesion = await leerSesion()

  if (!sesion) {
    return errorAuth("NO_AUTENTICADO", 401)
  }

  // 2. Sin organización activa → permisos vacíos
  const orgId = sesion.sesion.organizacion_activa_id
  if (!orgId) {
    return ok({ permisos: [] })
  }

  // 3. Consultar membresía activa con rol y permisos
  const membresia = await prisma.membresia.findUnique({
    where: {
      usuario_id_organizacion_id: {
        usuario_id: sesion.usuario.id,
        organizacion_id: orgId,
      },
    },
    include: {
      rol: {
        include: { permisos: true },
      },
    },
  })

  if (!membresia || membresia.estado !== "activa") {
    return ok({ permisos: [] })
  }

  // 4. Mapear a { seccion, accion }[]
  const permisos: Permiso[] = membresia.rol.permisos.map((p) => ({
    seccion: p.seccion as Seccion,
    accion: p.accion as Accion,
  }))

  // 5. Devolver 200 { permisos: [...] }
  return ok({ permisos })
}
