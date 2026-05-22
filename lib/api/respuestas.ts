/**
 * lib/api/respuestas.ts
 * Helpers para construir respuestas HTTP JSON uniformes.
 * Todos los endpoints de InvenPro usan estas funciones para garantizar
 * Content-Type: application/json; charset=utf-8 y estructura consistente.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
} as const

// ---- Respuestas de éxito ----

export function ok<T>(data: T): Response {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: JSON_HEADERS,
  })
}

export function creado<T>(data: T): Response {
  return new Response(JSON.stringify(data), {
    status: 201,
    headers: JSON_HEADERS,
  })
}

// ---- Respuestas de error ----

export type ErrorBody = {
  error: {
    codigo: string
    mensaje: string
    detalles?: unknown
  }
}

function errorResponse(status: number, codigo: string, mensaje: string, detalles?: unknown): Response {
  const body: ErrorBody = {
    error: { codigo, mensaje, ...(detalles !== undefined ? { detalles } : {}) },
  }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}

export function errorValidacion(
  errores: Array<{ campo: string; mensaje: string }>
): Response {
  return errorResponse(422, "VALIDACION", "Los datos enviados no son válidos.", {
    errores,
  })
}

export function errorConflicto(codigo: string, status = 409, mensaje?: string): Response {
  return errorResponse(status, codigo, mensaje ?? mensajePorCodigo(codigo))
}

export function errorServidor(codigo: string, status = 500): Response {
  return errorResponse(status, codigo, mensajePorCodigo(codigo))
}

export function errorBdNoDisponible(): Response {
  return errorServidor("BD_NO_DISPONIBLE", 503)
}

export function errorNoEncontrado(codigo = "NO_ENCONTRADO", mensaje?: string): Response {
  return errorResponse(404, codigo, mensaje ?? mensajePorCodigo(codigo))
}

export function errorPeticion(codigo: string, mensaje?: string): Response {
  return errorResponse(400, codigo, mensaje ?? mensajePorCodigo(codigo))
}

// ---- Mapa de mensajes por código ----

const MENSAJES: Record<string, string> = {
  VALIDACION: "Los datos enviados no son válidos.",
  SKU_DUPLICADO: "Ya existe un producto con ese SKU.",
  CODIGO_BARRAS_DUPLICADO: "Ese código de barras ya pertenece a otro producto.",
  CODIGO_BARRAS_INVALIDO: "El código de barras no es válido (EAN-13 o Code128).",
  STOCK_NEGATIVO: "Stock insuficiente para completar la operación.",
  USAR_AJUSTE_STOCK: "Use Ajuste de stock para modificar inventario.",
  PRODUCTO_NO_ENCONTRADO: "Producto no encontrado.",
  VENTA_FALLIDA: "No se pudo registrar la venta. Intente de nuevo.",
  VENTA_TIMEOUT: "La operación tardó demasiado. Intente nuevamente.",
  LIMITE_FOLIO_DIARIO: "Se alcanzó el límite diario de folios.",
  BD_NO_DISPONIBLE: "Base de datos no disponible. Revise el servidor.",
  MISSING_DATABASE_URL: "Configuración inválida: falta DATABASE_URL.",
  CATEGORIA_DUPLICADA: "Ya existe una categoría con ese nombre.",
  CONFLICTO: "Conflicto al guardar.",
  NO_ENCONTRADO: "Recurso no encontrado.",
  RED: "Error de conexión. Revise el servidor.",
  IMPRESION_FALLIDA: "No se pudo enviar la etiqueta a la impresora.",
}

export function mensajePorCodigo(codigo: string): string {
  return MENSAJES[codigo] ?? "Ocurrió un error inesperado."
}
