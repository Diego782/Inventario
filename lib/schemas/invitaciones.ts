import { z } from "zod"

export const invitarSchema = z.object({
  correo: z.string().trim().toLowerCase().email().max(254),
  nombre: z.string().trim().max(160).optional(),
  rol_id: z.string().uuid(),
})

export const aceptarInvitacionSchema = z.object({
  token: z.string().min(1),
})

export type InvitarInput = z.infer<typeof invitarSchema>
export type AceptarInvitacionInput = z.infer<typeof aceptarInvitacionSchema>
