/**
 * app/api/invitaciones/[id]/route.ts
 *
 * DELETE: Revoca una invitación pendiente.
 *         Requiere permiso (usuarios, administrar).
 *         Verifica que la invitación pertenece a la organización activa.
 *         Si estado !== "pendiente" → 409 INVITACION_NO_PENDIENTE (R9.10).
 *         Si estado === "pendiente" → estado="revocada", invalida token → 200 { ok: true } (R9.7).
 *
 * Validates: Requirements R9.7, R9.10
 */

import { NextRequest } from "next/server"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"
import { prisma } from "@/lib/db"
import { generarToken } from "@/lib/auth/tokens"

type Params = { params: Promise<{ id: string }> }

/**
 * DELETE /api/invitaciones/{id}
 * Revoca una invitación pendiente de la organización activa.
 */
export async function DELETE(_req: NextRequest, { params }: Params) {
  // Guard: requiere permiso (usuarios, administrar)
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Buscar la invitación por id
  const invitacion = await prisma.invitacion.findUnique({
    where: { id },
  })

  // 404 si no existe
  if (!invitacion) {
    return errorAuth("INVITACION_INVALIDA", 404)
  }

  // 403 si pertenece a otra organización
  if (!ctx.organizacionActiva || invitacion.organizacion_id !== ctx.organizacionActiva.id) {
    return errorAuth("PERMISO_DENEGADO", 403)
  }

  // R9.10: Si no está pendiente → 409 INVITACION_NO_PENDIENTE
  if (invitacion.estado !== "pendiente") {
    return errorAuth("INVITACION_NO_PENDIENTE", 409)
  }

  // R9.7: Marcar como revocada e invalidar el token (reemplazar con hash aleatorio)
  const tokenInvalidado = generarToken()

  await prisma.invitacion.update({
    where: { id },
    data: {
      estado: "revocada",
      token_hash: tokenInvalidado.hash,
    },
  })

  return ok({ ok: true })
}
