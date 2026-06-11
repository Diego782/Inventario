// Map<clave, timestamp[]>
const intentos = new Map<string, number[]>()

export function consumir(clave: string, limite: number, ventanaMs: number, ahora = Date.now()): boolean {
  const lista = intentos.get(clave) ?? []
  // Remove expired entries
  const vigentes = lista.filter((ts) => ahora - ts < ventanaMs)

  if (vigentes.length >= limite) {
    intentos.set(clave, vigentes)
    return false
  }

  vigentes.push(ahora)
  intentos.set(clave, vigentes)
  return true
}

export const LIMITE_LOGIN = { limite: 1000, ventanaMs: 15 * 60 * 1000 } as const   // sin límite efectivo en dev
export const LIMITE_REENVIO = { limite: 1000, ventanaMs: 60 * 60 * 1000 } as const  // sin límite efectivo en dev
