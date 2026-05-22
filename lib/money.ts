/**
 * lib/money.ts
 * Utilidades monetarias para InvenPro.
 *
 * redondearBancario implementa el redondeo half-to-even (banker's rounding):
 * cuando el dígito a descartar es exactamente 5 y no hay restos, redondea
 * al número par más cercano. Esto evita el sesgo acumulativo del redondeo
 * half-up convencional.
 */

/**
 * Redondea un número a `decimales` posiciones usando redondeo bancario (half-to-even).
 *
 * @example
 * redondearBancario(2.125) // 2.12 (redondea al par: 2 es par)
 * redondearBancario(2.135) // 2.14 (redondea al par: 4 es par)
 * redondearBancario(2.5)   // 2    (redondea al par: 2 es par)
 * redondearBancario(3.5)   // 4    (redondea al par: 4 es par)
 */
export function redondearBancario(valor: number, decimales = 2): number {
  if (!Number.isFinite(valor)) return valor

  const factor = Math.pow(10, decimales)
  const escalado = valor * factor
  const piso = Math.floor(escalado)
  const resto = escalado - piso
  const eps = 1e-9

  let resultado: number
  if (resto > 0.5 + eps) {
    resultado = piso + 1
  } else if (resto < 0.5 - eps) {
    resultado = piso
  } else {
    // Caso half: redondear al par más cercano
    resultado = piso % 2 === 0 ? piso : piso + 1
  }

  return resultado / factor
}
