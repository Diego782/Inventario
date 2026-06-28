import { NextRequest } from "next/server"
import { z } from "zod"
import { listarProductos, crearProducto } from "@/lib/dominio/inventario"
import { toProductoDTO } from "@/lib/api/serializadores"
import { ok, creado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearProductoSchema, type CrearProductoInput } from "@/lib/schemas/producto"
import { resolverContexto } from "@/lib/auth/contexto-request"

// Schema para query params del listado
const listadoQuerySchema = z
  .object({
    q: z.string().optional(),
    nombre: z.string().optional(),
    unidad: z.string().optional(),
    talla: z.string().optional(),
    categoria_id: z.string().uuid().optional(),
    estado: z.enum(["En Stock", "Bajo Stock", "Crítico"]).optional(),
    precio_venta_min: z.coerce.number().nonnegative().optional(),
    precio_venta_max: z.coerce.number().nonnegative().optional(),
    precio_compra_min: z.coerce.number().nonnegative().optional(),
    precio_compra_max: z.coerce.number().nonnegative().optional(),
    stock_minimo_min: z.coerce.number().int().min(0).optional(),
    stock_minimo_max: z.coerce.number().int().min(0).optional(),
    stock_actual_min: z.coerce.number().int().min(0).optional(),
    stock_actual_max: z.coerce.number().int().min(0).optional(),
    take: z.coerce.number().int().min(1).max(100).default(20),
    skip: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((v, ctx) => {
    const rangos: Array<[string, number | undefined, number | undefined]> = [
      ["precio_venta", v.precio_venta_min, v.precio_venta_max],
      ["precio_compra", v.precio_compra_min, v.precio_compra_max],
      ["stock_minimo", v.stock_minimo_min, v.stock_minimo_max],
      ["stock_actual", v.stock_actual_min, v.stock_actual_max],
    ]
    for (const [campo, min, max] of rangos) {
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({
          code: "custom",
          path: [`${campo}_min`],
          message: "El valor mínimo no puede ser mayor que el máximo.",
        })
      }
    }
  })

export async function GET(req: NextRequest) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

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

    const { q, categoria_id, estado, take, skip, ...filtros } = parsed.data
    const { items, total } = await listarProductos({
      q,
      categoria_id,
      estado,
      take,
      skip,
      ...filtros,
      organizacion_id: ctx.organizacionActiva!.id,
    })

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
  const resultado = await resolverContexto({ seccion: "inventario", accion: "crear" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return withValidation<CrearProductoInput>(crearProductoSchema as any, req, async (input) => {
    try {
      const producto = await crearProducto(input, ctx.organizacionActiva!.id)
      return creado(toProductoDTO(producto))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
