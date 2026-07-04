/**
 * app/api/deuda/[cliente_id]/abono/route.ts
 *
 * POST /api/deuda/[cliente_id]/abono
 *   Registra un abono de deuda para el cliente indicado.
 *   Valida con `registrarAbonoSchema` y delega la lógica de rango al dominio.
 *
 * Requirements: 5.7, 5.8, 5.9, 5.10, 5.11
 * Design: § Route Handlers
 */
import type { NextRequest } from "next/server"
import { registrarAbono } from "@/lib/dominio/deuda"
import { toMovimientoDeudaDTO } from "@/lib/api/serializadores"
import { creado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { registrarAbonoSchema } from "@/lib/schemas/deuda"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ cliente_id: string }> }
): Promise<Response> {
  const { ctx, error } = await resolverContexto({ seccion: "fiadores", accion: "editar" })
  if (error) return error

  const { cliente_id } = await params
  const organizacion_id = ctx.organizacionActiva!.id

  return withValidation(registrarAbonoSchema, req, async (input) => {
    try {
      const { movimiento, saldo } = await registrarAbono(
        { cliente_id, monto: input.monto },
        organizacion_id
      )

      return creado({
        movimiento: toMovimientoDeudaDTO(movimiento),
        saldo,
      })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
