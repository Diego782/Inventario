/**
 * lib/dominio/ventas.ts
 * Capa de dominio para operaciones de ventas.
 * registrarVenta ejecuta una transacción atómica que:
 * 1. Valida stock por ítem
 * 2. Calcula totales con redondeo bancario
 * 3. Genera folio único dentro de la misma transacción
 * 4. Inserta venta + items + movimientos de stock
 * 5. Descuenta stock de cada producto
 */
import { prisma } from "@/lib/db"
import { generarFolio } from "@/lib/dominio/folio"
import { redondearBancario } from "@/lib/money"
import {
  StockNegativoError,
  LimiteFolioDiarioError,
  VentaFallidaError,
} from "@/lib/api/errores"
import { detectarStockCritico, estadoStock } from "@/lib/dominio/notificaciones"
import { CONFIG_DEFAULTS, COLOR_TEMA_DEGO } from "@/lib/schemas/configuracion"
import type { ConfiguracionMap } from "@/lib/schemas/configuracion"
import type { CrearVentaInput } from "@/lib/schemas/venta"
import type { Venta, VentaItem } from "@prisma/client"

// ---- Tipos ----

export type VentaConItems = Venta & { items: VentaItem[] }

// ---- Helpers ----

/**
 * Lee la configuración desde la BD dentro de una transacción.
 * Aplica defaults para claves faltantes.
 */
async function leerConfiguracionTx(tx: any, organizacion_id: string): Promise<ConfiguracionMap> {
  const filas = await tx.configuracion.findMany({
    where: {
      organizacion_id,
      clave: {
        in: [
          "porcentaje_impuesto",
          "permitir_sobreventa",
          "etiqueta_ancho_mm",
          "etiqueta_alto_mm",
          "ticket_ancho_mm",
          "imprimir_automaticamente",
        ],
      },
    },
  })

  const mapa: Record<string, string> = {}
  for (const fila of filas) {
    mapa[fila.clave] = fila.valor
  }

  return {
    porcentaje_impuesto:
      mapa.porcentaje_impuesto !== undefined
        ? parseFloat(mapa.porcentaje_impuesto)
        : CONFIG_DEFAULTS.porcentaje_impuesto,
    permitir_sobreventa:
      mapa.permitir_sobreventa !== undefined
        ? mapa.permitir_sobreventa === "true"
        : CONFIG_DEFAULTS.permitir_sobreventa,
    etiqueta_ancho_mm:
      mapa.etiqueta_ancho_mm !== undefined
        ? parseInt(mapa.etiqueta_ancho_mm, 10)
        : CONFIG_DEFAULTS.etiqueta_ancho_mm,
    etiqueta_alto_mm:
      mapa.etiqueta_alto_mm !== undefined
        ? parseInt(mapa.etiqueta_alto_mm, 10)
        : CONFIG_DEFAULTS.etiqueta_alto_mm,
    ticket_ancho_mm:
      mapa.ticket_ancho_mm !== undefined
        ? parseInt(mapa.ticket_ancho_mm, 10)
        : CONFIG_DEFAULTS.ticket_ancho_mm,
    imprimir_automaticamente:
      mapa.imprimir_automaticamente !== undefined
        ? mapa.imprimir_automaticamente === "true"
        : CONFIG_DEFAULTS.imprimir_automaticamente,
    // El cálculo de ventas no usa el Color_Tema; se incluyen los defaults de
    // Marca Dego para mantener la coherencia de tipo con ConfiguracionMap.
    ...COLOR_TEMA_DEGO,
  }
}

// ---- Operaciones de dominio ----

/**
 * Registra una venta de forma atómica.
 * Toda la operación ocurre en una sola transacción Prisma con timeout de 10s.
 * Si cualquier paso falla, se revierte todo sin alterar el stock.
 */
