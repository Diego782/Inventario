import { NextRequest } from "next/server"
import { z } from "zod"
import { listarProductos, crearProducto } from "@/lib/dominio/inventario"
import { toProductoDTO } from "@/lib/api/serializadores"
import { ok, creado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearProductoSchema, type CrearProductoInput } from "@/lib/schemas/producto"

// Schema para query params del listado
const listadoQuerySchema = z.object({
  q: z.string().optional(),
  categoria_id: z.string().uuid().optional(),
  estado: z.enum(["En Stock", "Bajo Stock", "Crítico"]).optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = listadoQuerySchema.safeParse(raw)

    if (!parsed.success) {
      const errores = parsed.error.issues.map((i) => ({
        campo: i.path.join("."),
        mensaje: i.message,
      }))
      return errorValidacion(errores)
    }

    const { q, categoria_id, estado, take, skip } = parsed.data
    const { items, total } = await listarProductos({ q, categoria_id, estado, take, skip })

    return ok({
      items: items.map(toProductoDTO),
      total,
      take,
      skip,
    })
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function POST(req: NextRequest) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withValidation<CrearProductoInput>(crearProductoSchema as any, req, async (input) => {
    try {
      const producto = await crearProducto(input)
      return creado(toProductoDTO(producto))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
