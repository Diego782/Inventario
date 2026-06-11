/**
 * lib/dominio/errores-auth.ts
 * Errores de dominio de autenticación y registro.
 */

/**
 * Error lanzado cuando se intenta registrar un correo que ya existe.
 * Se mapea a HTTP 409 con código `CORREO_DUPLICADO` (R2.10).
 */
export class CorreoDuplicadoError extends Error {
  constructor() {
    super("CORREO_DUPLICADO")
    this.name = "CorreoDuplicadoError"
  }
}

/**
 * Error lanzado cuando un token de verificación no existe o ha expirado.
 * Se mapea a HTTP 400 con código `TOKEN_INVALIDO` (R3.6).
 */
export class TokenInvalidoError extends Error {
  constructor() {
    super("TOKEN_INVALIDO")
    this.name = "TokenInvalidoError"
  }
}

/**
 * Error lanzado cuando la transacción de creación de organización falla.
 * Se mapea a HTTP 500 con código `ORGANIZACION_FALLIDA` (R8.5).
 */
export class OrganizacionFallidaError extends Error {
  constructor() {
    super("ORGANIZACION_FALLIDA")
    this.name = "OrganizacionFallidaError"
  }
}

/**
 * Error lanzado cuando se intenta invitar a un correo que ya es miembro activo.
 * Se mapea a HTTP 409 con código `MIEMBRO_EXISTENTE` (R9.5).
 */
export class MiembroExistenteError extends Error {
  constructor() {
    super("MIEMBRO_EXISTENTE")
    this.name = "MiembroExistenteError"
  }
}

/**
 * Error lanzado cuando el rol_id no pertenece a la organización.
 * Se mapea a HTTP 400 con código `ROL_FUERA_DE_ORGANIZACION` (R9.9).
 */
export class RolFueraDeOrganizacionError extends Error {
  constructor() {
    super("ROL_FUERA_DE_ORGANIZACION")
    this.name = "RolFueraDeOrganizacionError"
  }
}

/**
 * Error lanzado cuando el token de invitación no existe, ha expirado o está revocado.
 * Se mapea a HTTP 400 con código `INVITACION_INVALIDA` (R10.4, R10.5).
 */
export class InvitacionInvalidaError extends Error {
  constructor() {
    super("INVITACION_INVALIDA")
    this.name = "InvitacionInvalidaError"
  }
}

/**
 * Error lanzado cuando el correo del usuario autenticado no coincide con el de la invitación.
 * Se mapea a HTTP 403 con código `INVITACION_OTRO_CORREO` (R10.7).
 */
export class InvitacionOtroCorreoError extends Error {
  constructor() {
    super("INVITACION_OTRO_CORREO")
    this.name = "InvitacionOtroCorreoError"
  }
}

/**
 * Error lanzado cuando se intenta crear un rol con nombre duplicado en la organización
 * o con datos inválidos.
 * Se mapea a HTTP 400 con código `ROL_INVALIDO` (R11.5).
 */
export class RolInvalidoError extends Error {
  constructor(mensaje?: string) {
    super(mensaje ?? "ROL_INVALIDO")
    this.name = "RolInvalidoError"
  }
}

/**
 * Error lanzado cuando se intenta editar o eliminar el Rol_Propietario (es_sistema=true).
 * Se mapea a HTTP 403 con código `ROL_PROPIETARIO_PROTEGIDO` (R11.6).
 */
export class RolPropietarioProtegidoError extends Error {
  constructor() {
    super("ROL_PROPIETARIO_PROTEGIDO")
    this.name = "RolPropietarioProtegidoError"
  }
}

/**
 * Error lanzado cuando eliminar un rol o cambiar una membresía dejaría la organización
 * sin ningún miembro con el Rol_Propietario.
 * Se mapea a HTTP 409 con código `PROPIETARIO_REQUERIDO` (R11.7).
 */
export class PropietarioRequeridoError extends Error {
  constructor() {
    super("PROPIETARIO_REQUERIDO")
    this.name = "PropietarioRequeridoError"
  }
}

/**
 * Error lanzado cuando se intenta asignar un horario a una membresía que no pertenece
 * a la organización activa.
 * Se mapea a HTTP 400 con código `MEMBRESIA_FUERA_DE_ORGANIZACION` (R14.3).
 */
export class MembresiaFueraDeOrganizacionError extends Error {
  constructor() {
    super("MEMBRESIA_FUERA_DE_ORGANIZACION")
    this.name = "MembresiaFueraDeOrganizacionError"
  }
}