export async function registrarVenta(
  input: CrearVentaInput & { usuario_id?: string; organizacion_id: string }
): Promise<VentaConItems> {
  try {
    return await prisma.$transaction(
      async (tx) => {
        // 1. Leer configuración dentro de la transacción
        const cfg = await leerConfiguracionTx(tx, input.organizacion_id)

        // 2. Obtener productos con lock (SELECT para validación)
        const productoIds = input.items.map((i) => i.producto_id)
        const productos = await tx.producto.findMany({
          where: { id: { in: productoIds }, activo: true, organizacion_id: input.organizacion_id },
        })

        // Verificar que todos los productos existen
        if (productos.length !== productoIds.length) {
          throw new VentaFallidaError(
            "Uno o más productos no encontrados o inactivos"
          )
        }

        const productoMap = new Map(productos.map((p: any) => [p.id, p]))

        // 2b. Cargar variantes referenciadas por los ítems (si las hay)
        const varianteIds = input.items
          .map((i) => i.variante_id)
          .filter((v): v is string => !!v)
        const variantes = varianteIds.length
          ? await tx.varianteProducto.findMany({ where: { id: { in: varianteIds } } })
          : []
        const varianteMap = new Map(variantes.map((v: any) => [v.id, v]))

        // 3. Validar stock por ítem (contra la variante si se indicó, si no contra el producto)
        for (const item of input.items) {
          const producto = productoMap.get(item.producto_id)
          if (!producto)
            throw new VentaFallidaError(
              `Producto ${item.producto_id} no encontrado`
            )

          if (item.variante_id) {
            const variante = varianteMap.get(item.variante_id)
            if (!variante || variante.producto_id !== item.producto_id) {
              throw new VentaFallidaError(
                `Variante ${item.variante_id} no encontrada`
              )
            }
            if (!cfg.permitir_sobreventa && item.cantidad > variante.stock_actual) {
              throw new StockNegativoError()
            }
          } else {
            const stockDisponible = (producto as any).stock_actual
            if (!cfg.permitir_sobreventa && item.cantidad > stockDisponible) {
              throw new StockNegativoError()
            }
          }
        }

        // 4. Calcular totales con redondeo bancario (defensa en profundidad)
        const subtotal = redondearBancario(
          input.items.reduce(
            (acc, i) => acc + i.precio_unitario * i.cantidad,
            0
          )
        )
        const impuesto = redondearBancario(
          (subtotal * cfg.porcentaje_impuesto) / 100
        )
        const total = redondearBancario(subtotal + impuesto)

        // 5. Generar folio único dentro de la misma transacción
        const folio = await generarFolio(tx, new Date(), input.organizacion_id)

        // 6. Insertar la venta
        const venta = await tx.venta.create({
          data: {
            folio,
            subtotal,
            impuesto,
            total,
            metodo_pago: input.metodo_pago as any,
            fiador_id: input.fiador_id ?? null,
            usuario_id: input.usuario_id ?? null,
            organizacion_id: input.organizacion_id,
            estado: "completada",
          },
        })

        // 7. Insertar items y actualizar stock + movimientos
        const itemsCreados: VentaItem[] = []

        for (const item of input.items) {
          const producto = productoMap.get(item.producto_id) as any
          const subtotalLinea = redondearBancario(
            item.precio_unitario * item.cantidad
          )

          // Insertar item de venta (registra la variante si aplica)
          const ventaItem = await tx.ventaItem.create({
            data: {
              venta_id: venta.id,
              producto_id: item.producto_id,
              variante_id: item.variante_id ?? null,
              cantidad: item.cantidad,
              precio_unitario: item.precio_unitario,
              subtotal_linea: subtotalLinea,
              organizacion_id: input.organizacion_id,
            },
          })
          itemsCreados.push(ventaItem)

          // Estado de stock previo del PRODUCTO (suma de variantes o stock directo),
          // capturado ANTES del update para detectar transición a Crítico (R7.1, R7.6).
          const estadoPrevio = estadoStock(producto.stock_actual, producto.stock_minimo)

          let nuevoStockProducto: number

          if (item.variante_id) {
            // Descontar del stock de la variante
            const variante = varianteMap.get(item.variante_id) as any
            const nuevoStockVariante = variante.stock_actual - item.cantidad
            await tx.varianteProducto.update({
              where: { id: item.variante_id },
              data: { stock_actual: nuevoStockVariante },
            })
            // Mantener el snapshot local sincronizado por si hay varios ítems de la misma variante
            variante.stock_actual = nuevoStockVariante

            // El stock del producto es la suma de todas sus variantes
            const variantesProducto = await tx.varianteProducto.findMany({
              where: { producto_id: item.producto_id },
              select: { stock_actual: true },
            })
            nuevoStockProducto = variantesProducto.reduce((s, v) => s + v.stock_actual, 0)
          } else {
            nuevoStockProducto = producto.stock_actual - item.cantidad
          }

          // Actualizar stock del producto (raíz)
          await tx.producto.update({
            where: { id: item.producto_id },
            data: { stock_actual: nuevoStockProducto },
          })
          producto.stock_actual = nuevoStockProducto

          // Registrar movimiento de stock
          await tx.movimientoStock.create({
            data: {
              producto_id: item.producto_id,
              tipo: "venta",
              cantidad: -item.cantidad,
              stock_resultante: nuevoStockProducto,
              motivo: item.variante_id
                ? `Venta ${folio} (talla ${(varianteMap.get(item.variante_id) as any)?.talla ?? ""})`
                : `Venta ${folio}`,
              referencia_id: venta.id,
              usuario_id: input.usuario_id ?? null,
              organizacion_id: input.organizacion_id,
            },
          })

          // Detectar transición a stock crítico dentro de la misma transacción.
          await detectarStockCritico(
            tx,
            {
              producto_id: item.producto_id,
              nombre: producto.nombre,
              stock_actual: nuevoStockProducto,
              stock_minimo: producto.stock_minimo,
              organizacion_id: input.organizacion_id,
            },
            estadoPrevio
          )
        }

        return { ...venta, items: itemsCreados }
      },
      { timeout: 10000 }
    )
  } catch (e) {
    // Re-lanzar errores de dominio conocidos
    if (
      e instanceof StockNegativoError ||
      e instanceof LimiteFolioDiarioError ||
      e instanceof VentaFallidaError
    ) {
      throw e
    }
    // Envolver errores desconocidos
    throw new VentaFallidaError(e)
  }
}

