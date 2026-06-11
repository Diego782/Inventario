/**
 * lib/api/respuestas-auth.ts
 * Helpers para construir respuestas HTTP de error de autenticación/autorización.
 * Extiende el catálogo de mensajes con códigos específicos de auth.
 */

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
} as const

// ---- Mapa de mensajes de auth por código ----

const MENSAJES_AUTH: Record<string, string> = {
  NO_AUTENTICADO: "No autenticado",
  PERMISO_DENEGADO: "Permiso denegado",
  SIN_ORGANIZACION_ACTIVA: "Sin organización activa",
  SESION_INVALIDA: "Sesión inválida",
  MEMBRESIA_NO_ACTIVA: "Membresía no activa",
  CORREO_DUPLICADO: "Ya existe una cuenta con ese correo electrónico.",
  DEMASIADOS_INTENTOS: "Demasiados intentos. Intente más tarde.",
  APP_URL_NO_CONFIGURADA: "Configuración del servidor incompleta.",
  ENVIO_CORREO_FALLIDO: "No se pudo enviar el correo. Intente más tarde.",
  ERROR_INTERNO: "Ocurrió un error inesperado.",
  CREDENCIALES_INVALIDAS: "Correo o contraseña incorrectos.",
  CORREO_NO_VERIFICADO: "Debe verificar su correo electrónico antes de iniciar sesión.",
  TOKEN_INVALIDO: "El enlace es inválido o ha expirado.",
  LIMITE_REENVIO_EXCEDIDO: "Demasiadas solicitudes de reenvío. Intente más tarde.",
  ORGANIZACION_FALLIDA: "No se pudo crear la organización. Intente de nuevo.",
  MIEMBRO_EXISTENTE: "El correo ya es miembro activo de esta organización.",
  ROL_FUERA_DE_ORGANIZACION: "El rol no pertenece a esta organización.",
  INVITACION_INVALIDA: "La invitación no existe, ha expirado o fue revocada.",
  INVITACION_OTRO_CORREO: "Esta invitación pertenece a otro correo electrónico.",
  INVITACION_NO_PENDIENTE: "La invitación no está en estado pendiente y no puede ser revocada.",
  ROL_PROPIETARIO_PROTEGIDO: "El rol de propietario del sistema no puede ser editado ni eliminado.",
  PROPIETARIO_REQUERIDO: "La organización debe tener al menos un miembro con el rol de propietario.",
  ROL_INVALIDO: "El nombre del rol ya existe en esta organización o los permisos son inválidos.",
  ROL_NO_ENCONTRADO: "El rol no existe en esta organización.",
  MEMBRESIA_NO_ENCONTRADA: "La membresía no existe en esta organización.",
  MEMBRESIA_FUERA_DE_ORGANIZACION: "La membresía no pertenece a esta organización.",
  HORARIO_NO_ENCONTRADO: "El horario no existe en esta organización.",
}

export function mensajePorCodigo(codigo: string): string {
  return MENSAJES_AUTH[codigo] ?? "Ocurrió un error inesperado."
}

// ---- Respuesta de error de auth ----

export function errorAuth(codigo: string, status: number): Response {
  const body = {
    error: {
      codigo,
      mensaje: mensajePorCodigo(codigo),
    },
  }
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
