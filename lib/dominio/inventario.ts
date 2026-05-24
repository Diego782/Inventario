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

// ---- Helpers ----

/**
 * Genera un código EAN-13 único que no exista en la BD.
 * Intenta hasta 10 veces antes de lanzar error.
 */
async function generarCodigoUnico(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const codigo = generarEan13("200")
    const existente = await prisma.producto.findUnique({
      where: { codigo_barras: codigo },
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
 * Crea un nuevo producto en el catálogo.
 * Si no se proporciona código de barras, genera uno EAN-13 único.
 */
export async function crearProducto(input: CrearProductoInput): Promise<Producto> {
  validarCodigoBarras(input.codigo_barras)

  const codigoBarras = input.codigo_barras || (await generarCodigoUnico())

  return prisma.producto.create({
    data: {
      sku: input.sku,
      codigo_barras: codigoBarras,
      nombre: input.nombre,
      ...(input.categoria_id ? { categoria: { connect: { id: input.categoria_id } } } : {}),
      precio_compra: input.precio_compra ?? 0,
      precio_venta: input.precio_venta,
      stock_actual: input.stock_actual ?? 0,
      stock_minimo: input.stock_minimo ?? 0,
      unidad: input.unidad ?? "unidad",
      talla: input.talla ?? null,
    },
    include: { variantes: true },
  })
}

/**
 * Edita los datos de un producto existente.
 * No permite modificar stock_actual directamente (usar ajustarStock).
 */
export async function editarProducto(
  id: string,
  input: EditarProductoInput
): Promise<Producto> {
  // Verificar que el producto existe
  const existente = await prisma.producto.findUnique({ where: { id } })
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
      ...(input.categoria_id !== undefined && {
        categoria: input.categoria_id
          ? { connect: { id: input.categoria_id } }
          : { disconnect: true },
      }),
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
 * Realiza la baja lógica de un producto (soft delete).
 */
export async function bajaLogica(id: string): Promise<{ id: string; activo: false }> {
  const existente = await prisma.producto.findUnique({ where: { id } })
  if (!existente) throw new ProductoNoEncontradoError()

  await prisma.producto.update({
    where: { id },
    data: { activo: false },
  })

  return { id, activo: false }
}

/**
 * Ajusta el stock de un producto con registro de movimiento.
 * Usa transacción para garantizar atomicidad.
 *
 * La `cantidad` siempre es una magnitud positiva. El signo se determina por `tipo`:
 * - entrada, devolucion → delta positivo (incrementa stock)
 * - salida, merma, ajuste, venta → delta negativo (decrementa stock)
 */
export async function ajustarStock(
  id: string,
  input: AjusteStockInput & { usuario_id?: string }
): Promise<{ producto: Producto; movimiento: MovimientoStock }> {
  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findUnique({ where: { id } })
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
        },
      }),
    ])

    return { producto: productoActualizado, movimiento }
  })
}

/**
 * Obtiene un producto por su código de barras.
 */
export async function obtenerPorCodigo(codigo: string): Promise<Producto | null> {
  return prisma.producto.findUnique({
    where: { codigo_barras: codigo },
  })
}

/**
 * Lista productos con filtros y paginación.
 */
export async function listarProductos(params: {
  q?: string
  categoria_id?: string
  estado?: string
  take?: number
  skip?: number
}): Promise<{ items: Producto[]; total: number }> {
  const { q, categoria_id, take = 20, skip = 0 } = params

  const where: any = { activo: true }

  if (q) {
    where.OR = [
      { nombre: { contains: q } },
      { sku: { contains: q } },
      { codigo_barras: { contains: q } },
    ]
  }

  if (categoria_id) {
    where.categoria_id = categoria_id
  }

  const [items, total] = await Promise.all([
    prisma.producto.findMany({ where, take, skip, orderBy: { nombre: "asc" }, include: { variantes: true } }),
    prisma.producto.count({ where }),
  ])

  return { items, total }
}
