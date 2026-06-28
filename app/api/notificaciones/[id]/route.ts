import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, errorValidacion, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { toNotificacionDTO } from "@/lib/api/serializadores"
import { notifIdParamSchema } from "@/lib/schemas/notificaciones"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/notificaciones/{id}
 * Marca una Notificacion como leída (`leida = true`), restringida a la
 * organización activa.
 * - Marcar una ya leída responde 200 sin cambio observable (idempotente, R8.7).
 * - `id` inexistente o de otra organización ⇒ 404 NOTIFICACION_NO_ENCONTRADA (R8.8).
 * - `id` con formato inválido ⇒ 422 VALIDACION (R8.10).
 */
export async function PATCH(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  const { id } = await params

  const parseado = notifIdParamSchema.safeParse({ id })
  if (!parseado.success) {
    const errores = parseado.error.issues.map((issue) => ({
      campo: issue.path.join(".") || "id",
      mensaje: issue.message,
    }))
    return errorValidacion(errores)
  }

  const orgId = resultado.ctx.organizacionActiva!.id

  try {
    // Verificar que la notificación pertenezca a la organización activa
    const existente = await prisma.notificacion.findFirst({
      where: { id: parseado.data.id, organizacion_id: orgId },
      select: { id: true },
    })
    if (!existente) {
      return errorNoEncontrado("NOTIFICACION_NO_ENCONTRADA")
    }

    const notificacion = await prisma.notificacion.update({
      where: { id: parseado.data.id },
      data: { leida: true },
    })
    return ok(toNotificacionDTO(notificacion))
  } catch (e) {
    return mapPrismaError(e)
  }
}
