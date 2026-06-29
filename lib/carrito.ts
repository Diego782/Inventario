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
  /** Variante (talla) seleccionada, si el producto maneja tallas. */
  variante_id?: string | null
  variante_talla?: string | null
  /** Stock disponible de la variante seleccionada (o del producto si no hay variante). */
  stock_disponible?: number
}

export type CarritoTotales = {
  subtotal: number
  impuestos: number
  total: number
}

// ---- Funciones puras ----

/** Identidad de una línea del carrito: producto + variante (talla) si aplica. */
export function claveItem(producto_id: string, variante_id?: string | null): string {
  return variante_id ? `${producto_id}::${variante_id}` : producto_id
}

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
 * Agrega un producto SIN variante al carrito o incrementa su cantidad si ya existe.
 * Respeta el límite de stock si `permitir_sobreventa` es false.
 * Retorna el nuevo array de items y un flag indicando si se excedió el stock.
 */
export function agregarOIncrementar(
  items: ItemCarrito[],
  producto: ProductoDTO,
  permitir_sobreventa: boolean
): { items: ItemCarrito[]; excedeStock: boolean } {
  const existente = items.find((i) => i.producto.id === producto.id && !i.variante_id)

  if (existente) {
    const nuevaCantidad = existente.cantidad + 1
    const excedeStock = !permitir_sobreventa && nuevaCantidad > producto.stock_actual

    if (excedeStock) {
      return { items, excedeStock: true }
    }

    return {
      items: items.map((i) =>
        i.producto.id === producto.id && !i.variante_id ? { ...i, cantidad: nuevaCantidad } : i
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
    items: [...items, { producto, cantidad: 1, stock_disponible: producto.stock_actual }],
    excedeStock: false,
  }
}

/**
 * Agrega un producto con una variante (talla) específica al carrito, o incrementa
 * su cantidad si esa combinación producto+variante ya existe. Valida contra el
 * stock de la variante seleccionada cuando `permitir_sobreventa` es false.
 */
export function agregarConVariante(
  items: ItemCarrito[],
  producto: ProductoDTO,
  variante: { id: string; talla: string; stock_actual: number },
  cantidad: number,
  permitir_sobreventa: boolean
): { items: ItemCarrito[]; excedeStock: boolean } {
  const cant = Math.max(1, cantidad)
  const existente = items.find(
    (i) => i.producto.id === producto.id && i.variante_id === variante.id
  )

  if (existente) {
    const nuevaCantidad = existente.cantidad + cant
    const excedeStock = !permitir_sobreventa && nuevaCantidad > variante.stock_actual
    if (excedeStock) return { items, excedeStock: true }
    return {
      items: items.map((i) =>
        i.producto.id === producto.id && i.variante_id === variante.id
          ? { ...i, cantidad: nuevaCantidad }
          : i
      ),
      excedeStock: false,
    }
  }

  const excedeStock = !permitir_sobreventa && cant > variante.stock_actual
  if (excedeStock) return { items, excedeStock: true }

  return {
    items: [
      ...items,
      {
        producto,
        cantidad: cant,
        variante_id: variante.id,
        variante_talla: variante.talla,
        stock_disponible: variante.stock_actual,
      },
    ],
    excedeStock: false,
  }
}

/**
 * Cambia la cantidad de un ítem del carrito identificado por su clave
 * (producto + variante). Respeta el stock disponible de la línea si
 * `permitir_sobreventa` es false. La cantidad mínima es 1.
 */
export function setCantidad(
  items: ItemCarrito[],
  clave: string,
  cantidad: number,
  permitir_sobreventa: boolean
): ItemCarrito[] {
  const cantidadValida = Math.max(1, cantidad)

  return items.map((item) => {
    if (claveItem(item.producto.id, item.variante_id) !== clave) return item

    const tope = item.stock_disponible ?? item.producto.stock_actual
    const cantidadFinal =
      !permitir_sobreventa && cantidadValida > tope ? tope : cantidadValida

    return { ...item, cantidad: cantidadFinal }
  })
}

/**
 * Elimina un ítem del carrito por su clave (producto + variante).
 */
export function eliminarItem(items: ItemCarrito[], clave: string): ItemCarrito[] {
  return items.filter((i) => claveItem(i.producto.id, i.variante_id) !== clave)
}

/**
 * Serializa el carrito para enviarlo a POST /api/ventas.
 */
export function serializarParaApi(items: ItemCarrito[]): Array<{
  producto_id: string
  variante_id?: string | null
  cantidad: number
  precio_unitario: number
}> {
  return items.map((item) => ({
    producto_id: item.producto.id,
    variante_id: item.variante_id ?? null,
    cantidad: item.cantidad,
    precio_unitario: item.producto.precio_venta,
  }))
}
