/**
 * app/api/deuda/fiadores/route.ts
 *
 * GET /api/deuda/fiadores
 *   Lista los clientes del tenant con saldo > 0, junto con los totales
 *   de la sección (Total_Clientes_Con_Deuda y Total_Deuda_Pendiente).
 *
 * Requirements: 5.1, 5.4, 5.5, 5.6, 5.13
 * Design: § Route Handlers
 */
import { listarFiadores, totalesDeuda } from "@/lib/dominio/deuda"
import { toFiadorDTO } from "@/lib/api/serializadores"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function GET(): Promise<Response> {
  const { ctx, error } = await resolverContexto({ seccion: "fiadores", accion: "ver" })
  if (error) return error

  try {
    const organizacion_id = ctx.organizacionActiva!.id

    // Obtener fiadores y totales en paralelo (Req 5.1, 5.4–5.6, 5.13).
    const [fiadores, totales] = await Promise.all([
      listarFiadores(organizacion_id),
      totalesDeuda(organizacion_id),
    ])

    return ok({
      fiadores: fiadores.map(toFiadorDTO),
      totales: {
        totalClientesConDeuda: totales.totalClientesConDeuda,
        totalDeudaPendiente: totales.totalDeudaPendiente,
      },
    })
  } catch (e) {
    return mapPrismaError(e)
  }
}
