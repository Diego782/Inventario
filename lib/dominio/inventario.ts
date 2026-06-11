/**
 * lib/dominio/inventario.ts
 * Capa de dominio para operaciones de inventario.
 * Todas las operaciones que modifican stock usan transacciones Prisma.
 */
import { prisma } from "@/lib/db"
import { generarEan13, detectarFormato } from "@/lib/codigo-barras"
import {
  CodigoBarrasInvalidoError,
  ProductoNoEncontradoError,
  StockNegativoError,
  UsarAjusteStockError,
} from "@/lib/api/errores"
import type { CrearProductoInput, EditarProductoInput, AjusteStockInput } from "@/lib/schemas/producto"
import type { Producto, MovimientoStock } from "@prisma/client"
import { detectarStockCritico, estadoStock } from "@/lib/dominio/notificaciones"

// ---- Helpers ----

/**
 * Genera un código EAN-13 único que no exista en la BD para la organización dada.
 * Intenta hasta 10 veces antes de lanzar error.
 */
async function generarCodigoUnico(organizacion_id: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const codigo = generarEan13("200")
    const existente = await prisma.producto.findFirst({
      where: { codigo_barras: codigo, organizacion_id },
      select: { id: true },
    })
    if (!existente) return codigo
  }
  throw new Error("No se pudo generar un código de barras único después de 10 intentos")
}

/**
 * Valida el código de barras si se proporciona.
 * Lanza CodigoBarrasInvalidoError si el formato no es válido.
 */
function validarCodigoBarras(codigo: string | null | undefined): void {
  if (codigo && detectarFormato(codigo) === null) {
    throw new CodigoBarrasInvalidoError()
  }
}

// ---- Operaciones de dominio ----

/**
 * Crea un nuevo producto en el catálogo para la organización dada.
 * Si no se proporciona código de barras, genera uno EAN-13 único dentro del tenant.
 * Si se pasan `variantes_stock`, crea las variantes con su stock inicial en lugar de
 * usar `stock_actual` directamente.
 */
export async function crearProducto(input: CrearProductoInput, organizacion_id: string): Promise<Producto> {
  validarCodigoBarras(input.codigo_barras)

  const codigoBarras = input.codigo_barras || (await generarCodigoUnico(organizacion_id))

  const tieneVariantes = Array.isArray(input.variantes_stock) && input.variantes_stock.length > 0

  // El stock del producto raíz es la suma de variantes (o el valor directo si no hay variantes)
  const stockTotal = tieneVariantes
    ? input.variantes_stock!.reduce((sum, v) => sum + v.stock, 0)
    : (input.stock_actual ?? 0)

  return prisma.producto.create({
    data: {
      sku: input.sku,
      codigo_barras: codigoBarras,
      nombre: input.nombre,
      categoria_id: input.categoria_id ?? null,
      precio_compra: input.precio_compra ?? 0,
      precio_venta: input.precio_venta,
      stock_actual: stockTotal,
      stock_minimo: input.stock_minimo ?? 0,
      unidad: input.unidad ?? "unidad",
      talla: tieneVariantes ? null : (input.talla ?? null),
      organizacion_id,
      ...(tieneVariantes && {
        variantes: {
          create: input.variantes_stock!.map((v) => ({
            talla: v.talla,
            stock_actual: v.stock,
          })),
        },
      }),
    },
    include: { variantes: true },
  })
}

/**
 * Edita los datos de un producto existente, verificando que pertenezca al tenant.
 * No permite modificar stock_actual directamente (usar ajustarStock).
 */
export async function editarProducto(
  id: string,
  input: EditarProductoInput,
  organizacion_id: string
): Promise<Producto> {
  // Verificar que el producto existe y pertenece al tenant
  const existente = await prisma.producto.findFirst({ where: { id, organizacion_id } })
  if (!existente) throw new ProductoNoEncontradoError()

  // Rechazar cambios a stock_actual
  if ("stock_actual" in input && input.stock_actual !== undefined) {
    throw new UsarAjusteStockError()
  }

  validarCodigoBarras(input.codigo_barras)

  return prisma.producto.update({
    where: { id },
    data: {
      ...(input.sku !== undefined && { sku: input.sku }),
      ...(input.codigo_barras !== undefined && { codigo_barras: input.codigo_barras }),
      ...(input.nombre !== undefined && { nombre: input.nombre }),
      ...(input.categoria_id !== undefined && { categoria_id: input.categoria_id || null }),
      ...(input.precio_compra !== undefined && { precio_compra: input.precio_compra }),
      ...(input.precio_venta !== undefined && { precio_venta: input.precio_venta }),
      ...(input.stock_minimo !== undefined && { stock_minimo: input.stock_minimo }),
      ...(input.unidad !== undefined && { unidad: input.unidad }),
      ...(input.talla !== undefined && { talla: input.talla }),
    },
    include: { variantes: true },
  })
}

/**
 * Realiza la baja lógica de un producto (soft delete), verificando que pertenezca al tenant.
 */
export async function bajaLogica(id: string, organizacion_id: string): Promise<{ id: string; activo: false }> {
  const existente = await prisma.producto.findFirst({ where: { id, organizacion_id } })
  if (!existente) throw new ProductoNoEncontradoError()

  await prisma.producto.update({
    where: { id },
    data: { activo: false },
  })

  return { id, activo: false }
}

