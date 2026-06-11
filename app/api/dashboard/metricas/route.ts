// Feature: dashboard-metricas-notificaciones
// GET /api/dashboard/metricas — métricas agregadas del Dashboard_Analitico.
//
// Reglas (ver requirements.md):
// - R2.1 : acepta los parámetros de consulta obligatorios `desde` y `hasta`.
// - R2.3 : si la validación Zod falla, responde 422 `{ errores:[{campo,mensaje}] }`
//          SIN ejecutar el cálculo de métricas.
// - R2.5 : con rango válido responde 200 con el `MetricasDTO`.
// - R2.13: sin registros, las métricas valen 0 (lo resuelve la capa de dominio).
// - R2.14: responde `Content-Type: application/json; charset=utf-8` (vía `ok`).
// - R14.7: el cálculo está acotado a 5 s; al expirar responde `CONSULTA_TIMEOUT` (504).
import { NextRequest } from "next/server"
import { calcularMetricas } from "@/lib/dominio/metricas"
import { ok, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError, ConsultaTimeoutError } from "@/lib/api/errores"
import { metricasQuerySchema } from "@/lib/schemas/dashboard"

const TIMEOUT_MS = 5_000
const TZ = process.env.TZ ?? "America/Mexico_City"

/**
 * Acota una promesa a `TIMEOUT_MS`. Si expira, rechaza con `ConsultaTimeoutError`
 * (que `mapPrismaError` traduce a 504 `CONSULTA_TIMEOUT`). El temporizador se
 * limpia en cuanto la promesa subyacente resuelve o rechaza.
 */
function conLimiteTiempo<T>(promesa: Promise<T>): Promise<T> {
  let temporizador: ReturnType<typeof setTimeout>
  const limite = new Promise<never>((_, reject) => {
    temporizador = setTimeout(() => reject(new ConsultaTimeoutError()), TIMEOUT_MS)
  })
  return Promise.race([promesa, limite]).finally(() => clearTimeout(temporizador)) as Promise<T>
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const raw = Object.fromEntries(searchParams.entries())
  const parsed = metricasQuerySchema.safeParse(raw)

  if (!parsed.success) {
    // R2.3: no se ejecuta el cálculo cuando la validación falla.
    return errorValidacion(
      parsed.error.issues.map((i) => ({ campo: i.path.join("."), mensaje: i.message }))
    )
  }

  try {
    const { desde, hasta } = parsed.data
    const metricas = await conLimiteTiempo(calcularMetricas(desde, hasta, TZ))
    return ok(metricas)
  } catch (e) {
    return mapPrismaError(e)
  }
}
