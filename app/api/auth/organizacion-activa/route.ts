/**
 * app/api/auth/organizacion-activa/route.ts
 * Endpoints para consultar y establecer la organización activa de la sesión.
 *
 * Validates: Requirements R7.3, R7.5, R7.7, R13.5
 */

import { resolverContexto } from "@/lib/auth/contexto-request"
import { seleccionOrgSchema } from "@/lib/schemas/organizaciones"
import { toOrganizacionDTO } from "@/lib/api/serializadores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok, errorValidacion } from "@/lib/api/respuestas"
import { prisma } from "@/lib/db"

/**
 * GET /api/auth/organizacion-activa
 * Devuelve la organización activa de la sesión actual, o null si no hay ninguna.
 */
export async function GET() {
  const resultado = await resolverContexto("solo-sesion")

  if (resultado.error) {
    return resultado.error
  }

  const { ctx } = resultado

  // Leer organizacion_activa_id desde la sesión en BD
  const sesion = await prisma.sesion.findUnique({
    where: { id: ctx.sesionId },
    select: { organizacion_activa_id: true },
  })

  if (!sesion?.organizacion_activa_id) {
    return ok({ organizacion_activa: null })
  }

  const org = await prisma.organizacion.findUnique({
    where: { id: sesion.organizacion_activa_id },
  })

  if (!org) {
    return ok({ organizacion_activa: null })
  }

  return ok({ organizacion_activa: toOrganizacionDTO(org) })
}

/**
 * POST /api/auth/organizacion-activa
 * Establece la organización activa para la sesión actual.
 * Valida que el usuario tenga membresía activa en la org indicada.
 */
export async function POST(request: Request) {
  const resultado = await resolverContexto("solo-sesion")

  if (resultado.error) {
    return resultado.error
  }

  const { ctx } = resultado

  // Parsear y validar body
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return errorValidacion([{ campo: "body", mensaje: "JSON inválido" }])
  }

  const parsed = seleccionOrgSchema.safeParse(body)
  if (!parsed.success) {
    const errores = parsed.error.issues.map((i) => ({
      campo: i.path.join(".") || "organizacion_id",
      mensaje: i.message,
    }))
    return errorValidacion(errores)
  }

  const { organizacion_id } = parsed.data

  // Verificar membresía activa del usuario en la organización
  const membresia = await prisma.membresia.findUnique({
    where: {
      usuario_id_organizacion_id: {
        usuario_id: ctx.usuarioActual.id,
        organizacion_id,
      },
    },
    include: { organizacion: true },
  })

  if (!membresia || membresia.estado !== "activa") {
    // R7.7: Membresía no activa → 409
    return errorAuth("MEMBRESIA_NO_ACTIVA", 409)
  }

  // Actualizar organizacion_activa_id en la sesión
  await prisma.sesion.update({
    where: { id: ctx.sesionId },
    data: { organizacion_activa_id: organizacion_id },
  })

  // R7.3: Retornar la organización seleccionada
  return ok({ organizacion_activa: toOrganizacionDTO(membresia.organizacion) })
}
