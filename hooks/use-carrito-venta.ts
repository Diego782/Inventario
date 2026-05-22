"use client"
/**
 * hooks/use-carrito-venta.ts
 * Hook de estado del carrito de ventas.
 * Delega la lógica pura a lib/carrito.ts y expone una API React.
 */
import { useState, useMemo } from "react"
import {
  calcularTotales,
  agregarOIncrementar,
  setCantidad as setCantidadPura,
  eliminarItem,
  serializarParaApi,
  type ItemCarrito,
  type CarritoTotales,
} from "@/lib/carrito"
import type { ProductoDTO } from "@/lib/api/serializadores"

export type UseCarritoVenta = {
  items: ItemCarrito[]
  totales: CarritoTotales
  agregarOIncrementar: (producto: ProductoDTO) => { excedeStock: boolean }
  setCantidad: (producto_id: string, cantidad: number) => void
  eliminar: (producto_id: string) => void
  limpiar: () => void
  serializarParaApi: () => ReturnType<typeof serializarParaApi>
}

/**
 * Hook que gestiona el estado del carrito de ventas.
 * Usa `permitir_sobreventa` de la configuración para validar stock.
 */
export function useCarritoVenta(
  porcentaje_impuesto = 0,
  permitir_sobreventa = false
): UseCarritoVenta {
  const [items, setItems] = useState<ItemCarrito[]>([])

  const totales = useMemo(
    () => calcularTotales(items, porcentaje_impuesto),
    [items, porcentaje_impuesto]
  )

  const agregar = (producto: ProductoDTO): { excedeStock: boolean } => {
    const resultado = agregarOIncrementar(items, producto, permitir_sobreventa)
    setItems(resultado.items)
    return { excedeStock: resultado.excedeStock }
  }

  const setCantidad = (producto_id: string, cantidad: number): void => {
    setItems((prev) => setCantidadPura(prev, producto_id, cantidad, permitir_sobreventa))
  }

  const eliminar = (producto_id: string): void => {
    setItems((prev) => eliminarItem(prev, producto_id))
  }

  const limpiar = (): void => {
    setItems([])
  }

  const serializar = (): ReturnType<typeof serializarParaApi> => {
    return serializarParaApi(items)
  }

  return {
    items,
    totales,
    agregarOIncrementar: agregar,
    setCantidad,
    eliminar,
    limpiar,
    serializarParaApi: serializar,
  }
}
