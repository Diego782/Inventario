import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { toMovimientoDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

const querySchema = z.object({
  take: z.coerce.number().int().min(1).max(200).default(50),
  skip: z.coerce.number().int().min(0).default(0),
})

type Params = { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { id } = await params

    // Verificar que el producto existe y pertenece a la organización activa
    const producto = await prisma.producto.findUnique({
      where: { id, organizacion_id: ctx.organizacionActiva!.id },
      select: { id: true },
    })
    if (!producto) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")

    const { searchParams } = req.nextUrl
    const parsed = querySchema.safeParse(Object.fromEntries(searchParams.entries()))
    if (!parsed.success) {
      return errorValidacion(parsed.error.issues.map(i => ({ campo: i.path.join("."), mensaje: i.message })))
    }

    const { take, skip } = parsed.data
    const [items, total] = await Promise.all([
      prisma.movimientoStock.findMany({
        where: { producto_id: id },
        orderBy: { creado_en: "desc" },
        take,
        skip,
      }),
      prisma.movimientoStock.count({ where: { producto_id: id } }),
    ])

    return ok({ items: items.map(toMovimientoDTO), total, take, skip })
  } catch (e) {
    return mapPrismaError(e)
  }
}
