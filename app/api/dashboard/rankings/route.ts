// Feature: dashboard-metricas-notificaciones / gestion-clientes-y-fiadores
// GET /api/dashboard/rankings — rankings del Dashboard_Analitico.
//
// Reglas:
// - Req 1.2 : rankings calculados usando exclusivamente registros del tenant activo.
// - Req 1.4 : si no hay organización activa, `resolverContexto` responde error de
//             autorización sin devolver rankings ni exponer datos de ningún tenant.
// - R3.2, R3.3 : si la validación Zod falla, responde 422 SIN ejecutar el cálculo.
// - R3.5  : con rango válido responde 200 con `RankingsDTO`.
// - R3.13 : responde `Content-Type: application/json; charset=utf-8` (vía `ok`).
// - R14.7 : el cálculo está acotado a 5 s; al expirar responde `CONSULTA_TIMEOUT` (504).
import { NextRequest } from "next/server"
import { calcularRankings } from "@/lib/dominio/rankings"
import { ok, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError, ConsultaTimeoutError } from "@/lib/api/errores"
import { rankingsQuerySchema } from "@/lib/schemas/dashboard"
import { resolverContexto } from "@/lib/auth/contexto-request"

// Límite de tiempo para el cálculo de rankings (R3.x, R14.7): si la consulta
// excede 5 s respondemos CONSULTA_TIMEOUT (504) en lugar de colgar la petición.
const LIMITE_CONSULTA_MS = 5_000

function conTimeout<T>(promesa: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new ConsultaTimeoutError()), ms)
    promesa.then(
      (v) => {
        clearTimeout(t)
        resolve(v)
      },
      (e) => {
        clearTimeout(t)
        reject(e)
      },
    )
  })
}

/**
 * GET /api/dashboard/rankings
 * Req 1.4: guard de organización activa — si falta, responde error de auth.
 * Valida `desde`, `hasta` y el `limite` opcional (default 5) con
 * `rankingsQuerySchema`. En fallo responde 422 `{ errores:[{campo,mensaje}] }`
 * SIN ejecutar el cálculo (R3.2, R3.3). En éxito devuelve `RankingsDTO` (R3.5)
 * con `Content-Type: application/json; charset=utf-8` (R3.13).
 */
export async function GET(req: NextRequest) {
  // Req 1.4: guard de organización activa — si falta, responde error de auth.
  const resultado = await resolverContexto({ seccion: "dashboard", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const organizacion_id = ctx.organizacionActiva!.id

  const { searchParams } = req.nextUrl
  const raw = Object.fromEntries(searchParams.entries())
  const parsed = rankingsQuerySchema.safeParse(raw)

  if (!parsed.success) {
    return errorValidacion(
      parsed.error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message })),
    )
  }

  const { desde, hasta, limite } = parsed.data

  try {
    const rankings = await conTimeout(
      calcularRankings(desde, hasta, limite, organizacion_id),
      LIMITE_CONSULTA_MS,
    )
    return ok(rankings)
  } catch (e) {
    return mapPrismaError(e)
  }
}
