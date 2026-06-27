/**
 * GET /api/organizaciones/{id}/miembros
 * Devuelve todos los miembros de una organización.
 * Requiere permiso (empleados, ver) vía resolverContexto.
 * Validates: Requirements R7.2, R14.7
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { toMiembroDTO } from "@/lib/api/serializadores-auth"
import { mapPrismaError } from "@/lib/api/errores"

type Params = { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  try {
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

    const membresias = await prisma.membresia.findMany({
      where: { organizacion_id: id },
      include: { usuario: true, rol: true },
      orderBy: { creado_en: "asc" },
    })

    const miembros = membresias.map(toMiembroDTO)

    return ok(miembros)
  } catch (e) {
    return mapPrismaError(e)
  }
}
