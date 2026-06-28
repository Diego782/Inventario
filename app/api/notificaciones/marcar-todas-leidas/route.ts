import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

/**
 * POST /api/notificaciones/marcar-todas-leidas
 * Marca como leídas todas las notificaciones no leídas de la organización activa.
 */
export async function POST() {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  const orgId = resultado.ctx.organizacionActiva!.id

  try {
    const { count } = await prisma.notificacion.updateMany({
      where: { organizacion_id: orgId, leida: false },
      data: { leida: true },
    })
    return ok({ actualizadas: count })
  } catch (e) {
    return mapPrismaError(e)
  }
}
