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
      codigo_barras: v.codigo_barras,
    })))
  } catch (e) {
    return mapPrismaError(e)
  }
}

const crearVarianteSchema = z.object({
  talla: z.string().min(1).max(20),
  stock_actual: z.number().int().nonnegative().default(0),
  codigo_barras: z.string().max(48).optional().nullable(),
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

      const variante = await prisma.varianteProducto.create({
        data: {
          producto_id: id,
          talla: input.talla.trim().toUpperCase(),
          stock_actual: input.stock_actual,
          codigo_barras: input.codigo_barras ?? null,
        },
      })

      // Actualizar stock_actual del producto (suma de variantes)
      await actualizarStockProducto(id)

      return creado({
        id: variante.id,
        talla: variante.talla,
        stock_actual: variante.stock_actual,
        codigo_barras: variante.codigo_barras,
      })
    } catch (e: any) {
      if (e?.code === "P2002") {
        return errorConflicto("TALLA_DUPLICADA", 409, "Esa talla ya existe para este producto.")
      }
      return mapPrismaError(e)
    }
  })
}

const editarVarianteSchema = z.object({
  variante_id: z.string().uuid(),
  talla: z.string().min(1).max(20).optional(),
  stock_actual: z.number().int().nonnegative().optional(),
  codigo_barras: z.string().max(48).optional().nullable(),
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
        select: { id: true },
      })
      if (!producto) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")

      const variante = await prisma.varianteProducto.findUnique({
        where: { id: input.variante_id },
      })
      if (!variante || variante.producto_id !== id) {
        return errorNoEncontrado("NO_ENCONTRADO", "Variante no encontrada.")
      }

      const updated = await prisma.varianteProducto.update({
        where: { id: input.variante_id },
        data: {
          ...(input.talla !== undefined && { talla: input.talla.trim().toUpperCase() }),
          ...(input.stock_actual !== undefined && { stock_actual: input.stock_actual }),
          ...(input.codigo_barras !== undefined && { codigo_barras: input.codigo_barras }),
        },
      })

      await actualizarStockProducto(id)

      return ok({
        id: updated.id,
        talla: updated.talla,
        stock_actual: updated.stock_actual,
        codigo_barras: updated.codigo_barras,
      })
    } catch (e: any) {
      if (e?.code === "P2002") {
        return errorConflicto("TALLA_DUPLICADA", 409, "Esa talla ya existe para este producto.")
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
        select: { id: true },
      })
      if (!producto) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")

      const variante = await prisma.varianteProducto.findUnique({
        where: { id: input.variante_id },
      })
      if (!variante || variante.producto_id !== id) {
        return errorNoEncontrado("NO_ENCONTRADO", "Variante no encontrada.")
      }

      await prisma.varianteProducto.delete({ where: { id: input.variante_id } })
      await actualizarStockProducto(id)

      return ok({ eliminado: true })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

// Helper: sincronizar stock_actual del producto con la suma de sus variantes
async function actualizarStockProducto(productoId: string): Promise<void> {
  const variantes = await prisma.varianteProducto.findMany({
    where: { producto_id: productoId },
    select: { stock_actual: true },
  })
  if (variantes.length > 0) {
    const total = variantes.reduce((sum, v) => sum + v.stock_actual, 0)
    await prisma.producto.update({
      where: { id: productoId },
      data: { stock_actual: total },
    })
  }
}
