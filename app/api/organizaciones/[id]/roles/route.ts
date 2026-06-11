/**
 * app/api/organizaciones/[id]/roles/route.ts
 *
 * GET:  Lista roles de la organización.
 *       Requiere permiso (usuarios, ver).
 *       Devuelve RolDTO[].
 *
 * POST: Crea un nuevo rol en la organización.
 *       Requiere permiso (usuarios, administrar).
 *       Valida con crearRolSchema. Llama crearRol().
 *       RolInvalidoError → 400 ROL_INVALIDO.
 *       Éxito → 201 RolDTO.
 *
 * Validates: Requirements R11.3, R11.4, R11.5, R15.4
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { crearRolSchema } from "@/lib/schemas/roles"
import { crearRol } from "@/lib/dominio/roles"
import { RolInvalidoError } from "@/lib/dominio/errores-auth"
import { toRolDTO } from "@/lib/api/serializadores-auth"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok, creado } from "@/lib/api/respuestas"
import { prisma } from "@/lib/db"

type Params = { params: Promise<{ id: string }> }

/**
 * GET /api/organizaciones/{id}/roles
 * Lista todos los roles de la organización.
 * Requiere permiso (usuarios, ver).
 */
export async function GET(_req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "ver" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el ID en la URL coincida con la organización activa
  if (!ctx.organizacionActiva || ctx.organizacionActiva.id !== id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  const roles = await prisma.rol.findMany({
    where: { organizacion_id: id },
    include: { permisos: true },
    orderBy: { creado_en: "asc" },
  })

  return ok(roles.map(toRolDTO))
}

/**
 * POST /api/organizaciones/{id}/roles
 * Crea un nuevo rol en la organización.
 * Requiere permiso (usuarios, administrar).
 */
export async function POST(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el ID en la URL coincida con la organización activa
  if (!ctx.organizacionActiva || ctx.organizacionActiva.id !== id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  return withValidation(crearRolSchema, req, async (input) => {
    try {
      const rol = await crearRol(id, { nombre: input.nombre })
      return creado(rol)
    } catch (error) {
      // R11.5: Nombre duplicado en la organización → 400 ROL_INVALIDO
      if (error instanceof RolInvalidoError) {
        return errorAuth("ROL_INVALIDO", 400)
      }
      // Prisma unique constraint violation (nombre duplicado en la org)
      if (
        error instanceof Error &&
        "code" in error &&
        (error as { code: string }).code === "P2002"
      ) {
        return errorAuth("ROL_INVALIDO", 400)
      }
      throw error
    }
  })
}
