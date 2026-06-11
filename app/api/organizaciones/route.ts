/**
 * app/api/organizaciones/route.ts
 * GET: lista organizaciones donde el usuario tiene membresía activa (A-Z).
 * POST: crea una nueva organización.
 *
 * Validates: Requirements R7.1, R7.2, R8.1, R8.7, R8.8
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { crearOrganizacionSchema } from "@/lib/schemas/organizaciones"
import { crearOrganizacion } from "@/lib/dominio/organizaciones"
import { OrganizacionFallidaError } from "@/lib/dominio/errores-auth"
import { toOrganizacionDTO } from "@/lib/api/serializadores-auth"
import type { OrganizacionConRolDTO } from "@/lib/api/serializadores-auth"
import { ok, creado } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { prisma } from "@/lib/db"

/**
 * GET /api/organizaciones
 * Devuelve OrganizacionConRolDTO[] con las orgs donde el usuario
 * tiene membresía activa, ordenadas A-Z por nombre.
 */
export async function GET() {
  const resultado = await resolverContexto("solo-sesion")

  if (resultado.error) {
    return resultado.error
  }

  const { ctx } = resultado

  // R7.2: Solo membresías activas, con rol y organización
  const membresias = await prisma.membresia.findMany({
    where: {
      usuario_id: ctx.usuarioActual.id,
      estado: "activa",
    },
    include: {
      organizacion: true,
      rol: true,
    },
    orderBy: {
      organizacion: { nombre: "asc" },
    },
  })

  // R7.1: Mapear a OrganizacionConRolDTO[]
  const organizaciones: OrganizacionConRolDTO[] = membresias.map((m) => ({
    ...toOrganizacionDTO(m.organizacion),
    rol: m.rol.nombre,
  }))

  return ok(organizaciones)
}

/**
 * POST /api/organizaciones
 * Crea una nueva organización. Requiere sesión.
 */
export async function POST(req: NextRequest) {
  const resultado = await resolverContexto("solo-sesion")

  if (resultado.error) {
    return resultado.error
  }

  const { ctx } = resultado

  return withValidation(crearOrganizacionSchema, req, async (input) => {
    try {
      const org = await crearOrganizacion(ctx.usuarioActual, input.nombre)

      // R8.1: Devolver 201 con OrganizacionDTO
      return creado({
        id: org.id,
        nombre: org.nombre,
        slug: org.slug,
        creado_por: org.creado_por,
        creado_en: org.creado_en.toISOString(),
      })
    } catch (error) {
      // R8.5: Fallo en la transacción → 500 ORGANIZACION_FALLIDA
      if (error instanceof OrganizacionFallidaError) {
        return errorAuth("ORGANIZACION_FALLIDA", 500)
      }
      return errorAuth("ERROR_INTERNO", 500)
    }
  })
}
