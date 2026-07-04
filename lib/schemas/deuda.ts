/**
 * lib/schemas/deuda.ts
 * Schemas Zod para operaciones sobre deuda (abonos y extensión de plazo).
 * Requirements: 5.7, 5.8, 5.9, 8.8, 8.9
 */
import { z } from "zod"

/**
 * Schema de validación para registrar un abono.
 *
 * Solo valida que el monto sea positivo y tenga a lo sumo 2 decimales.
 * La validación del límite superior (`monto <= saldo_actual`) se realiza
 * en la capa de dominio porque requiere consultar la BD (Req 5.8).
 */
export const registrarAbonoSchema = z.object({
  monto: z
    .number({
      required_error: "El monto es obligatorio",
      invalid_type_error: "El monto debe ser un número",
    })
    .positive("El monto debe ser mayor que cero")
    .multipleOf(0.01, "El monto no puede tener más de 2 decimales"),
})

/**
 * Schema de validación para extender el plazo de una deuda.
 * La validación de que la nueva fecha sea posterior al plazo vigente
 * se realiza en la capa de dominio (Req 8.9).
 */
export const extenderDeudaSchema = z.object({
  nueva_fecha: z.coerce.date({
    required_error: "La nueva fecha es obligatoria",
    invalid_type_error: "La nueva fecha no es válida",
  }),
})

export type RegistrarAbonoInput = z.infer<typeof registrarAbonoSchema>
export type ExtenderDeudaInput = z.infer<typeof extenderDeudaSchema>