/**
 * Lista ventas con filtros y paginación.
 *
 * Filtros avanzados (opcionales) — se combinan con AND:
 * - `producto`: nombre del producto vendido (coincidencia parcial sobre los ítems).
 * - `metodo_pago`: método de pago exacto.
 * - rango `total_min` / `total_max` sobre el total de la venta.
 * - rango de fechas `desde` / `hasta` sobre `creado_en`.
 *
 * `q` mantiene la búsqueda rápida sobre folio y método de pago.
 */
export async function listarVentas(params: {
  q?: string
  producto?: string
  metodo_pago?: string
  total_min?: number
  total_max?: number
  desde?: string
  hasta?: string
  take?: number
  skip?: number
  organizacion_id: string
}): Promise<{ items: VentaConItems[]; total: number }> {
  const {
    q,
    producto,
    metodo_pago,
    total_min,
    total_max,
    desde,
    hasta,
    take = 20,
    skip = 0,
    organizacion_id,
  } = params

  const where: any = { organizacion_id }

  if (q) {
    // Búsqueda rápida: folio o método de pago
    const condiciones: any[] = [{ folio: { contains: q } }]
    const metodosValidos = ["efectivo", "tarjeta", "transferencia", "fiado"]
    const qNormalizado = q.trim().toLowerCase()
    if (metodosValidos.includes(qNormalizado)) {
      condiciones.push({ metodo_pago: qNormalizado })
    }
    where.OR = condiciones
  }

  if (metodo_pago) where.metodo_pago = metodo_pago

  if (producto) {
    // Filtra ventas que tengan al menos un ítem cuyo producto coincida por nombre
    where.items = {
      some: {
        producto: { nombre: { contains: producto } },
      },
    }
  }

  if (total_min !== undefined || total_max !== undefined) {
    where.total = {}
    if (total_min !== undefined) where.total.gte = total_min
    if (total_max !== undefined) where.total.lte = total_max
  }

  if (desde || hasta) {
    where.creado_en = {}
    if (desde) where.creado_en.gte = new Date(desde)
    if (hasta) where.creado_en.lte = new Date(hasta)
  }

  const [items, total] = await Promise.all([
    prisma.venta.findMany({
      where,
      take,
      skip,
      orderBy: { creado_en: "desc" },
      include: { items: true },
    }),
    prisma.venta.count({ where }),
  ])

  return { items, total }
}

