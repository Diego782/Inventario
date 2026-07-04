/**
 * app/api/clientes/route.ts
 * Route Handlers para la colección de Clientes.
 *
 * GET  /api/clientes — Lista paginada (máx. 50) del tenant (Req 4.5, 4.14)
 * POST /api/clientes — Crea un nuevo cliente (Req 4.1–4.4, 4.10, 4.11, 4.13)
 */
import { NextRequest } from "next/server"
import { z } from "zod"
import { listarClientes, crearCliente } from "@/lib/dominio/clientes"
import { toClienteDTO } from "@/lib/api/serializadores"
import { ok, creado, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { crearClienteSchema, type CrearClienteInput } from "@/lib/schemas/cliente"
import { resolverContexto } from "@/lib/auth/contexto-request"

/** Schema para los query params del listado de clientes (Req 4.5, 4.14). */
const listadoClientesSchema = z.object({
  q: z.string().optional(),
  take: z.coerce.number().int().min(1).max(50).default(50),
  skip: z.coerce.number().int().min(0).default(0),
})

export async function GET(req: NextRequest) {
  const resultado = await resolverContexto({ seccion: "clientes", accion: "ver" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  try {
    const { searchParams } = req.nextUrl
    const raw = Object.fromEntries(searchParams.entries())
    const parsed = listadoClientesSchema.safeParse(raw)

    if (!parsed.success) {
      const errores = parsed.error.issues.map((i) => ({
        campo: i.path.join("."),
        mensaje: i.message,
      }))
      return errorValidacion(errores)
    }

    const { q, take, skip } = parsed.data
    const { items, total } = await listarClientes({
      q,
      take,
      skip,
      organizacion_id: ctx.organizacionActiva!.id,
    })

    return ok({
      items: items.map(toClienteDTO),
      total,
      take,
      skip,
    })
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function POST(req: NextRequest) {
  const resultado = await resolverContexto({ seccion: "clientes", accion: "crear" })
  if (resultado.error) return resultado.error

  const { ctx } = resultado

  return withValidation<CrearClienteInput>(crearClienteSchema, req, async (input) => {
    try {
      const cliente = await crearCliente(input, ctx.organizacionActiva!.id)
      return creado(toClienteDTO(cliente))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
