import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { toNotificacionDTO } from "@/lib/api/serializadores"
import { ok, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { listarNotifQuerySchema } from "@/lib/schemas/notificaciones"

// Máximo de notificaciones devueltas por solicitud (R8.1).
const LIMITE_NOTIFICACIONES = 100

/**
 * GET /api/notificaciones
 * Valida `solo_no_leidas` ("true" | "false", default "false") con
 * `listarNotifQuerySchema`. En fallo responde 422 `{ errores:[{campo,mensaje}] }`
 * sin consultar la base de datos (R8.2, R8.10).
 *
 * En éxito devuelve hasta 100 `NotificacionDTO` ordenadas de forma descendente
 * por `creado_en`, con desempate descendente por `id` (R8.1). Cuando
 * `solo_no_leidas === "true"` limita el resultado a `leida = false` (R8.3).
 * Devuelve lista vacía cuando no hay coincidencias (R8.4) y siempre responde
 * con `Content-Type: application/json; charset=utf-8` (R8.11).
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const raw = Object.fromEntries(searchParams.entries())
  const parsed = listarNotifQuerySchema.safeParse(raw)

  if (!parsed.success) {
    return errorValidacion(
      parsed.error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
    )
  }

  const { solo_no_leidas } = parsed.data

  try {
    const notificaciones = await prisma.notificacion.findMany({
      where: solo_no_leidas === "true" ? { leida: false } : {},
      orderBy: [{ creado_en: "desc" }, { id: "desc" }],
      take: LIMITE_NOTIFICACIONES,
    })
    return ok(notificaciones.map(toNotificacionDTO))
  } catch (e) {
    return mapPrismaError(e)
  }
}
