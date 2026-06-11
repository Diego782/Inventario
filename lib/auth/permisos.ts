import { SECCIONES, ACCIONES, type Seccion, type Accion } from "@/lib/auth/secciones"

export type Permiso = { seccion: Seccion; accion: Accion }

export const PERMISOS_PROPIETARIO: Permiso[] = SECCIONES.flatMap(
  (seccion) => ACCIONES.map((accion) => ({ seccion, accion }))
)

export function tienePermiso(permisos: Permiso[], seccion: Seccion, accion: Accion): boolean {
  return permisos.some((p) => p.seccion === seccion && p.accion === accion)
}

export function seccionesVisibles(permisos: Permiso[]): Seccion[] {
  return SECCIONES.filter((s) => tienePermiso(permisos, s, "ver"))
}
