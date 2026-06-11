/**
 * lib/dominio/invitaciones.ts
 * Lógica de dominio para invitaciones a organizaciones.
 * Validates: Requirements R9.2, R9.3, R9.4, R9.5, R9.6, R9.8, R9.9
 */

import { prisma } from "@/lib/db"
import { generarToken, hashToken } from "@/lib/auth/tokens"
import { clampInt } from "@/lib/auth/vigencia"
import { enviarCorreo, construirEnlace } from "@/lib/correo/enviar"
import { plantillaInvitacion } from "@/lib/correo/plantillas"
import {
  MiembroExistenteError,
  RolFueraDeOrganizacionError,
  InvitacionInvalidaError,
  InvitacionOtroCorreoError,
} from "@/lib/dominio/errores-auth"

/**
 * Vigencia del token de invitación en horas.
 * Rango válido: [1, 168]. Default: 72 (R9.4).
 */
function vigenciaInvitacionHoras(): number {
  return clampInt(process.env.INVITACION_TOKEN_HORAS, 72, 1, 168)
}

export interface ResultadoInvitacion {
  id: string
  organizacion_id: string
  correo: string
  rol_id: string
  estado: string
  expira_en: Date
  invitado_por: string
  creado_en: Date
}

/**
 * Invita a un correo a unirse a una organización con un rol específico.
 *
 * - Verifica que rol_id pertenece a la organización → RolFueraDeOrganizacionError (R9.9)
 * - Verifica que el correo no tenga membresía activa → MiembroExistenteError (R9.5)
 * - Si ya existe invitación pendiente: regenera token, resetea expira_en, reenvía correo (R9.6)
 * - Si no: crea nueva Invitacion con token hash y expira_en (R9.2, R9.4)
 * - Envía correo con plantillaInvitacion (R9.3)
 */
export async function invitar(
  organizacionId: string,
  correo: string,
  rolId: string,
  invitadoPor: string,
  nombreSugerido?: string
): Promise<ResultadoInvitacion> {
  const correoNormalizado = correo.toLowerCase().trim()

  // R9.9: Verificar que el rol pertenece a la organización
  const rol = await prisma.rol.findFirst({
    where: {
      id: rolId,
      organizacion_id: organizacionId,
    },
  })

  if (!rol) {
    throw new RolFueraDeOrganizacionError()
  }

  // R9.5: Verificar que el correo no sea ya miembro activo
  const miembroExistente = await prisma.membresia.findFirst({
    where: {
      organizacion_id: organizacionId,
      estado: "activa",
      usuario: {
        correo: correoNormalizado,
      },
    },
  })

  if (miembroExistente) {
    throw new MiembroExistenteError()
  }

  // Obtener nombre de organización y rol para el correo
  const organizacion = await prisma.organizacion.findUniqueOrThrow({
    where: { id: organizacionId },
    select: { nombre: true },
  })

  // R9.6: Verificar si ya existe invitación pendiente para mismo correo + org
  const invitacionExistente = await prisma.invitacion.findFirst({
    where: {
      organizacion_id: organizacionId,
      correo: correoNormalizado,
      estado: "pendiente",
    },
  })

  const token = generarToken()
  const horas = vigenciaInvitacionHoras()
  const expiraEn = new Date(Date.now() + horas * 60 * 60 * 1000)

  let invitacion: ResultadoInvitacion

  if (invitacionExistente) {
    // R9.6: Regenerar token, resetear expira_en, reenviar correo
    const actualizada = await prisma.invitacion.update({
      where: { id: invitacionExistente.id },
      data: {
        token_hash: token.hash,
        expira_en: expiraEn,
        rol_id: rolId,
        ...(nombreSugerido !== undefined && { nombre_sugerido: nombreSugerido || null }),
      },
    })

    invitacion = {
      id: actualizada.id,
      organizacion_id: actualizada.organizacion_id,
      correo: actualizada.correo,
      rol_id: actualizada.rol_id,
      estado: actualizada.estado,
      expira_en: actualizada.expira_en,
      invitado_por: actualizada.invitado_por,
      creado_en: actualizada.creado_en,
    }
  } else {
    // R9.2: Crear nueva invitación
    const nueva = await prisma.invitacion.create({
      data: {
        organizacion_id: organizacionId,
        correo: correoNormalizado,
        nombre_sugerido: nombreSugerido || null,
        rol_id: rolId,
        estado: "pendiente",
        token_hash: token.hash,
        expira_en: expiraEn,
        invitado_por: invitadoPor,
      },
    })

    invitacion = {
      id: nueva.id,
      organizacion_id: nueva.organizacion_id,
      correo: nueva.correo,
      rol_id: nueva.rol_id,
      estado: nueva.estado,
      expira_en: nueva.expira_en,
      invitado_por: nueva.invitado_por,
      creado_en: nueva.creado_en,
    }
  }

  // R9.3: Enviar correo de invitación
  const enlace = construirEnlace(token.plano, "invitacion")
  const plantilla = plantillaInvitacion(organizacion.nombre, rol.nombre, enlace)

  await enviarCorreo({
    para: correoNormalizado,
    asunto: plantilla.asunto,
    html: plantilla.html,
    texto: plantilla.texto,
  })

  return invitacion
}

