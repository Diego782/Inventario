/**
 * lib/dominio/usuarios.ts
 * Lógica de dominio para registro de usuarios.
 * Validates: Requirements R2.4, R2.5, R2.7, R2.8, R2.9, R2.10
 */

import { prisma } from "@/lib/db"
import { hashContrasena } from "@/lib/auth/password"
import { generarToken } from "@/lib/auth/tokens"
import { vigenciaTokenHoras } from "@/lib/auth/vigencia"
import { enviarCorreo, construirEnlace } from "@/lib/correo/enviar"
import { plantillaVerificacion } from "@/lib/correo/plantillas"
import type { RegistroInput } from "@/lib/schemas/auth"
import { CorreoDuplicadoError, TokenInvalidoError } from "@/lib/dominio/errores-auth"
import { hashToken } from "@/lib/auth/tokens"

export interface ResultadoRegistro {
  usuario: {
    id: string
    correo: string
    nombre: string
    estado: string
    correo_verificado: boolean
    creado_en: Date
  }
  envioCorreo: "ok" | "fallido"
}

/**
 * Registra un nuevo usuario en el sistema.
 *
 * - Normaliza correo a minúsculas (R2.9)
 * - Rechaza duplicado con CorreoDuplicadoError (R2.10)
 * - Crea usuario con estado=pendiente y hash bcrypt (R2.4, R2.5)
 * - Genera Token_Verificacion con hash y expira_en (R2.7)
 * - Intenta enviar correo de verificación; si falla, conserva usuario (R2.8)
 */
export async function registrarUsuario(input: RegistroInput): Promise<ResultadoRegistro> {
  const correoNormalizado = input.correo.toLowerCase().trim()

  // R2.10: Verificar duplicado
  const existente = await prisma.usuario.findUnique({
    where: { correo: correoNormalizado },
  })

  if (existente) {
    throw new CorreoDuplicadoError()
  }

  // R2.5: Hash de contraseña con bcrypt
  const hash = await hashContrasena(input.contrasena)

  // R2.4: Crear usuario con estado=pendiente
  const usuario = await prisma.usuario.create({
    data: {
      correo: correoNormalizado,
      nombre: input.nombre.trim(),
      hash_contrasena: hash,
      estado: "pendiente",
      correo_verificado: false,
    },
  })

  // R2.7: Generar token de verificación
  const token = generarToken()
  const horas = vigenciaTokenHoras(process.env.TOKEN_VERIFICACION_HORAS)
  const expiraEn = new Date(Date.now() + horas * 60 * 60 * 1000)

  await prisma.tokenVerificacion.create({
    data: {
      usuario_id: usuario.id,
      token_hash: token.hash,
      expira_en: expiraEn,
    },
  })

  // Construir enlace y enviar correo
  let envioCorreo: "ok" | "fallido" = "ok"

  try {
    const enlace = construirEnlace(token.plano, "verificar")
    const plantilla = plantillaVerificacion(usuario.nombre, enlace)

    await enviarCorreo({
      para: usuario.correo,
      asunto: plantilla.asunto,
      html: plantilla.html,
      texto: plantilla.texto,
    })
  } catch {
    // R2.8: Si el envío falla, conservar usuario y marcar como fallido
    envioCorreo = "fallido"
  }

  return {
    usuario: {
      id: usuario.id,
      correo: usuario.correo,
      nombre: usuario.nombre,
      estado: usuario.estado,
      correo_verificado: usuario.correo_verificado,
      creado_en: usuario.creado_en,
    },
    envioCorreo,
  }
}

export interface ResultadoVerificacion {
  verificado: boolean
}

/**
 * Verifica el correo de un usuario usando un token de verificación.
 *
 * - Hashea el token y busca en tokens_verificacion (R3.4)
 * - Si no existe → TokenInvalidoError (R3.6)
 * - Si ya consumido y usuario verificado → retorna éxito idempotente (R3.5)
 * - Si ya consumido pero usuario no verificado → TokenInvalidoError
 * - Si expirado → TokenInvalidoError (R3.6)
 * - Si válido → marca correo_verificado=true, estado=activo, consumido_en=now (R3.4)
 */
/**
 * Reenvía el correo de verificación para un usuario no verificado.
 *
 * - Busca usuario por correo normalizado
 * - Si no existe o ya está verificado, retorna silenciosamente (no revelar existencia) (R3.8)
 * - Invalida tokens previos no consumidos (R3.9)
 * - Genera nuevo token y envía correo de verificación
 */
export async function reenviarVerificacion(correo: string): Promise<{ ok: true }> {
  const correoNormalizado = correo.toLowerCase().trim()

  const usuario = await prisma.usuario.findUnique({
    where: { correo: correoNormalizado },
  })

  // No revelar existencia: retornar silenciosamente
  if (!usuario || usuario.correo_verificado) {
    return { ok: true }
  }

  // R3.9: Invalidar tokens previos no consumidos
  await prisma.tokenVerificacion.updateMany({
    where: {
      usuario_id: usuario.id,
      consumido_en: null,
    },
    data: {
      consumido_en: new Date(),
    },
  })

  // Generar nuevo token
  const token = generarToken()
  const horas = vigenciaTokenHoras(process.env.TOKEN_VERIFICACION_HORAS)
  const expiraEn = new Date(Date.now() + horas * 60 * 60 * 1000)

  await prisma.tokenVerificacion.create({
    data: {
      usuario_id: usuario.id,
      token_hash: token.hash,
      expira_en: expiraEn,
    },
  })

  // Enviar correo de verificación
  const enlace = construirEnlace(token.plano, "verificar")
  const plantilla = plantillaVerificacion(usuario.nombre, enlace)

  await enviarCorreo({
    para: usuario.correo,
    asunto: plantilla.asunto,
    html: plantilla.html,
    texto: plantilla.texto,
  })

  return { ok: true }
}

export async function verificarCorreo(token: string): Promise<ResultadoVerificacion> {
  const tokenHash = hashToken(token)

  const tokenRecord = await prisma.tokenVerificacion.findUnique({
    where: { token_hash: tokenHash },
    include: { usuario: true },
  })

  // R3.6: Token inexistente
  if (!tokenRecord) {
    throw new TokenInvalidoError()
  }

  // R3.5: Token ya consumido
  if (tokenRecord.consumido_en !== null) {
    if (tokenRecord.usuario.correo_verificado) {
      // Idempotencia: usuario ya verificado, retornar éxito
      return { verificado: true }
    }
    // Token consumido pero usuario no verificado → inválido
    throw new TokenInvalidoError()
  }

  // R3.6: Token expirado
  if (new Date() > tokenRecord.expira_en) {
    throw new TokenInvalidoError()
  }

  // R3.4: Marcar token como consumido y activar usuario
  const ahora = new Date()

  await prisma.tokenVerificacion.update({
    where: { id: tokenRecord.id },
    data: { consumido_en: ahora },
  })

  await prisma.usuario.update({
    where: { id: tokenRecord.usuario_id },
    data: {
      correo_verificado: true,
      estado: "activo",
    },
  })

  return { verificado: true }
}