/**
 * Ajusta el stock de un producto con registro de movimiento, verificando que pertenezca al tenant.
 * Usa transacción para garantizar atomicidad.
 *
 * La `cantidad` siempre es una magnitud positiva. El signo se determina por `tipo`:
 * - entrada, devolucion → delta positivo (incrementa stock)
 * - salida, merma, ajuste, venta → delta negativo (decrementa stock)
 */
export async function ajustarStock(
  id: string,
  input: AjusteStockInput & { usuario_id?: string },
  organizacion_id: string
): Promise<{ producto: Producto; movimiento: MovimientoStock }> {
  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findFirst({ where: { id, organizacion_id } })
    if (!producto) throw new ProductoNoEncontradoError()

    // Calcular delta según tipo
    const esEntrada = ["entrada", "devolucion"].includes(input.tipo)
    const delta = esEntrada ? input.cantidad : -input.cantidad
    const nuevoStock = producto.stock_actual + delta

    if (nuevoStock < 0) throw new StockNegativoError()

    const [productoActualizado, movimiento] = await Promise.all([
      tx.producto.update({
        where: { id },
        data: { stock_actual: nuevoStock },
      }),
      tx.movimientoStock.create({
        data: {
          producto_id: id,
          tipo: input.tipo as any,
          cantidad: delta,
          stock_resultante: nuevoStock,
          motivo: input.motivo?.slice(0, 240) ?? null,
          usuario_id: input.usuario_id ?? null,
          organizacion_id,
        },
      }),
    ])

    // Detección de stock crítico dentro de la misma transacción (R7.1, R7.2, R7.3,
    // R7.6, R7.7). Sólo crea notificación en la transición no-Crítico ⇒ Crítico.
    await detectarStockCritico(
      tx,
      {
        producto_id: id,
        nombre: producto.nombre,
        stock_actual: nuevoStock,
        stock_minimo: producto.stock_minimo,
      },
      estadoStock(producto.stock_actual, producto.stock_minimo),
    )

    return { producto: productoActualizado, movimiento }
  })
}

/**
 * Obtiene un producto por su código de barras dentro del tenant.
 */
export async function obtenerPorCodigo(codigo: string, organizacion_id: string): Promise<Producto | null> {
  return prisma.producto.findFirst({
    where: { codigo_barras: codigo, organizacion_id },
  })
}

/**
 * Lista productos con filtros y paginación, filtrados por tenant.
 *
 * Filtros avanzados (opcionales) — se combinan con AND:
 * - `nombre` / `sku`: coincidencia parcial (contains).
 * - `unidad` / `talla`: coincidencia exacta.
 * - `categoria_id`: coincidencia exacta.
 * - rangos `*_min` / `*_max` sobre precio de venta, precio de compra,
 *   stock mínimo y stock actual (inicial).
 *
 * `q` mantiene la búsqueda rápida OR (nombre / sku / código de barras).
 */
export async function listarProductos(params: {
  q?: string
  nombre?: string
  sku?: string
  unidad?: string
  talla?: string
  categoria_id?: string
  estado?: string
  precio_venta_min?: number
  precio_venta_max?: number
  precio_compra_min?: number
  precio_compra_max?: number
  stock_minimo_min?: number
  stock_minimo_max?: number
  stock_actual_min?: number
  stock_actual_max?: number
  take?: number
  skip?: number
  organizacion_id: string
}): Promise<{ items: Producto[]; total: number }> {
  const {
    q,
    nombre,
    sku,
    unidad,
    talla,
    categoria_id,
    precio_venta_min,
    precio_venta_max,
    precio_compra_min,
    precio_compra_max,
    stock_minimo_min,
    stock_minimo_max,
    stock_actual_min,
    stock_actual_max,
    take = 20,
    skip = 0,
    organizacion_id,
  } = params

  const where: any = { activo: true, organizacion_id }

  if (q) {
    where.OR = [
      { nombre: { contains: q } },
      { sku: { contains: q } },
      { codigo_barras: { contains: q } },
    ]
  }

  if (nombre) where.nombre = { contains: nombre }
  if (sku) where.sku = { contains: sku }
  if (unidad) where.unidad = unidad
  if (talla) where.talla = talla
  if (categoria_id) where.categoria_id = categoria_id

  // Helper: construye un filtro de rango { gte?, lte? } sólo si hay límites
  const rango = (min?: number, max?: number) => {
    const r: { gte?: number; lte?: number } = {}
    if (min !== undefined) r.gte = min
    if (max !== undefined) r.lte = max
    return Object.keys(r).length > 0 ? r : undefined
  }

  const precioVenta = rango(precio_venta_min, precio_venta_max)
  if (precioVenta) where.precio_venta = precioVenta

  const precioCompra = rango(precio_compra_min, precio_compra_max)
  if (precioCompra) where.precio_compra = precioCompra

  const stockMinimo = rango(stock_minimo_min, stock_minimo_max)
  if (stockMinimo) where.stock_minimo = stockMinimo

  const stockActual = rango(stock_actual_min, stock_actual_max)
  if (stockActual) where.stock_actual = stockActual

  const [items, total] = await Promise.all([
    prisma.producto.findMany({ where, take, skip, orderBy: { nombre: "asc" }, include: { variantes: true } }),
    prisma.producto.count({ where }),
  ])

  return { items, total }
}