/**
 * Obtiene una venta por ID con sus items, restringida al tenant.
 * Retorna null si no existe o pertenece a otro tenant (el caller decide si lanzar 404).
 */
export async function obtenerVenta(id: string, organizacion_id: string): Promise<VentaConItems | null> {
  return prisma.venta.findFirst({
    where: { id, organizacion_id },
    include: { items: { include: { producto: true, variante: true } } },
  })
}

/**
 * Edita el método de pago y/o estado de una venta existente.
 * No modifica los ítems ni el stock (edición ligera de metadatos).
 * Retorna null si la venta no existe o pertenece a otro tenant.
 */
export async function editarVenta(
  id: string,
  organizacion_id: string,
  cambios: { metodo_pago?: string; estado?: string }
): Promise<VentaConItems | null> {
  const venta = await prisma.venta.findFirst({
    where: { id, organizacion_id },
  })
  if (!venta) return null

  const data: any = {}
  if (cambios.metodo_pago !== undefined) data.metodo_pago = cambios.metodo_pago
  if (cambios.estado !== undefined) data.estado = cambios.estado

  await prisma.venta.update({ where: { id }, data })

  return prisma.venta.findFirst({
    where: { id, organizacion_id },
    include: { items: { include: { producto: true, variante: true } } },
  })
}

/**
 * Elimina una venta de forma atómica, revirtiendo el stock vendido.
 * 1. Verifica que la venta pertenezca al tenant.
 * 2. Devuelve el stock de cada ítem al producto correspondiente.
 * 3. Registra un movimiento de stock de tipo "ajuste" por la reversión.
 * 4. Elimina los ítems (cascade) y la venta.
 * Retorna true si se eliminó, false si no existía.
 */
export async function eliminarVenta(id: string, organizacion_id: string): Promise<boolean> {
  return await prisma.$transaction(async (tx) => {
    const venta = await tx.venta.findFirst({
      where: { id, organizacion_id },
      include: { items: true },
    })
    if (!venta) return false

    // Revertir stock de cada ítem
    for (const item of venta.items) {
      // Si el ítem se vendió contra una variante, devolver el stock a la variante
      if (item.variante_id) {
        const variante = await tx.varianteProducto.findFirst({
          where: { id: item.variante_id, producto_id: item.producto_id },
        })
        if (variante) {
          await tx.varianteProducto.update({
            where: { id: variante.id },
            data: { stock_actual: variante.stock_actual + item.cantidad },
          })
        }
      }

      const producto = await tx.producto.findFirst({
        where: { id: item.producto_id, organizacion_id },
      })
      if (producto) {
        // Recalcular el stock del producto: suma de variantes si tiene, si no suma directa
        const variantesProducto = await tx.varianteProducto.findMany({
          where: { producto_id: item.producto_id },
          select: { stock_actual: true },
        })
        const nuevoStock =
          variantesProducto.length > 0
            ? variantesProducto.reduce((s, v) => s + v.stock_actual, 0)
            : producto.stock_actual + item.cantidad
        await tx.producto.update({
          where: { id: item.producto_id },
          data: { stock_actual: nuevoStock },
        })
        await tx.movimientoStock.create({
          data: {
            producto_id: item.producto_id,
            tipo: "ajuste",
            cantidad: item.cantidad,
            stock_resultante: nuevoStock,
            motivo: `Reversión por eliminación de venta ${venta.folio}`,
            referencia_id: venta.id,
            organizacion_id,
          },
        })
      }
    }

    // Eliminar ítems y venta
    await tx.ventaItem.deleteMany({ where: { venta_id: id } })
    await tx.venta.delete({ where: { id } })

    return true
  })
}
