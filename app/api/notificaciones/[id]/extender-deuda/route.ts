/**
 * app/api/notificaciones/[id]/extender-deuda/route.ts
 *
 * POST /api/notificaciones/[id]/extender-deuda
 *   Extiende el plazo de la deuda fiada asociada a la notificación dada.
 *
 *   - Resuelve el contexto multi-tenant con `resolverContexto` (Req 8.10).
 *   - Valida el body con `extenderDeudaSchema` (`nueva_fecha` coercida a Date).
 *   - Obtiene el `venta_id` desde la notificación (debe ser de tipo
 *     `vencimiento_deuda` y pertenecer a la organización activa).
 *   - Delega a `extenderDeuda(venta_id, nuevaFecha, organizacion_id)`.
 *   - Si la nueva fecha no es posterior al plazo vigente, el dominio lanza
 *     `PlazoExtensionInvalidoError` → mapeado a 422 `PLAZO_EXTENSION_INVALIDO`
 *     por `mapPrismaError` (Req 8.9).
 *
 * Requirements: 8.8, 8.9, 8.10
 * Design: § Route Handlers
 */
import type { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { extenderDeuda } from "@/lib/dominio/notificaciones"
import { ok, errorNoEncontrado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { extenderDeudaSchema } from "@/lib/schemas/deuda"
import { notifIdParamSchema } from "@/lib/schemas/notificaciones"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
): Promise<Response> {
  const { ctx, error } = await resolverContexto({ seccion: "ventas", accion: "editar" })
  if (error) return error

  const { id } = await params

  // Validar formato del id de la notificación.
  const parseadoId = notifIdParamSchema.safeParse({ id })
  if (!parseadoId.success) {
    const errores = parseadoId.error.issues.map((issue) => ({
      campo: issue.path.join(".") || "id",
      mensaje: issue.message,
    }))
    return errorValidacion(errores)
  }

  const organizacion_id = ctx.organizacionActiva!.id

  // Buscar la notificación para obtener el venta_id asociado.
  // Debe pertenecer a la organización activa y ser de tipo vencimiento_deuda (Req 8.10).
  const notificacion = await prisma.notificacion.findFirst({
    where: {
      id: parseadoId.data.id,
      organizacion_id,
      tipo: "vencimiento_deuda",
    },
    select: { id: true, venta_id: true },
  })

  if (!notificacion || !notificacion.venta_id) {
    return errorNoEncontrado("NOTIFICACION_NO_ENCONTRADA")
  }

  return withValidation(extenderDeudaSchema, req, async (input) => {
    try {
      await extenderDeuda(notificacion.venta_id!, input.nueva_fecha, organizacion_id)
      return ok({ ok: true })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
