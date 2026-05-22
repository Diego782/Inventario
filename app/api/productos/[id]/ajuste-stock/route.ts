import { NextRequest } from "next/server"
import { ajustarStock } from "@/lib/dominio/inventario"
import { toProductoDTO, toMovimientoDTO } from "@/lib/api/serializadores"
import { creado, errorPeticion } from "@/lib/api/respuestas"
import { mapPrismaError, StockNegativoError, ProductoNoEncontradoError } from "@/lib/api/errores"
import { errorNoEncontrado } from "@/lib/api/respuestas"
import { withValidation } from "@/lib/api/with-validation"
import { ajusteStockSchema } from "@/lib/schemas/producto"

type Params = { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params

  return withValidation(ajusteStockSchema, req, async (input) => {
    try {
      const { producto, movimiento } = await ajustarStock(id, input)
      return creado({
        producto: toProductoDTO(producto),
        movimiento: toMovimientoDTO(movimiento),
      })
    } catch (e) {
      if (e instanceof StockNegativoError) return errorPeticion("STOCK_NEGATIVO")
      if (e instanceof ProductoNoEncontradoError) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
      return mapPrismaError(e)
    }
  })
}
