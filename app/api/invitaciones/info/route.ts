/**
 * app/api/invitaciones/info/route.ts
 *
 * GET /api/invitaciones/info?token=<token>
 *
 * Devuelve la información pública de una invitación pendiente y no expirada:
 * nombre de la organización, nombre del rol y correo al que fue enviada.
 *
 * No requiere autenticación (el invitado puede no tener cuenta aún — R10.6).
 * No expone datos sensibles (token_hash, ids internos).
 *
 * Respuestas:
 *   200 { organizacion: string, rol: string, correo: string }
 *   400 INVITACION_INVALIDA — token inexistente, expirado o no pendiente
 *   422 — falta el parámetro token
 *
 * Validates: Requirements R10.1, R10.6
 */

import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { hashToken } from "@/lib/auth/tokens"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const token = searchParams.get("token")

  if (!token || token.trim() === "") {
    return errorAuth("INVITACION_INVALIDA", 400)
  }

  const tokenHash = hashToken(token.trim())

  // Buscar la invitación por token_hash incluyendo org y rol
  const invitacion = await prisma.invitacion.findUnique({
    where: { token_hash: tokenHash },
    include: {
      organizacion: { select: { nombre: true } },
      rol: { select: { nombre: true } },
    },
  })

  // No existe
  if (!invitacion) {
    return errorAuth("INVITACION_INVALIDA", 400)
  }

  // Revocada o ya aceptada
  if (invitacion.estado === "revocada" || invitacion.estado === "aceptada") {
    return errorAuth("INVITACION_INVALIDA", 400)
  }

  // Expirada (now > expira_en)
  const ahora = new Date()
  if (ahora > invitacion.expira_en) {
    // Actualizar estado a "expirada" si aún estaba pendiente
    if (invitacion.estado === "pendiente") {
      await prisma.invitacion.update({
        where: { id: invitacion.id },
        data: { estado: "expirada" },
      })
    }
    return errorAuth("INVITACION_INVALIDA", 400)
  }

  // R10.1: Devolver nombre de organización, rol y correo (sin datos sensibles)
  return ok({
    organizacion: invitacion.organizacion.nombre,
    rol: invitacion.rol.nombre,
    correo: invitacion.correo,
  })
}
