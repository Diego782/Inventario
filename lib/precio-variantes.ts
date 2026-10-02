type Monto = number | { toString(): string }

export type ProductoConPrecio = {
  precio_compra?: Monto
  precio_venta: Monto
  precio_por_variante?: boolean
}

export type VarianteConPrecio = {
  precio_compra?: Monto | null
  precio_venta?: Monto | null
}

/** El costo común sigue vigente para productos que no usan precios por variante. */
export function precioCompraEfectivo(
  producto: ProductoConPrecio,
  variante?: VarianteConPrecio | null,
): number {
  if (producto.precio_por_variante && variante) {
    return Number(variante.precio_compra ?? producto.precio_compra ?? 0)
  }
  return Number(producto.precio_compra ?? 0)
}

/** Un precio nulo en la variante significa que usa el precio común del producto. */
export function precioEfectivo(
  producto: ProductoConPrecio,
  variante?: VarianteConPrecio | null,
): number {
  if (producto.precio_por_variante) {
    if (!variante || variante.precio_venta == null) {
      throw new Error("PRECIO_VARIANTE_INCOMPLETO")
    }
    return Number(variante.precio_venta)
  }
  return Number(producto.precio_venta)
}

export function rangoPrecios(
  producto: ProductoConPrecio & { variantes: VarianteConPrecio[] },
): { minimo: number; maximo: number } {
  const precios = producto.precio_por_variante && producto.variantes.length > 0
    ? producto.variantes.map((variante) => precioEfectivo(producto, variante))
    : [Number(producto.precio_venta)]
  return { minimo: Math.min(...precios), maximo: Math.max(...precios) }
}
