import { NextRequest } from "next/server"
import { z } from "zod"
import { listarVentas, registrarVenta } from "@/lib/dominio/ventas"
import { toVentaDTO } from "@/lib/api/serializadores"
import { ok, creado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError, StockNegativoError, LimiteFolioDiarioError, VentaFallidaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearVentaSchema } from "@/lib/schemas/venta"
import { log } from "@/lib/log"

const listadoQuerySchema = z.object({
  q: z.string().optional(),
  desde: z.string().optional(),
  hasta: z.string().optional(),
  take: z.coerce.number().int().min(1).max(100).default(20),
  skip: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = req.nextUrl
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = listadoQuerySchema.safeParse(raw)

    if (!parsed.success) {
      return errorValidacion(parsed.error.issues.map(i => ({ campo: i.path.join("."), mensaje: i.message })))
    }

    const { items, total } = await listarVentas(parsed.data)
    return ok({ items: items.map(toVentaDTO), total, take: parsed.data.take, skip: parsed.data.skip })
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function POST(req: NextRequest) {
  return withValidation(crearVentaSchema, req, async (input) => {
    try {
      const venta = await registrarVenta(input)
      log.info({ folio: venta.folio, total: Number(venta.total), metodo_pago: venta.metodo_pago })
      return creado(toVentaDTO(venta))
    } catch (e) {
      if (e instanceof StockNegativoError) return mapPrismaError(e)
      if (e instanceof LimiteFolioDiarioError) return mapPrismaError(e)
      if (e instanceof VentaFallidaError) return mapPrismaError(e)
      return mapPrismaError(e)
    }
  })
}
