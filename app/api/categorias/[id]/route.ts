import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearCategoriaSchema } from "@/lib/schemas/categoria"

type Params = { params: Promise<{ id: string }> }

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params
  return withValidation(crearCategoriaSchema, req, async (input) => {
    try {
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
  try {
    const { id } = await params
    await prisma.categoria.delete({ where: { id } })
    return ok({ eliminado: true })
  } catch (e: any) {
    if (e?.code === "P2025") return errorNoEncontrado("NO_ENCONTRADO", "Categoría no encontrada.")
    return mapPrismaError(e)
  }
}
