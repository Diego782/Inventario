import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearCategoriaSchema } from "@/lib/schemas/categoria"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  return withValidation(crearCategoriaSchema, req, async (input) => {
    try {
      // Verify the category belongs to the active org before updating
      const existente = await prisma.categoria.findFirst({
        where: { id, organizacion_id: ctx.organizacionActiva!.id },
      })
      if (!existente) return errorNoEncontrado("NO_ENCONTRADO", "Categoría no encontrada.")

      const categoria = await prisma.categoria.update({
        where: { id },
        data: { nombre: input.nombre },
      })
      return ok({
        id: categoria.id,
        nombre: categoria.nombre,
        creado_en: categoria.creado_en.toISOString(),
      })
    } catch (e: any) {
      if (e?.code === "P2025") return errorNoEncontrado("NO_ENCONTRADO", "Categoría no encontrada.")
      return mapPrismaError(e)
    }
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "eliminar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  try {
    const { id } = await params

    // Verify the category belongs to the active org before deleting
    const existente = await prisma.categoria.findFirst({
      where: { id, organizacion_id: ctx.organizacionActiva!.id },
    })
    if (!existente) return errorNoEncontrado("NO_ENCONTRADO", "Categoría no encontrada.")

    await prisma.categoria.delete({ where: { id } })
    return ok({ eliminado: true })
  } catch (e: any) {
    if (e?.code === "P2025") return errorNoEncontrado("NO_ENCONTRADO", "Categoría no encontrada.")
    return mapPrismaError(e)
  }
}
