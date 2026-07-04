import { NextRequest } from "next/server"
import { listarProductos, crearProducto } from "@/lib/dominio/inventario"
import { toProductoDTO } from "@/lib/api/serializadores"
import { ok, creado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearProductoSchema, listadoProductosSchema, type CrearProductoInput } from "@/lib/schemas/producto"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function GET(req: NextRequest) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { searchParams } = req.nextUrl
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = listadoProductosSchema.safeParse(raw)

    if (!parsed.success) {
      const errores = parsed.error.issues.map((i) => ({
        campo: i.path.join("."),
        mensaje: i.message,
      }))
      return errorValidacion(errores)
    }

    const {
      q,
      categoria_id,
      estado,
      take,
      skip,
      stock_min,
      stock_max,
      solo_critico,
      nombre,
      unidad,
      talla,
      precio_venta_min,
      precio_venta_max,
      precio_compra_min,
      precio_compra_max,
      stock_minimo_min,
      stock_minimo_max,
    } = parsed.data

    const { items, total } = await listarProductos({
      q,
      categoria_id,
      estado,
      take,
      skip,
      nombre,
      unidad,
      talla,
      precio_venta_min,
      precio_venta_max,
      precio_compra_min,
      precio_compra_max,
      stock_minimo_min,
      stock_minimo_max,
      stock_min,
      stock_max,
      solo_critico,
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
