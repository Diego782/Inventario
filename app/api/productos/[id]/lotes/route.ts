import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { listarLotes, registrarLote, descartarLote, fechaCivil } from "@/lib/dominio/lotes"
import { fechaVencimientoSchema } from "@/lib/schemas/producto"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { ok, creado, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { cerrarAlertasDeLote } from "@/lib/dominio/notificaciones"

type Params = { params: Promise<{ id: string }> }
const agregarSchema = z.object({
  variante_id: z.string().uuid().nullable().optional(),
  fecha_vencimiento: fechaVencimientoSchema,
  cantidad: z.number().int().positive(),
  modo: z.enum(["entrada", "asignar"]),
})
const corregirSchema = z.object({ lote_id: z.string().uuid(), fecha_vencimiento: fechaVencimientoSchema })
const descartarSchema = z.object({ lote_id: z.string().uuid() })

export async function GET(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (error) return error
  try { return ok(await listarLotes((await params).id, ctx.organizacionActiva!.id)) }
  catch (error) { return mapPrismaError(error) }
}

export async function POST(req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (error) return error
  const id = (await params).id
  return withValidation(agregarSchema, req, async (input) => {
    try {
      await registrarLote(id, ctx.organizacionActiva!.id, input)
      return creado(await listarLotes(id, ctx.organizacionActiva!.id))
    } catch (error) { return mapPrismaError(error) }
  })
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (error) return error
  const id = (await params).id
  return withValidation(corregirSchema, req, async (input) => {
    try {
      const lote = await prisma.loteProducto.findFirst({ where: {
        id: input.lote_id, producto_id: id, organizacion_id: ctx.organizacionActiva!.id,
      } })
      if (!lote) return errorNoEncontrado("NO_ENCONTRADO", "Lote no encontrado.")
      await prisma.$transaction(async (tx) => {
        await tx.loteProducto.update({ where: { id: lote.id }, data: { fecha_vencimiento: fechaCivil(input.fecha_vencimiento) } })
        await cerrarAlertasDeLote(tx, lote.id)
      })
      return ok(await listarLotes(id, ctx.organizacionActiva!.id))
    } catch (error) { return mapPrismaError(error) }
  })
}

export async function DELETE(req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "inventario", accion: "editar" })
  if (error) return error
  const id = (await params).id
  return withValidation(descartarSchema, req, async (input) => {
    try {
      await descartarLote(id, ctx.organizacionActiva!.id, input.lote_id)
      return ok(await listarLotes(id, ctx.organizacionActiva!.id))
    } catch (error) { return mapPrismaError(error) }
  })
}
