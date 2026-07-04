/**
 * app/api/deuda/[cliente_id]/route.ts
 *
 * GET /api/deuda/[cliente_id]
 *   Devuelve el historial cronológico de movimientos de deuda de un cliente
 *   con el saldo corrido por movimiento.
 *
 * Requirements: 5.2, 5.3
 * Design: § Route Handlers
 */
import type { NextRequest } from "next/server"
import { historialDeuda } from "@/lib/dominio/deuda"
import { toMovimientoDeudaDTO } from "@/lib/api/serializadores"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ cliente_id: string }> }
): Promise<Response> {
  const { ctx, error } = await resolverContexto({ seccion: "fiadores", accion: "ver" })
  if (error) return error

  try {
    const { cliente_id } = await params
    const organizacion_id = ctx.organizacionActiva!.id

    // historialDeuda ya filtra por organizacion_id (Req 5.12).
    const historial = await historialDeuda(cliente_id, organizacion_id)

    // Serializar cada entrada con el saldo corrido (Req 5.2, 5.3).
    const items = historial.map(({ movimiento, saldoResultante }) =>
      toMovimientoDeudaDTO({ ...movimiento, saldoResultante })
    )

    return ok({ cliente_id, items })
  } catch (e) {
    return mapPrismaError(e)
  }
}
