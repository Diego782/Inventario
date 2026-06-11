// Feature: dashboard-metricas-notificaciones
// Utilidades puras de cliente para el Rango_Fechas del Dashboard_Analitico.
// Sin side effects. Candidatas a property-based testing (Property 1).
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { formatInTimeZone } from "date-fns-tz"

/** Preset rápido de Rango_Fechas (R1.2). */
export type PresetRango =
  | "hoy"
  | "esta_semana"
  | "este_mes"
  | "mes_anterior"
  | "personalizado"

/** Par de fechas civiles `YYYY-MM-DD`, inclusivo en ambos extremos (R1.10). */
export type RangoFechas = { desde: string; hasta: string }

/** Construye una cadena civil `YYYY-MM-DD` a partir de componentes (1-based mes/día). */
function iso(y: number, m: number, d: number): string {
  const mm = String(m).padStart(2, "0")
  const dd = String(d).padStart(2, "0")
  return `${y}-${mm}-${dd}`
}

/**
 * Fecha civil (componentes y cadena `YYYY-MM-DD`) del instante `hoy` en la zona
 * horaria `tz`. Toda la aritmética de presets se realiza sobre la fecha civil para
 * ser independiente del huso horario del runtime y de transiciones DST.
 * Si `hoy` no es una fecha válida, usa la fecha actual del sistema.
 */
function civil(hoy: Date, tz: string): { y: number; m: number; d: number; iso: string } {
  const fechaSegura = isFinite(hoy.getTime()) ? hoy : new Date()
  const s = formatInTimeZone(fechaSegura, tz, "yyyy-MM-dd")
  const [y, m, d] = s.split("-").map(Number)
  return { y, m, d, iso: s }
}

/**
 * Calcula el Rango_Fechas correspondiente a un preset, interpretado en `tz`.
 *
 * - `hoy`          → desde = hasta = hoy
 * - `esta_semana`  → desde = lunes de la semana de hoy, hasta = hoy
 * - `este_mes`     → desde = día 1 del mes de hoy, hasta = hoy
 * - `mes_anterior` → desde = día 1 y hasta = último día del mes calendario previo
 * - `personalizado`→ no define rango automático; se devuelve [hoy, hoy] como base.
 *
 * Garantiza `desde ≤ hasta` y que ninguna fecha sea posterior a `hoy`.
 */
export function presetARango(preset: PresetRango, hoy: Date, tz: string): RangoFechas {
  const { y, m, d, iso: hoyIso } = civil(hoy, tz)

  switch (preset) {
    case "hoy":
      return { desde: hoyIso, hasta: hoyIso }

    case "esta_semana": {
      // Lunes de la semana de la fecha civil (semana que empieza en lunes).
      const base = new Date(Date.UTC(y, m - 1, d))
      const dow = base.getUTCDay() // 0=domingo .. 6=sábado
      const diasARestar = (dow + 6) % 7 // lunes → 0, domingo → 6
      const lunes = new Date(Date.UTC(y, m - 1, d - diasARestar))
      return {
        desde: iso(lunes.getUTCFullYear(), lunes.getUTCMonth() + 1, lunes.getUTCDate()),
        hasta: hoyIso,
      }
    }

    case "este_mes":
      return { desde: iso(y, m, 1), hasta: hoyIso }

    case "mes_anterior": {
      // Día 1 y último día del mes calendario inmediatamente anterior.
      const primerDiaPrev = new Date(Date.UTC(y, m - 2, 1))
      const ultimoDiaPrev = new Date(Date.UTC(y, m - 1, 0))
      return {
        desde: iso(
          primerDiaPrev.getUTCFullYear(),
          primerDiaPrev.getUTCMonth() + 1,
          primerDiaPrev.getUTCDate()
        ),
        hasta: iso(
          ultimoDiaPrev.getUTCFullYear(),
          ultimoDiaPrev.getUTCMonth() + 1,
          ultimoDiaPrev.getUTCDate()
        ),
      }
    }

    case "personalizado":
    default:
      return { desde: hoyIso, hasta: hoyIso }
  }
}

const PATRON_ISO = /^\d{4}-\d{2}-\d{2}$/
const MS_DIA = 24 * 60 * 60 * 1000

/** Instante UTC (ms) de una fecha civil `YYYY-MM-DD`. */
function aUtc(fecha: string): number {
  const [y, m, d] = fecha.split("-").map((n) => Number(n))
  return Date.UTC(y, m - 1, d)
}

/**
 * Verdadero si `fecha` casa el formato `YYYY-MM-DD` y corresponde a una fecha de
 * calendario real (descarta `2025-02-30`, `2025-13-01`, etc.).
 */
