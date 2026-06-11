import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { toNotificacionDTO } from "@/lib/api/serializadores"
import { notifIdParamSchema } from "@/lib/schemas/notificaciones"

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/notificaciones/{id}
 * Marca una Notificacion como leída (`leida = true`).
 * - Marcar una ya leída responde 200 sin cambio observable (idempotente, R8.7).
 * - `id` inexistente ⇒ Prisma P2025 ⇒ mapPrismaError ⇒ 404 NOTIFICACION_NO_ENCONTRADA (R8.8).
 * - `id` con formato inválido ⇒ 422 VALIDACION (R8.10).
 */
export async function PATCH(_req: NextRequest, { params }: Params) {
  const { id } = await params

  const parseado = notifIdParamSchema.safeParse({ id })
  if (!parseado.success) {
    const errores = parseado.error.issues.map((issue) => ({
      campo: issue.path.join(".") || "id",
      mensaje: issue.message,
    }))
    return errorValidacion(errores)
  }

  try {
    const notificacion = await prisma.notificacion.update({
      where: { id: parseado.data.id },
      data: { leida: true },
    })
    return ok(toNotificacionDTO(notificacion))
  } catch (e) {
    return mapPrismaError(e)
  }
}
