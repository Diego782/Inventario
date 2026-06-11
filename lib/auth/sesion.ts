/**
 * lib/auth/sesion.ts
 * Gestión de sesiones: lectura, creación e invalidación.
 * Validates: Requirements R4.2, R4.6, R4.7, R16.1, R16.2, R16.6
 */
import { cookies } from "next/headers"
import { prisma } from "@/lib/db"
import { generarToken, hashToken } from "@/lib/auth/tokens"
import { nuevaExpiracion } from "@/lib/auth/vigencia"
import { toUsuarioDTO, type UsuarioDTO } from "@/lib/api/serializadores-auth"

export const COOKIE_SESION = "sesion_invenpro"

export type SesionActiva = {
  usuario: UsuarioDTO
  sesion: { id: string; organizacion_activa_id: string | null }
}

/**
 * Lee la cookie de sesión, valida que exista en BD y no esté expirada.
 * Aplica sliding expiration si la sesión sigue vigente.
 * Devuelve null si no hay cookie, no existe en BD o está expirada.
 */
export async function leerSesion(): Promise<SesionActiva | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(COOKIE_SESION)?.value

  if (!token) return null

  const hash = hashToken(token)

  const sesion = await prisma.sesion.findUnique({
    where: { hash_sesion: hash },
    include: { usuario: true },
  })

  if (!sesion) return null

  // Verificar expiración
  if (new Date() > sesion.expira_en) {
    await prisma.sesion.delete({ where: { id: sesion.id } })
    return null
  }

  // Sliding expiration: renovar la fecha de expiración
  await prisma.sesion.update({
    where: { id: sesion.id },
    data: { expira_en: nuevaExpiracion() },
  })

  return {
    usuario: toUsuarioDTO(sesion.usuario),
    sesion: {
      id: sesion.id,
      organizacion_activa_id: sesion.organizacion_activa_id,
    },
  }
}

/**
 * Crea una nueva sesión para el usuario y devuelve el token plano
 * (que se almacenará en la cookie del cliente).
 */
export async function crearSesion(usuarioId: string): Promise<string> {
  const { plano, hash } = generarToken()

  await prisma.sesion.create({
    data: {
      usuario_id: usuarioId,
      hash_sesion: hash,
      expira_en: nuevaExpiracion(),
    },
  })

  return plano
}

/**
 * Invalida una sesión específica a partir del valor de la cookie.
 */
export async function invalidarSesionPorCookie(cookie: string): Promise<void> {
  const hash = hashToken(cookie)
  await prisma.sesion.deleteMany({ where: { hash_sesion: hash } })
}

/**
 * Invalida todas las sesiones de un usuario (R16.6 - logout global).
 */
export async function invalidarSesionesDeUsuario(usuarioId: string): Promise<void> {
  await prisma.sesion.deleteMany({ where: { usuario_id: usuarioId } })
}
