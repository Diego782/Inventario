import { z } from "zod"

const correoSchema = z.string().trim().toLowerCase().email().max(254) // R2.9 normaliza

export const registroSchema = z.object({
  correo: correoSchema,
  nombre: z.string().trim().min(1).max(160),
  contrasena: z.string().min(8).max(128),
})

export const loginSchema = z.object({
  correo: correoSchema,
  contrasena: z.string().min(1).max(128),
})

export const verificarCorreoSchema = z.object({
  token: z.string().min(1),
})

export const reenviarVerificacionSchema = z.object({
  correo: correoSchema,
})

export type RegistroInput = z.infer<typeof registroSchema>
export type LoginInput = z.infer<typeof loginSchema>
export type VerificarCorreoInput = z.infer<typeof verificarCorreoSchema>
export type ReenviarVerificacionInput = z.infer<typeof reenviarVerificacionSchema>
