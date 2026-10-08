import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { metricasQuerySchema } from "@/lib/schemas/dashboard"
import { calcularFlujosProducto } from "@/lib/dominio/flujos-producto"
import { ok, errorValidacion } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"

export async function GET(req: NextRequest) {
  const { ctx, error } = await resolverContexto({ seccion: "dashboard", accion: "ver" })
  if (error) return error
  const parsed = metricasQuerySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams.entries()))
  if (!parsed.success) {
    return errorValidacion(parsed.error.issues.map((issue) => ({ campo: issue.path.join("."), mensaje: issue.message })))
  }
  try {
    return ok(await calcularFlujosProducto(parsed.data.desde, parsed.data.hasta, ctx.organizacionActiva!.id))
  } catch (error) {
    return mapPrismaError(error)
  }
}
