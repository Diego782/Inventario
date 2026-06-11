import nodemailer from "nodemailer"

/**
 * Retorna `true` si las tres variables de entorno SMTP requeridas están presentes.
 * En caso contrario el sistema usará el fallback de consola (R6.3).
 */
export function configurado(): boolean {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD
  )
}

/**
 * Crea y devuelve un transporte SMTP de nodemailer configurado desde variables de entorno.
 * Solo debe llamarse cuando `configurado()` retorna `true`.
 */
export function crearTransporte() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  })
}
