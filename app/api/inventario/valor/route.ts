import { NextRequest } from "next/server"
import { calcularValorInventario } from "@/lib/dominio/inventario"
import { toValorInventarioDTO } from "@/lib/api/serializadores"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

/**
 * GET /api/inventario/valor
 *
 * Devuelve la métrica Valor_Inventario (Inversión y Recaudación potencial)
 * para la organización activa del usuario autenticado.
 *
 * Requiere permiso de sección "inventario" / acción "ver".
 * Si no hay organización activa, resolverContexto devuelve error de autorización (Req 2.7).
 *
 * Validates: Requirements 2.1, 2.5, 2.7
 */
export async function GET(_req: NextRequest) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const valor = await calcularValorInventario(ctx.organizacionActiva!.id)
    return ok(toValorInventarioDTO(valor))
  } catch (e) {
    return mapPrismaError(e)
  }
}
