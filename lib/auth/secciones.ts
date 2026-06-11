// lib/auth/secciones.ts
export const SECCIONES = [
  "dashboard", "inventario", "ventas", "fiadores",
  "empleados", "horarios", "configuracion", "usuarios",
] as const
export type Seccion = (typeof SECCIONES)[number]

export const ACCIONES = ["ver", "crear", "editar", "eliminar", "administrar"] as const
export type Accion = (typeof ACCIONES)[number]

// label del Sidebar ↔ seccion de permiso
// "Empleados" en el sidebar ahora cubre la sección de permisos "usuarios"
export const LABEL_A_SECCION: Record<string, Seccion> = {
  Dashboard: "dashboard", Inventario: "inventario", Ventas: "ventas",
  Fiadores: "fiadores", Empleados: "usuarios", Horarios: "horarios",
  Configuracion: "configuracion",
}
