import { z } from "zod"

/**
 * Patrón de fecha civil ISO 8601 `YYYY-MM-DD`.
 * Las fechas ausentes, vacías o con formato distinto son rechazadas por este
 * regex, generando una entrada por parámetro en `{ errores }` (R2.2, R2.3,
 * R3.2, R3.3).
 */
const fechaIso = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Formato de fecha inválido (YYYY-MM-DD)")

/**
 * Diferencia en días (inclusiva en ambos extremos) entre dos fechas civiles
 * `YYYY-MM-DD`. Implementación autocontenida en UTC para no depender de
 * `lib/dashboard/rango.ts`: interpreta cada fecha como medianoche UTC y cuenta
 * los días completos entre ellas más uno.
 *
 * Ej.: `diffDiasInclusivo("2025-04-02", "2025-04-20") === 19`.
 */
function diffDiasInclusivo(desde: string, hasta: string): number {
  const inicio = Date.parse(`${desde}T00:00:00.000Z`)
  const fin = Date.parse(`${hasta}T00:00:00.000Z`)
  const MS_POR_DIA = 24 * 60 * 60 * 1000
  return Math.floor((fin - inicio) / MS_POR_DIA) + 1
}

/**
 * Reglas comunes de un Rango_Fechas: `desde ≤ hasta` y duración ≤ 366 días.
 * Se aplican vía `superRefine` para emitir un issue por cada condición
 * inválida, con `path` por campo y mensaje en español (R2.2, R3.2).
 */
function refinarRango(
  v: { desde: string; hasta: string },
  ctx: z.RefinementCtx,
): void {
  if (v.desde > v.hasta) {
    ctx.addIssue({
      code: "custom",
      path: ["desde"],
      message: "La fecha de inicio debe ser anterior o igual a la fecha de fin",
    })
  }
  if (diffDiasInclusivo(v.desde, v.hasta) > 366) {
    ctx.addIssue({
      code: "custom",
      path: ["hasta"],
      message: "El rango no puede exceder 366 días",
    })
  }
}

/**
 * Query de `GET /api/dashboard/metricas`: `desde` y `hasta` obligatorios en
 * formato `YYYY-MM-DD`, con `desde ≤ hasta` y duración ≤ 366 días (R2.1, R2.2).
 */
export const metricasQuerySchema = z
  .object({
    desde: fechaIso,
    hasta: fechaIso,
  })
  .superRefine(refinarRango)

/**
 * Query de `GET /api/dashboard/rankings`: además de `desde`/`hasta`, acepta el
 * entero opcional `limite` (coerción desde string, rango 1..50, default 5)
 * (R3.1, R3.2, R3.4).
 */
export const rankingsQuerySchema = z
  .object({
    desde: fechaIso,
    hasta: fechaIso,
    limite: z.coerce.number().int().min(1).max(50).default(5),
  })
  .superRefine(refinarRango)

export type MetricasQueryInput = z.infer<typeof metricasQuerySchema>
export type RankingsQueryInput = z.infer<typeof rankingsQuerySchema>
