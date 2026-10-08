import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ok, creado, errorNoEncontrado, errorConflicto } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ id: string }> }

// Listar variantes de un producto
export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { id } = await params

    // Verificar que el producto pertenece a la organización activa
    const producto = await prisma.producto.findUnique({
      where: { id, organizacion_id: ctx.organizacionActiva!.id },
      select: { id: true },
    })
    if (!producto) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")

    const variantes = await prisma.varianteProducto.findMany({
      where: { producto_id: id },
      orderBy: { talla: "asc" },
    })
    return ok(variantes.map((v) => ({
      id: v.id,
      talla: v.talla,
      stock_actual: v.stock_actual,
      stock_minimo: v.stock_minimo,
      codigo_barras: v.codigo_barras,
      precio_compra: v.precio_compra === null ? null : Number(v.precio_compra),
      precio_venta: v.precio_venta === null ? null : Number(v.precio_venta),
    })))
  } catch (e) {
    return mapPrismaError(e)
  }
}

const crearVarianteSchema = z.object({
  talla: z.string().min(1).max(20),
  stock_actual: z.number().int().nonnegative().optional(),
  stock_minimo: z.number().int().nonnegative().optional(),
  codigo_barras: z.string().max(48).optional().nullable(),
  precio_compra: z.number().finite().nonnegative().nullable().optional(),
  precio_venta: z.number().finite().nonnegative().nullable().optional(),
})

// Crear una nueva variante (talla) para un producto
export async function POST(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  return withValidation(crearVarianteSchema, req, async (input) => {
    try {
      const producto = await prisma.producto.findUnique({
        where: { id, organizacion_id: ctx.organizacionActiva!.id },
      })
      if (!producto || !producto.activo) {
        return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
      }
      if (producto.precio_por_variante && (input.precio_compra == null || input.precio_venta == null)) {
        return errorConflicto("PRECIO_VARIANTE_INVALIDO", 422)
      }
      const variantesExistentes = await prisma.varianteProducto.count({ where: { producto_id: id } })
      if (producto.controla_vencimiento && variantesExistentes > 0 && (input.stock_actual ?? 0) > 0) {
        return errorConflicto("LOTE_INVALIDO", 422, "Crea la variante sin stock y registra la entrada con fecha de vencimiento.")
      }
      if (producto.controla_vencimiento && variantesExistentes === 0 &&
          input.stock_actual !== undefined && input.stock_actual !== producto.stock_actual) {
        return errorConflicto("LOTE_INVALIDO", 422, "La primera variante debe conservar el stock actual del producto.")
      }

      const variante = await prisma.varianteProducto.create({
        data: {
          producto_id: id,
          talla: input.talla.trim().toUpperCase(),
          stock_actual: input.stock_actual ?? (variantesExistentes === 0 ? producto.stock_actual : 0),
          stock_minimo: input.stock_minimo ?? (variantesExistentes === 0 ? producto.stock_minimo : 0),
          codigo_barras: input.codigo_barras ?? null,
          precio_compra: producto.precio_por_variante ? input.precio_compra : null,
          precio_venta: producto.precio_por_variante ? input.precio_venta : null,
        },
      })

      if (producto.controla_vencimiento && variantesExistentes === 0) {
        await prisma.loteProducto.updateMany({ where: { producto_id: id, variante_id: null }, data: { variante_id: variante.id } })
      }

      // Actualizar stock_actual del producto (suma de variantes)
      await actualizarStockProducto(id)

      return creado({
        id: variante.id,
        talla: variante.talla,
        stock_actual: variante.stock_actual,
        stock_minimo: variante.stock_minimo,
        codigo_barras: variante.codigo_barras,
        precio_compra: variante.precio_compra === null ? null : Number(variante.precio_compra),
        precio_venta: variante.precio_venta === null ? null : Number(variante.precio_venta),
      })
    } catch (e: any) {
      if (e?.code === "P2002") {
        return errorConflicto("TALLA_DUPLICADA", 409, "Esa variante ya existe para este producto.")
      }
      return mapPrismaError(e)
    }
  })
}

const editarVarianteSchema = z.object({
  variante_id: z.string().uuid(),
  talla: z.string().min(1).max(20).optional(),
  stock_actual: z.number().int().nonnegative().optional(),
  stock_minimo: z.number().int().nonnegative().optional(),
  codigo_barras: z.string().max(48).optional().nullable(),
  precio_compra: z.number().finite().nonnegative().nullable().optional(),
  precio_venta: z.number().finite().nonnegative().nullable().optional(),
})

