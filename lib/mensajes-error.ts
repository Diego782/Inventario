/**
 * lib/mensajes-error.ts
 * Catálogo de mensajes de error para el cliente (toasts en español).
 * Mapea códigos de error de la API a mensajes legibles por el usuario.
 */

export const MENSAJES_ERROR: Record<string, string> = {
  VALIDACION: "Revise los campos marcados.",
  CODIGO_BARRAS_DUPLICADO: "Ese código de barras ya pertenece a otro producto.",
  CODIGO_BARRAS_INVALIDO: "El código de barras no es válido (EAN-13 o Code128).",
  STOCK_NEGATIVO: "Stock insuficiente para completar la operación.",
  USAR_AJUSTE_STOCK: "Use Ajuste de stock para modificar inventario.",
  PRODUCTO_NO_ENCONTRADO: "Producto no encontrado.",
  NOTIFICACION_NO_ENCONTRADA: "Notificación no encontrada.",
  VENTA_FALLIDA: "No se pudo registrar la venta. Intente de nuevo.",
  VENTA_TIMEOUT: "La operación tardó demasiado. Intente nuevamente.",
  CONSULTA_TIMEOUT: "La consulta tardó demasiado. Intente nuevamente.",
  LIMITE_FOLIO_DIARIO: "Se alcanzó el límite diario de folios.",
  BD_NO_DISPONIBLE: "Base de datos no disponible. Revise el servidor.",
  CATEGORIA_DUPLICADA: "Ya existe una categoría con ese nombre.",
  CONFLICTO: "Conflicto al guardar.",
  RED: "Error de conexión. Revise el servidor.",
  // Clientes
  CEDULA_DUPLICADA: "Esa cédula ya está registrada en esta organización.",
  CLIENTE_NO_ENCONTRADO: "Cliente no encontrado.",
  CLIENTE_CON_HISTORIAL: "No se puede eliminar: el cliente tiene ventas o movimientos de deuda.",
}

/**
 * Retorna el mensaje de toast para un código de error de la API.
 * Si el código no está en el catálogo, retorna el fallback o un mensaje genérico.
 */
export function toastDeError(codigo: string, fallback?: string): string {
  return MENSAJES_ERROR[codigo] ?? fallback ?? "Ocurrió un error inesperado."
}

/**
 * Extrae el código de error de una respuesta de la API.
 * Retorna "RED" si la respuesta no tiene el formato esperado.
 */
export async function extraerCodigoError(response: Response): Promise<string> {
  try {
    const data = await response.json()
    return data?.error?.codigo ?? "DESCONOCIDO"
  } catch {
    return "RED"
  }
}
