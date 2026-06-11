/**
 * lib/auth/contexto-request.ts
 * Guard de contexto para rutas API protegidas.
 * Validates: Requirements R8.8, R11.4, R12.4, R13.5, R13.8, R16.4
 */
import { leerSesion } from "@/lib/auth/sesion"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { tienePermiso, type Permiso } from "@/lib/auth/permisos"
import { prisma } from "@/lib/db"
import type { Seccion, Accion } from "@/lib/auth/secciones"

type Requerido =
  | "solo-sesion"
  | "requiere-organizacion"
  | { seccion: Seccion; accion: Accion }

type Contexto = {
  usuarioActual: { id: string; correo: string; nombre: string }
  organizacionActiva: { id: string; nombre: string; slug: string } | null
  rol: string | null
  permisos: Permiso[]
  sesionId: string
}

type Resultado =
  | { ctx: Contexto; error?: never }
  | { error: Response; ctx?: never }

export async function resolverContexto(requerido: Requerido): Promise<Resultado> {
  const sesion = await leerSesion()

  if (!sesion) {
    return { error: errorAuth("NO_AUTENTICADO", 401) }
  }

  if (requerido === "solo-sesion") {
    return {
      ctx: {
        usuarioActual: sesion.usuario,
        organizacionActiva: null,
        rol: null,
        permisos: [],
        sesionId: sesion.sesion.id,
      },
    }
  }

  const orgId = sesion.sesion.organizacion_activa_id
  if (!orgId) {
    return { error: errorAuth("SIN_ORGANIZACION_ACTIVA", 409) }
  }

  const membresia = await prisma.membresia.findUnique({
    where: {
      usuario_id_organizacion_id: {
        usuario_id: sesion.usuario.id,
        organizacion_id: orgId,
      },
    },
    include: { organizacion: true, rol: { include: { permisos: true } } },
  })

  if (!membresia || membresia.estado !== "activa") {
    return { error: errorAuth("SIN_ORGANIZACION_ACTIVA", 409) }
  }

  const permisos: Permiso[] = membresia.rol.permisos.map((p) => ({
    seccion: p.seccion as Seccion,
    accion: p.accion as Accion,
  }))

  // "requiere-organizacion": basta con ser miembro activo de la organización,
  // sin exigir un permiso específico. Útil para datos de identidad visual
  // (Color_Tema, logo) que cualquier miembro puede leer.
  if (requerido !== "requiere-organizacion") {
    if (!tienePermiso(permisos, requerido.seccion, requerido.accion)) {
      return { error: errorAuth("PERMISO_DENEGADO", 403) }
    }
  }

  return {
    ctx: {
      usuarioActual: sesion.usuario,
      organizacionActiva: {
        id: membresia.organizacion.id,
        nombre: membresia.organizacion.nombre,
        slug: membresia.organizacion.slug,
      },
      rol: membresia.rol.nombre,
      permisos,
      sesionId: sesion.sesion.id,
    },
  }
}