// Editar una variante (PUT)
export async function PUT(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  return withValidation(editarVarianteSchema, req, async (input) => {
    try {
      // Verificar que el producto pertenece a la organización activa
      const producto = await prisma.producto.findUnique({
        where: { id, organizacion_id: ctx.organizacionActiva!.id },
        select: { id: true, precio_por_variante: true, controla_vencimiento: true },
      })
      if (!producto) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")

      const variante = await prisma.varianteProducto.findUnique({
        where: { id: input.variante_id },
      })
      if (!variante || variante.producto_id !== id) {
        return errorNoEncontrado("NO_ENCONTRADO", "Variante no encontrada.")
      }
      if (producto.precio_por_variante && (input.precio_compra === null || input.precio_venta === null)) {
        return errorConflicto("PRECIO_VARIANTE_INVALIDO", 422)
      }
      if (producto.controla_vencimiento && input.stock_actual !== undefined && input.stock_actual !== variante.stock_actual) {
        return errorConflicto("LOTE_INVALIDO", 422, "Modifica el stock desde los lotes de vencimiento.")
      }

      const updated = await prisma.varianteProducto.update({
        where: { id: input.variante_id },
        data: {
          ...(input.talla !== undefined && { talla: input.talla.trim().toUpperCase() }),
          ...(input.stock_actual !== undefined && { stock_actual: input.stock_actual }),
          ...(input.stock_minimo !== undefined && { stock_minimo: input.stock_minimo }),
          ...(input.codigo_barras !== undefined && { codigo_barras: input.codigo_barras }),
          ...(input.precio_compra !== undefined && producto.precio_por_variante && { precio_compra: input.precio_compra }),
          ...(input.precio_venta !== undefined && producto.precio_por_variante && { precio_venta: input.precio_venta }),
        },
      })

      await actualizarStockProducto(id)

      return ok({
        id: updated.id,
        talla: updated.talla,
        stock_actual: updated.stock_actual,
        stock_minimo: updated.stock_minimo,
        codigo_barras: updated.codigo_barras,
        precio_compra: updated.precio_compra === null ? null : Number(updated.precio_compra),
        precio_venta: updated.precio_venta === null ? null : Number(updated.precio_venta),
      })
    } catch (e: any) {
      if (e?.code === "P2002") {
        return errorConflicto("TALLA_DUPLICADA", 409, "Esa variante ya existe para este producto.")
      }
      return mapPrismaError(e)
    }
  })
}

const eliminarVarianteSchema = z.object({
  variante_id: z.string().uuid(),
})

// Eliminar una variante (DELETE)
export async function DELETE(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  return withValidation(eliminarVarianteSchema, req, async (input) => {
    try {
      // Verificar que el producto pertenece a la organización activa
      const producto = await prisma.producto.findUnique({
        where: { id, organizacion_id: ctx.organizacionActiva!.id },
        select: { id: true, controla_vencimiento: true },
      })
      if (!producto) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")

      const variante = await prisma.varianteProducto.findUnique({
        where: { id: input.variante_id },
      })
      if (!variante || variante.producto_id !== id) {
        return errorNoEncontrado("NO_ENCONTRADO", "Variante no encontrada.")
      }
      if (producto.controla_vencimiento && variante.stock_actual > 0) {
        return errorConflicto("LOTE_INVALIDO", 422, "Agota o descarta el stock antes de eliminar la variante.")
      }
      const lotesConStock = await prisma.loteProducto.count({ where: { variante_id: variante.id, stock_actual: { gt: 0 } } })
      if (lotesConStock) {
        return errorConflicto("LOTE_INVALIDO", 422, "Descarta o vende los lotes antes de eliminar la variante.")
      }

      await prisma.varianteProducto.delete({ where: { id: input.variante_id } })
      await actualizarStockProducto(id)

      return ok({ eliminado: true })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

// Helper: sincronizar stock y mínimo del producto con la suma de sus variantes
async function actualizarStockProducto(productoId: string): Promise<void> {
  const variantes = await prisma.varianteProducto.findMany({
    where: { producto_id: productoId },
    select: { stock_actual: true, stock_minimo: true },
  })
  await prisma.producto.update({
    where: { id: productoId },
    data: {
      stock_actual: variantes.reduce((sum, v) => sum + v.stock_actual, 0),
      stock_minimo: variantes.reduce((sum, v) => sum + v.stock_minimo, 0),
    },
  })
}
