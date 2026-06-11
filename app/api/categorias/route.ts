import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok, creado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearCategoriaSchema } from "@/lib/schemas/categoria"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function GET() {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  try {
    const categorias = await prisma.categoria.findMany({
      where: { organizacion_id: ctx.organizacionActiva!.id },
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
  const resultado = await resolverContexto({ seccion: "inventario", accion: "crear" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  return withValidation(crearCategoriaSchema, req, async (input) => {
    try {
      const categoria = await prisma.categoria.create({
        data: {
          nombre: input.nombre,
          organizacion_id: ctx.organizacionActiva!.id,
        },
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
