/**
 * lib/api/cliente.ts
 * Cliente HTTP para consumir la API de InvenPro desde el frontend.
 * Maneja errores de red y errores de la API de forma uniforme.
 */

export class ApiError extends Error {
  constructor(
    public readonly codigo: string,
    public readonly mensaje: string,
    public readonly status: number,
    public readonly detalles?: unknown
  ) {
    super(mensaje)
    this.name = "ApiError"
  }
}

export class RedError extends Error {
  constructor(cause?: unknown) {
    super("Error de conexión. Revise el servidor.")
    this.name = "RedError"
    if (cause) this.cause = cause
  }
}

/**
 * Realiza una petición HTTP y parsea la respuesta como JSON.
 * Lanza ApiError si la respuesta no es 2xx.
 * Lanza RedError si hay un error de red.
 */
export async function fetchJson<T>(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<T> {
  let response: Response

  try {
    // Añadir Content-Type por defecto para métodos con body
    const method = (init?.method ?? "GET").toUpperCase()
    const headers = new Headers(init?.headers)

    if (["POST", "PUT", "PATCH"].includes(method) && !headers.has("Content-Type")) {
      headers.set("Content-Type", "application/json")
    }

    response = await fetch(input, { ...init, headers })
  } catch (e) {
    throw new RedError(e)
  }

  if (!response.ok) {
    let errorData: { error?: { codigo?: string; mensaje?: string; detalles?: unknown } } = {}
    try {
      errorData = await response.json()
    } catch {
      // Si no se puede parsear el JSON, usar valores por defecto
    }

    throw new ApiError(
      errorData.error?.codigo ?? "DESCONOCIDO",
      errorData.error?.mensaje ?? `Error HTTP ${response.status}`,
      response.status,
      errorData.error?.detalles
    )
  }

  try {
    return await response.json() as T
  } catch {
    return undefined as unknown as T
  }
}

/**
 * Construye una URL con query params, omitiendo los valores undefined/null.
 */
export function buildUrl(base: string, params: Record<string, string | number | boolean | undefined | null>): string {
  const url = new URL(base, typeof window !== "undefined" ? window.location.origin : "http://localhost:3000")
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value))
    }
  }
  return url.pathname + (url.search ? url.search : "")
}
