/**
 * lib/correo/errores.ts
 * Errores de dominio del servicio de correo.
 */

/**
 * Error lanzado cuando el transporte SMTP falla o no responde a tiempo.
 * Se mapea a HTTP 502 con código `ENVIO_CORREO_FALLIDO`.
 */
export class ErrorEnvioCorreo extends Error {
  constructor(cause?: unknown) {
    super("ENVIO_CORREO_FALLIDO")
    this.name = "ErrorEnvioCorreo"
    if (cause) this.cause = cause
  }
}

/**
 * Error lanzado cuando la variable de entorno `APP_URL` no está definida o está vacía.
 * Se mapea a HTTP 500 con código `APP_URL_NO_CONFIGURADA`.
 */
export class ErrorAppUrl extends Error {
  constructor() {
    super("APP_URL_NO_CONFIGURADA")
    this.name = "ErrorAppUrl"
  }
}