/**
 * Acepta una invitación pendiente y crea la membresía correspondiente.
 *
 * Flujo (R10.2, R10.3, R10.4, R10.5, R10.7):
 * 1. Hashea el token y busca la invitación por token_hash.
 * 2. Si no existe → InvitacionInvalidaError (R10.4).
 * 3. Si estado === "revocada" → InvitacionInvalidaError (R10.4).
 * 4. Si now > expira_en → actualiza estado="expirada", lanza InvitacionInvalidaError (R10.5).
 * 5. Si correo del usuario (normalizado) ≠ correo de la invitación → InvitacionOtroCorreoError (R10.7).
 * 6. Dentro de una transacción:
 *    a. Si ya existe membresía → retorna éxito idempotente (R10.3).
 *    b. Crea Membresia con estado="activa" y el rol de la invitación.
 *    c. Actualiza invitacion.estado = "aceptada".
 * 7. Retorna { ok: true }.
 */
export async function aceptarInvitacion(
  token: string,
  usuarioActual: { id: string; correo: string }
): Promise<{ ok: true }> {
  const tokenHash = hashToken(token)

  // Buscar invitación por token_hash, incluyendo el rol
  const invitacion = await prisma.invitacion.findUnique({
    where: { token_hash: tokenHash },
    include: { rol: true },
  })

  // R10.4: No existe
  if (!invitacion) {
    throw new InvitacionInvalidaError()
  }

  // R10.4: Revocada
  if (invitacion.estado === "revocada") {
    throw new InvitacionInvalidaError()
  }

  // R10.5: Expirada (now > expira_en)
  const ahora = new Date()
  if (ahora > invitacion.expira_en) {
    // Actualizar estado a "expirada" si aún estaba pendiente
    if (invitacion.estado === "pendiente") {
      await prisma.invitacion.update({
        where: { id: invitacion.id },
        data: { estado: "expirada" },
      })
    }
    throw new InvitacionInvalidaError()
  }

  // R10.7: Correo no coincide
  const correoUsuario = usuarioActual.correo.toLowerCase().trim()
  const correoInvitacion = invitacion.correo.toLowerCase().trim()
  if (correoUsuario !== correoInvitacion) {
    throw new InvitacionOtroCorreoError()
  }

  // R10.2, R10.3: Transacción para crear membresía de forma idempotente
  await prisma.$transaction(async (tx) => {
    // R10.3: Verificar si ya existe membresía (idempotencia)
    const membresiaExistente = await tx.membresia.findUnique({
      where: {
        usuario_id_organizacion_id: {
          usuario_id: usuarioActual.id,
          organizacion_id: invitacion.organizacion_id,
        },
      },
    })

    if (membresiaExistente) {
      // Ya existe membresía → retorno idempotente, sin cambios adicionales
      return
    }

    // R10.2: Crear membresía con estado="activa" y el rol de la invitación
    await tx.membresia.create({
      data: {
        usuario_id: usuarioActual.id,
        organizacion_id: invitacion.organizacion_id,
        rol_id: invitacion.rol_id,
        estado: "activa",
      },
    })

    // Marcar invitación como aceptada
    await tx.invitacion.update({
      where: { id: invitacion.id },
      data: { estado: "aceptada" },
    })
  })

  return { ok: true }
}
