import { z } from "zod"

export const crearCategoriaSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(80),
})

export type CrearCategoriaInput = z.infer<typeof crearCategoriaSchema>
