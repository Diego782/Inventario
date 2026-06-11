import { NextRequest } from "next/server"
import { obtenerPorCodigo } from "@/lib/dominio/inventario"
import { toProductoDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado, errorPeticion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ codigo: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { codigo } = await params

    if (!codigo || codigo.length > 48) {
      return errorPeticion("CODIGO_BARRAS_INVALIDO")
    }

    const producto = await obtenerPorCodigo(
      decodeURIComponent(codigo),
      ctx.organizacionActiva!.id
    )

    if (!producto || !producto.activo) {
      return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
    }

    return ok(toProductoDTO(producto))
  } catch (e) {
    return mapPrismaError(e)
  }
}
