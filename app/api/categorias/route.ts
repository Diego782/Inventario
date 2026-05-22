import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, creado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearCategoriaSchema } from "@/lib/schemas/categoria"

export async function GET() {
  try {
    const categorias = await prisma.categoria.findMany({
      orderBy: { nombre: "asc" },
    })
    return ok(categorias.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      creado_en: c.creado_en.toISOString(),
    })))
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function POST(req: NextRequest) {
  return withValidation(crearCategoriaSchema, req, async (input) => {
    try {
      const categoria = await prisma.categoria.create({
        data: { nombre: input.nombre },
      })
      return creado({
        id: categoria.id,
        nombre: categoria.nombre,
        creado_en: categoria.creado_en.toISOString(),
      })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