function esFechaRealIso(fecha: string): boolean {
  if (!PATRON_ISO.test(fecha)) return false
  const [y, m, d] = fecha.split("-").map((n) => Number(n))
  const dt = new Date(Date.UTC(y, m - 1, d))
  return (
    dt.getUTCFullYear() === y &&
    dt.getUTCMonth() === m - 1 &&
    dt.getUTCDate() === d
  )
}

/**
 * Duración inclusiva en días entre dos fechas civiles `YYYY-MM-DD` válidas
 * (ambos extremos cuentan). Por ejemplo `2024-01-01`..`2024-01-01` → 1.
 */
export function diffDiasInclusivo(desde: string, hasta: string): number {
  return Math.round((aUtc(hasta) - aUtc(desde)) / MS_DIA) + 1
}

/** Formatea un instante UTC (medianoche) como cadena civil `YYYY-MM-DD`. */
function aFechaIso(ms: number): string {
  const dt = new Date(ms)
  return iso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
}

/**
 * Periodo inmediatamente anterior y contiguo a `{ desde, hasta }`, de igual
 * duración inclusiva en días (R2.11). Función pura sobre cadenas `YYYY-MM-DD`.
 *
 * - `duracionDias = diffDiasInclusivo(desde, hasta)`
 * - `anteriorHasta = desde − 1 día`
 * - `anteriorDesde = anteriorHasta − (duracionDias − 1) días`
 *
 * Garantiza que `anteriorHasta < desde` (no hay solape) y que la duración
 * inclusiva del periodo anterior coincide con la del rango actual.
 */
export function periodoAnterior(desde: string, hasta: string): RangoFechas {
  const duracionDias = diffDiasInclusivo(desde, hasta)
  const anteriorHastaMs = aUtc(desde) - MS_DIA
  const anteriorDesdeMs = anteriorHastaMs - (duracionDias - 1) * MS_DIA
  return {
    desde: aFechaIso(anteriorDesdeMs),
    hasta: aFechaIso(anteriorHastaMs),
  }
}

/** Resultado de validar un Rango_Fechas personalizado (R1.6–R1.8). */
export type ResultadoValidacionRango =
  | { ok: true; rango: RangoFechas }
  | { ok: false; mensaje: string }

/**
 * Valida un Rango_Fechas personalizado confirmado por el usuario contra las
 * reglas R1.6, R1.7 y R1.8, devolviendo `{ ok: true, rango }` cuando es válido o
 * `{ ok: false, mensaje }` con un mensaje en español que describe la condición
 * inválida.
 *
 * Reglas (todas deben cumplirse para aceptar):
 * - Ambas fechas definidas (no `null`) — R1.8 (incompleto).
 * - Ambas con formato `YYYY-MM-DD` y fecha de calendario real.
 * - `desde ≤ hasta` — R1.7 (mensaje específico).
 * - Ninguna fecha futura respecto a `hoy` (fecha civil UTC de `hoy`) — R1.8.
 * - Duración inclusiva ≤ 366 días — R1.8.
 */
export function validarRangoPersonalizado(
  desde: string | null,
  hasta: string | null,
  hoy: Date
): ResultadoValidacionRango {
  if (desde === null || hasta === null) {
    return {
      ok: false,
      mensaje: "Selecciona una fecha de inicio y una fecha de fin para el rango",
    }
  }

  if (!esFechaRealIso(desde) || !esFechaRealIso(hasta)) {
    return {
      ok: false,
      mensaje: "Las fechas deben tener un formato de calendario válido (YYYY-MM-DD)",
    }
  }

  if (desde > hasta) {
    return {
      ok: false,
      mensaje: "La fecha de inicio debe ser anterior o igual a la fecha de fin",
    }
  }

  const hoySegura = isFinite(hoy.getTime()) ? hoy : new Date()
  const hoyStr = hoySegura.toISOString().slice(0, 10)
  if (desde > hoyStr || hasta > hoyStr) {
    return {
      ok: false,
      mensaje: "Las fechas no pueden ser futuras",
    }
  }

  if (diffDiasInclusivo(desde, hasta) > 366) {
    return {
      ok: false,
      mensaje: "El rango no puede exceder 366 días",
    }
  }

  return { ok: true, rango: { desde, hasta } }
}

/**
 * Convierte una cadena civil `YYYY-MM-DD` en un `Date` con esos componentes
 * exactos en hora local, apto sólo para formateo (no para cálculos de instante).
 */
function aFechaLocal(civilStr: string): Date {
  const [y, m, d] = civilStr.split("-").map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Produce la etiqueta legible en español del rango activo (R1.9),
 * por ejemplo `"2 abr 2025 – 20 abr 2025"`.
 */
export function etiquetaLegible(rango: RangoFechas): string {
  const fmt = (s: string) => format(aFechaLocal(s), "d MMM yyyy", { locale: es })
  return `${fmt(rango.desde)} – ${fmt(rango.hasta)}`
}
