/**
 * Utilidades de vigencia para tokens y sesiones.
 * Validates: Requirements R3.2, R3.3, R4.2
 */

/**
 * Parsea `raw` como entero; si es NaN o queda fuera de [min, max], devuelve `def`.
 */
export function clampInt(
  raw: string | undefined,
  def: number,
  min: number,
  max: number,
): number {
  if (raw === undefined || raw === "") return def;
  const parsed = parseInt(raw, 10);
  if (Number.isNaN(parsed)) return def;
  if (parsed < min || parsed > max) return def;
  return parsed;
}

/**
 * Vigencia del token de verificación en horas.
 * Rango válido: [1, 168]. Default: 24.
 */
export function vigenciaTokenHoras(env?: string): number {
  return clampInt(env, 24, 1, 168);
}

/**
 * Vida de la sesión por inactividad, en milisegundos.
 * Lee `process.env.SESION_INACTIVIDAD_HORAS`.
 * Rango válido: [1, 720] horas (1h a 30 días). Default: 168 (7 días).
 */
export function vidaSesionMs(): number {
  const horas = clampInt(process.env.SESION_INACTIVIDAD_HORAS, 168, 1, 720);
  return horas * 60 * 60 * 1000;
}

/**
 * Calcula la nueva fecha de expiración de sesión a partir de ahora.
 */
export function nuevaExpiracion(): Date {
  return new Date(Date.now() + vidaSesionMs());
}
