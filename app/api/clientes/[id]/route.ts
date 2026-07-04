/**
 * app/api/clientes/[id]/route.ts
 * Route Handlers para un Cliente individual.
 *
 * GET    /api/clientes/[id] — Detalle del cliente (Req 4.5, 4.7)
 * PATCH  /api/clientes/[id] — Edición parcial (Req 4.6, 4.7, 4.10, 4.11, 4.13)
 * DELETE /api/clientes/[id] — Elimina si no tiene historial (Req 4.8, 4.9)
 */
import { NextRequest } from "next/server"
import { obtenerCliente, editarCliente, eliminarCliente } from "@/lib/dominio/clientes"
import { toClienteDTO } from "@/lib/api/serializadores"
import { ok, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { editarClienteSchema, type EditarClienteInput } from "@/lib/schemas/cliente"
import { resolverContexto } from "@/lib/auth/contexto-request"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "clientes", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { id } = await params
    const cliente = await obtenerCliente(id, ctx.organizacionActiva!.id)

    if (!cliente) {
      return errorNoEncontrado("CLIENTE_NO_ENCONTRADO")
    }

    return ok(toClienteDTO(cliente))
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "clientes", accion: "editar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado
  const { id } = await params

  return withValidation<EditarClienteInput>(editarClienteSchema, req, async (input) => {
    try {
      const cliente = await editarCliente(id, input, ctx.organizacionActiva!.id)
      return ok(toClienteDTO(cliente))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "clientes", accion: "eliminar" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { id } = await params
    await eliminarCliente(id, ctx.organizacionActiva!.id)
    return ok({ eliminado: true })
  } catch (e) {
    return mapPrismaError(e)
  }
}
