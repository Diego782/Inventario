/**
 * app/api/notificaciones/conteo/route.ts
 * GET /api/notificaciones/conteo — devuelve el conteo de notificaciones sin leer
 * de la organización activa.
 * Respuesta: 200 { conteo: number } (entero ≥ 0).
 * Errores: BD_NO_DISPONIBLE (503) ante fallos de inicialización/conexión de Prisma.
 */
import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function GET(): Promise<Response> {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  const orgId = resultado.ctx.organizacionActiva!.id

  try {
    const conteo = await prisma.notificacion.count({
      where: { organizacion_id: orgId, leida: false },
    })
    return ok({ conteo })
  } catch (e) {
    return mapPrismaError(e)
  }
}
