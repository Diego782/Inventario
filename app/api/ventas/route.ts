import { NextRequest } from "next/server"
import { z } from "zod"
import { listarVentas, registrarVenta } from "@/lib/dominio/ventas"
import { toVentaDTO } from "@/lib/api/serializadores"
import { ok, creado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError, StockNegativoError, LimiteFolioDiarioError, VentaFallidaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearVentaSchema } from "@/lib/schemas/venta"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { log } from "@/lib/log"

const listadoQuerySchema = z
  .object({
    q: z.string().optional(),
    producto: z.string().optional(),
    metodo_pago: z.enum(["efectivo", "tarjeta", "transferencia", "fiado"]).optional(),
    total_min: z.coerce.number().nonnegative().optional(),
    total_max: z.coerce.number().nonnegative().optional(),
    desde: z.string().optional(),
    hasta: z.string().optional(),
    take: z.coerce.number().int().min(1).max(100).default(20),
    skip: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((v, ctx) => {
    if (v.total_min !== undefined && v.total_max !== undefined && v.total_min > v.total_max) {
      ctx.addIssue({
        code: "custom",
        path: ["total_min"],
        message: "El total mínimo no puede ser mayor que el máximo.",
      })
    }
    const desde = v.desde ? new Date(v.desde) : null
    const hasta = v.hasta ? new Date(v.hasta) : null
    if (desde && isNaN(desde.getTime())) {
      ctx.addIssue({ code: "custom", path: ["desde"], message: "Fecha inicial inválida." })
    }
    if (hasta && isNaN(hasta.getTime())) {
      ctx.addIssue({ code: "custom", path: ["hasta"], message: "Fecha final inválida." })
    }
    if (desde && hasta && !isNaN(desde.getTime()) && !isNaN(hasta.getTime()) && desde > hasta) {
      ctx.addIssue({
        code: "custom",
        path: ["desde"],
        message: "La fecha inicial no puede ser posterior a la final.",
      })
    }
  })

export async function GET(req: NextRequest) {
  const { ctx, error } = await resolverContexto({ seccion: "ventas", accion: "ver" })
  if (error) return error

  try {
    const { searchParams } = req.nextUrl
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = listadoQuerySchema.safeParse(raw)

    if (!parsed.success) {
      return errorValidacion(parsed.error.issues.map(i => ({ campo: i.path.join("."), mensaje: i.message })))
    }

    const { items, total } = await listarVentas({ ...parsed.data, organizacion_id: ctx.organizacionActiva!.id })
    return ok({ items: items.map(toVentaDTO), total, take: parsed.data.take, skip: parsed.data.skip })
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function POST(req: NextRequest) {
  const { ctx, error } = await resolverContexto({ seccion: "ventas", accion: "crear" })
  if (error) return error

  return withValidation(crearVentaSchema, req, async (input) => {
    try {
      const venta = await registrarVenta({ ...input, organizacion_id: ctx.organizacionActiva!.id, usuario_id: ctx.usuarioActual.id })
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
