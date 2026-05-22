/**
 * lib/codigo-barras.ts
 * Generación y validación de códigos de barras EAN-13 y Code128.
 */

// Charset Code128: ASCII imprimible (0x20–0x7E), sin espacios al inicio/final
const CHARSET_CODE128 = /^[\x20-\x7E]+$/

/**
 * Calcula el dígito verificador EAN-13 para 12 dígitos.
 * Algoritmo: suma ponderada con pesos 1 y 3 alternados, módulo 10.
 */
export function dvEan13(d12: string): string {
  if (!/^\d{12}$/.test(d12)) {
    throw new Error(`dvEan13: se esperan exactamente 12 dígitos, recibido: "${d12}"`)
  }
  let suma = 0
  for (let i = 0; i < 12; i++) {
    const n = parseInt(d12[i], 10)
    suma += i % 2 === 0 ? n : n * 3
  }
  const mod = suma % 10
  return String((10 - mod) % 10)
}

/**
 * Valida un código EAN-13 (13 dígitos con dígito verificador correcto).
 */
export function validarEan13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false
  return dvEan13(s.slice(0, 12)) === s[12]
}

/**
 * Valida un código Code128 (1–48 caracteres ASCII imprimibles).
 */
export function validarCode128(s: string): boolean {
  if (!s || s.length < 1 || s.length > 48) return false
  return CHARSET_CODE128.test(s)
}

/**
 * Detecta el formato de un código de barras.
 * Retorna "EAN13", "CODE128" o null si no coincide con ninguno.
 */
export function detectarFormato(s: string): "EAN13" | "CODE128" | null {
  if (validarEan13(s)) return "EAN13"
  if (validarCode128(s)) return "CODE128"
  return null
}

/**
 * Genera un código EAN-13 válido con el prefijo dado.
 * El prefijo debe ser entre 1 y 12 dígitos.
 * El RNG es inyectable para facilitar tests deterministas.
 *
 * @param prefijo - Prefijo numérico (default: "200" para uso interno)
 * @param rng - Función generadora de números aleatorios (default: Math.random)
 */
export function generarEan13(
  prefijo = "200",
  rng: () => number = Math.random
): string {
  if (!/^\d{1,12}$/.test(prefijo)) {
    throw new Error(`generarEan13: prefijo inválido "${prefijo}" (debe ser 1–12 dígitos)`)
  }
  const restantes = 12 - prefijo.length
  let cuerpo = prefijo
  for (let i = 0; i < restantes; i++) {
    cuerpo += String(Math.floor(rng() * 10))
  }
  return cuerpo + dvEan13(cuerpo)
}
