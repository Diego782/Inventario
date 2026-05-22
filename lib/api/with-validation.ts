/**
 * lib/api/with-validation.ts
 * Envoltorio para Route Handlers que valida el body con un schema Zod.
 * Si la validación falla, retorna 422 con los errores por campo.
 * Si pasa, llama al handler con el input tipado.
 */
import type { ZodSchema } from "zod"
import { errorValidacion } from "./respuestas"

export async function withValidation<T>(
  schema: ZodSchema<T>,
  req: Request,
  handler: (input: T) => Promise<Response>
): Promise<Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    const errores = parsed.error.issues.map((issue) => ({
      campo: issue.path.join("."),
      mensaje: issue.message,
    }))
    return errorValidacion(errores)
  }

  return handler(parsed.data)
}

/**
 * Versión para query params (GET requests).
 * Parsea los searchParams como un objeto plano.
 */
export function withQueryValidation<T>(
  schema: ZodSchema<T>,
  searchParams: URLSearchParams,
  handler: (input: T) => Promise<Response>
): Promise<Response> {
  const raw: Record<string, string> = {}
  searchParams.forEach((value, key) => {
    raw[key] = value
  })

  const parsed = schema.safeParse(raw)

  if (!parsed.success) {
    const errores = parsed.error.issues.map((issue) => ({
      campo: issue.path.join("."),
      mensaje: issue.message,
    }))
    return Promise.resolve(errorValidacion(errores))
  }

  return handler(parsed.data)
}
