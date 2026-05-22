import { NextRequest } from "next/server"
import { obtenerPorCodigo } from "@/lib/dominio/inventario"
import { toProductoDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado, errorPeticion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"

type Params = { params: Promise<{ codigo: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { codigo } = await params

    if (!codigo || codigo.length > 48) {
      return errorPeticion("CODIGO_BARRAS_INVALIDO")
    }

    const producto = await obtenerPorCodigo(decodeURIComponent(codigo))

    if (!producto || !producto.activo) {
      return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
    }

    return ok(toProductoDTO(producto))
  } catch (e) {
    return mapPrismaError(e)
  }
}
