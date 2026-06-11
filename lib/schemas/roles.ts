import { z } from "zod"
import { SECCIONES, ACCIONES } from "@/lib/auth/secciones"

export const crearRolSchema = z.object({
  nombre: z.string().trim().min(1).max(80),
})

export const editarRolSchema = z.object({
  nombre: z.string().trim().min(1).max(80).optional(),
  permisos: z.array(z.object({
    seccion: z.enum(SECCIONES),
    accion: z.enum(ACCIONES),
  })).optional(),
})

export const asignarRolSchema = z.object({
  rol_id: z.string().uuid(),
})

export type CrearRolInput = z.infer<typeof crearRolSchema>
export type EditarRolInput = z.infer<typeof editarRolSchema>
export type AsignarRolInput = z.infer<typeof asignarRolSchema>
