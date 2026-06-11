import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { editarProducto, bajaLogica } from "@/lib/dominio/inventario"
import { toProductoDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado, errorPeticion } from "@/lib/api/respuestas"
import { mapPrismaError, UsarAjusteStockError, ProductoNoEncontradoError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { editarProductoSchema } from "@/lib/schemas/producto"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { id } = await params
    const producto = await prisma.producto.findUnique({
      where: { id, organizacion_id: ctx.organizacionActiva!.id },
      include: { variantes: true },
    })

    if (!producto || !producto.activo) {
      return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
    }

    return ok(toProductoDTO(producto))
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  // Verificar si el body intenta cambiar stock_actual
  let body: Record<string, unknown> = {}
  try {
    body = await req.json()
  } catch {
    body = {}
  }

  if ("stock_actual" in body) {
    return errorPeticion("USAR_AJUSTE_STOCK")
  }

  return withValidation(editarProductoSchema, new Request(req.url, {
    method: "PATCH",
    headers: req.headers,
    body: JSON.stringify(body),
  }), async (input) => {
    try {
      const producto = await editarProducto(id, input, ctx.organizacionActiva!.id)
      return ok(toProductoDTO(producto))
    } catch (e) {
      if (e instanceof UsarAjusteStockError) return errorPeticion("USAR_AJUSTE_STOCK")
      if (e instanceof ProductoNoEncontradoError) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
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
    const resultado2 = await bajaLogica(id, ctx.organizacionActiva!.id)
    return ok(resultado2)
  } catch (e) {
    if (e instanceof ProductoNoEncontradoError) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
    return mapPrismaError(e)
  }
}
