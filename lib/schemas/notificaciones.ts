import { z } from "zod"

// Query de GET /api/notificaciones: solo_no_leidas admite únicamente
// "true" | "false"; por defecto "false" cuando se omite (R8.2).
export const listarNotifQuerySchema = z.object({
  solo_no_leidas: z.enum(["true", "false"]).default("false"),
})

// Param de PATCH /api/notificaciones/{id}: el id debe ser un UUID (R8.10).
export const notifIdParamSchema = z.object({
  id: z.string().uuid("ID de notificación inválido"),
})

export type ListarNotifQuery = z.infer<typeof listarNotifQuerySchema>
export type NotifIdParam = z.infer<typeof notifIdParamSchema>
