import { z } from "zod"

const horaSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional()

export const crearHorarioSchema = z.object({
  membresia_id: z.string().uuid(),
  dia: z.number().int().min(0).max(6),
  hora_inicio: horaSchema,
  hora_fin: horaSchema,
  tipo: z.enum(["normal", "vacaciones", "incapacidad", "descanso"]),
})

export const editarHorarioSchema = z.object({
  dia: z.number().int().min(0).max(6).optional(),
  hora_inicio: horaSchema,
  hora_fin: horaSchema,
  tipo: z.enum(["normal", "vacaciones", "incapacidad", "descanso"]).optional(),
})

export type CrearHorarioInput = z.infer<typeof crearHorarioSchema>
export type EditarHorarioInput = z.infer<typeof editarHorarioSchema>
