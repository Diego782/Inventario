/**
 * lib/api/serializadores-auth.ts
 * Convierte entidades de Prisma (auth/organizaciones) a DTOs seguros para la API.
 * NUNCA expone hash_contrasena, hash_sesion ni token_hash.
 *
 * Validates: Requirements R2.6, R16.1
 */
import type {
  Usuario as PUsuario,
  Organizacion as POrganizacion,
  Membresia as PMembresia,
  Invitacion as PInvitacion,
  HorarioMiembro as PHorarioMiembro,
  Rol as PRol,
  PermisoRol as PPermisoRol,
} from "@prisma/client"

// ---- Tipos DTO ----

export type UsuarioDTO = {
  id: string
  correo: string
  nombre: string
  correo_verificado: boolean
  estado: string
  creado_en: string
  actualizado_en: string
}

export type OrganizacionDTO = {
  id: string
  nombre: string
  slug: string
  logo: string | null
  logo_aspecto: string | null
  creado_por: string
  creado_en: string
  actualizado_en: string
}

export type OrganizacionConRolDTO = OrganizacionDTO & {
  rol: string
}

export type MiembroDTO = {
  id: string
  usuario: Pick<UsuarioDTO, "id" | "correo" | "nombre">
  rol: string
  es_propietario: boolean
  estado: string
  creado_en: string
}

export type InvitacionDTO = {
  id: string
  correo: string
  rol: string
  estado: string
  expira_en: string
  creado_en: string
}

export type HorarioMiembroDTO = {
  id: string
  membresia_id: string
  dia: number
  hora_inicio: string | null
  hora_fin: string | null
  tipo: string
  creado_en: string
}

export type RolDTO = {
  id: string
  nombre: string
  es_sistema: boolean
  permisos: Array<{ seccion: string; accion: string }>
  creado_en: string
}

// ---- Conversores ----

export function toUsuarioDTO(u: PUsuario): UsuarioDTO {
  return {
    id: u.id,
    correo: u.correo,
    nombre: u.nombre,
    correo_verificado: u.correo_verificado,
    estado: u.estado,
    creado_en: u.creado_en.toISOString(),
    actualizado_en: u.actualizado_en.toISOString(),
  }
}

export function toOrganizacionDTO(o: POrganizacion): OrganizacionDTO {
  return {
    id: o.id,
    nombre: o.nombre,
    slug: o.slug,
    logo: o.logo ?? null,
    logo_aspecto: o.logo_aspecto ?? null,
    creado_por: o.creado_por,
    creado_en: o.creado_en.toISOString(),
    actualizado_en: o.actualizado_en.toISOString(),
  }
}

export function toMiembroDTO(
  m: PMembresia & { usuario: PUsuario; rol: PRol }
): MiembroDTO {
  return {
    id: m.id,
    usuario: {
      id: m.usuario.id,
      correo: m.usuario.correo,
      nombre: m.usuario.nombre,
    },
    rol: m.rol.nombre,
    es_propietario: m.rol.es_sistema,
    estado: m.estado,
    creado_en: m.creado_en.toISOString(),
  }
}

export function toInvitacionDTO(
  i: PInvitacion & { rol: PRol }
): InvitacionDTO {
  return {
    id: i.id,
    correo: i.correo,
    rol: i.rol.nombre,
    estado: i.estado,
    expira_en: i.expira_en.toISOString(),
    creado_en: i.creado_en.toISOString(),
  }
}

export function toHorarioDTO(h: PHorarioMiembro): HorarioMiembroDTO {
  return {
    id: h.id,
    membresia_id: h.membresia_id,
    dia: h.dia,
    hora_inicio: h.hora_inicio,
    hora_fin: h.hora_fin,
    tipo: h.tipo,
    creado_en: h.creado_en.toISOString(),
  }
}

export function toRolDTO(r: PRol & { permisos: PPermisoRol[] }): RolDTO {
  return {
    id: r.id,
    nombre: r.nombre,
    es_sistema: r.es_sistema,
    permisos: r.permisos.map((p) => ({ seccion: p.seccion, accion: p.accion })),
    creado_en: r.creado_en.toISOString(),
  }
}
