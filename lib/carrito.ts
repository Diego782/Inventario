/**
 * lib/carrito.ts
 * Lógica pura del carrito de ventas.
 * Sin dependencias de React — testeable con fast-check.
 */
import { redondearBancario } from "@/lib/money"
import type { ProductoDTO } from "@/lib/api/serializadores"

// ---- Tipos ----

export type ItemCarrito = {
  producto: ProductoDTO
  cantidad: number
}

export type CarritoTotales = {
  subtotal: number
  impuestos: number
  total: number
}

// ---- Funciones puras ----

/**
 * Calcula subtotal, impuestos y total del carrito.
 * Usa redondeo bancario (half-to-even) en todos los montos.
 */
export function calcularTotales(
  items: ItemCarrito[],
  porcentaje_impuesto: number
): CarritoTotales {
  const subtotal = redondearBancario(
    items.reduce((acc, item) => acc + item.producto.precio_venta * item.cantidad, 0)
  )
  const impuestos = redondearBancario((subtotal * porcentaje_impuesto) / 100)
  const total = redondearBancario(subtotal + impuestos)
  return { subtotal, impuestos, total }
}

/**
 * Agrega un producto al carrito o incrementa su cantidad si ya existe.
 * Respeta el límite de stock si `permitir_sobreventa` es false.
 * Retorna el nuevo array de items y un flag indicando si se excedió el stock.
 */
export function agregarOIncrementar(
  items: ItemCarrito[],
  producto: ProductoDTO,
  permitir_sobreventa: boolean
): { items: ItemCarrito[]; excedeStock: boolean } {
  const existente = items.find((i) => i.producto.id === producto.id)

  if (existente) {
    const nuevaCantidad = existente.cantidad + 1
    const excedeStock = !permitir_sobreventa && nuevaCantidad > producto.stock_actual

    if (excedeStock) {
      return { items, excedeStock: true }
    }

    return {
      items: items.map((i) =>
        i.producto.id === producto.id ? { ...i, cantidad: nuevaCantidad } : i
      ),
      excedeStock: false,
    }
  }

  // Producto nuevo en el carrito
  const excedeStock = !permitir_sobreventa && 1 > producto.stock_actual
  if (excedeStock) {
    return { items, excedeStock: true }
  }

  return {
    items: [...items, { producto, cantidad: 1 }],
    excedeStock: false,
  }
}

/**
 * Cambia la cantidad de un ítem del carrito.
 * Respeta el límite de stock si `permitir_sobreventa` es false.
 * La cantidad mínima es 1.
 */
export function setCantidad(
  items: ItemCarrito[],
  producto_id: string,
  cantidad: number,
  permitir_sobreventa: boolean
): ItemCarrito[] {
  const cantidadValida = Math.max(1, cantidad)

  return items.map((item) => {
    if (item.producto.id !== producto_id) return item

    const cantidadFinal =
      !permitir_sobreventa && cantidadValida > item.producto.stock_actual
        ? item.producto.stock_actual
        : cantidadValida

    return { ...item, cantidad: cantidadFinal }
  })
}

/**
 * Elimina un ítem del carrito por producto_id.
 */
export function eliminarItem(items: ItemCarrito[], producto_id: string): ItemCarrito[] {
  return items.filter((i) => i.producto.id !== producto_id)
}

/**
 * Serializa el carrito para enviarlo a POST /api/ventas.
 */
export function serializarParaApi(items: ItemCarrito[]): Array<{
  producto_id: string
  cantidad: number
  precio_unitario: number
}> {
  return items.map((item) => ({
    producto_id: item.producto.id,
    cantidad: item.cantidad,
    precio_unitario: item.producto.precio_venta,
  }))
}
