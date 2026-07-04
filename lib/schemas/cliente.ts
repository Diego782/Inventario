/**
 * lib/schemas/cliente.ts
 * Schemas Zod para la creación y edición de Clientes.
 * Requirements: 4.2, 4.10, 4.11, 4.13
 */
import { z } from "zod"

export const crearClienteSchema = z.object({
  cedula: z
    .string()
    .trim()
    .regex(
      /^[a-zA-Z0-9]{5,20}$/,
      "La cédula debe tener entre 5 y 20 caracteres alfanuméricos"
    ),
  nombre: z.string().trim().min(1, "El nombre es obligatorio").max(100),
  telefono: z
    .string()
    .trim()
    .regex(/^\d{7,15}$/, "El teléfono debe tener entre 7 y 15 dígitos"),
  correo: z.string().trim().email().max(254).optional().nullable(),
  direccion: z.string().trim().max(240).optional().nullable(),
})

export const editarClienteSchema = crearClienteSchema.partial()

export type CrearClienteInput = z.infer<typeof crearClienteSchema>
export type EditarClienteInput = z.infer<typeof editarClienteSchema>
