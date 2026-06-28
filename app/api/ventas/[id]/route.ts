import { NextRequest } from "next/server"
import { obtenerVenta, editarVenta, eliminarVenta } from "@/lib/dominio/ventas"
import { toVentaDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { editarVentaSchema } from "@/lib/schemas/venta"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "ventas", accion: "ver" })
  if (error) return error

  try {
    const { id } = await params
    const venta = await obtenerVenta(id, ctx.organizacionActiva!.id)

    if (!venta) {
      return errorNoEncontrado("VENTA_NO_ENCONTRADA")
    }

    return ok(toVentaDTO(venta))
  } catch (e) {
    return mapPrismaError(e)
  }
}

/**
 * PATCH /api/ventas/{id}
 * Edita método de pago y/o estado de una venta. Requiere permiso (ventas, editar).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "ventas", accion: "editar" })
  if (error) return error

  const { id } = await params

  return withValidation(editarVentaSchema, req, async (input) => {
    try {
      const venta = await editarVenta(id, ctx.organizacionActiva!.id, input)
      if (!venta) {
        return errorNoEncontrado("VENTA_NO_ENCONTRADA")
      }
      return ok(toVentaDTO(venta))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

/**
 * DELETE /api/ventas/{id}
 * Elimina una venta y revierte el stock vendido. Requiere permiso (ventas, eliminar).
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  const { ctx, error } = await resolverContexto({ seccion: "ventas", accion: "eliminar" })
  if (error) return error

  try {
    const { id } = await params
    const eliminada = await eliminarVenta(id, ctx.organizacionActiva!.id)

    if (!eliminada) {
      return errorNoEncontrado("VENTA_NO_ENCONTRADA")
    }

    return ok({ ok: true })
  } catch (e) {
    return mapPrismaError(e)
  }
}
