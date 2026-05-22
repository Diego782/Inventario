import { NextRequest } from "next/server"
import { obtenerVenta } from "@/lib/dominio/ventas"
import { toVentaDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { id } = await params
    const venta = await obtenerVenta(id)

    if (!venta) {
      return errorNoEncontrado("VENTA_NO_ENCONTRADA")
    }

    return ok(toVentaDTO(venta))
  } catch (e) {
    return mapPrismaError(e)
  }
}
