/**
 * app/api/usuarios/[id]/route.ts
 *
 * PATCH: Actualiza el nombre de un usuario miembro de la organización activa.
 *        Requiere permiso (usuarios, administrar).
 *        Solo el nombre puede modificarse por esta vía.
 *
 * Validates: Requirements R11.8 (edición de miembro)
 */

import { NextRequest } from "next/server"
import { z } from "zod"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { withValidation } from "@/lib/api/with-validation"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { ok } from "@/lib/api/respuestas"
import { prisma } from "@/lib/db"

const editarUsuarioSchema = z.object({
  nombre: z.string().trim().min(1).max(160),
})

type Params = { params: Promise<{ id: string }> }

/**
 * PATCH /api/usuarios/{id}
 * Actualiza el nombre del usuario dentro de la organización activa.
 * Requiere permiso (usuarios, administrar).
 */
export async function PATCH(req: NextRequest, { params }: Params) {
  const resultado = await resolverContexto({ seccion: "usuarios", accion: "administrar" })

  if (resultado.error) {
    return resultado.error
  }

  const { id } = await params
  const { ctx } = resultado

  // Verificar que el usuario es miembro de la organización activa
  const membresia = await prisma.membresia.findFirst({
    where: {
      usuario_id: id,
      organizacion_id: ctx.organizacionActiva.id,
    },
  })

  if (!membresia) {
    return errorAuth("MEMBRESIA_NO_ENCONTRADA", 404)
  }

  return withValidation(editarUsuarioSchema, req, async (input) => {
    const usuario = await prisma.usuario.update({
      where: { id },
      data: { nombre: input.nombre },
      select: { id: true, correo: true, nombre: true },
    })

    return ok(usuario)
  })
}
