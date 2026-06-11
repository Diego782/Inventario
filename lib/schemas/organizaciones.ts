import { z } from "zod"

export const crearOrganizacionSchema = z.object({
  nombre: z.string().trim().min(1).max(160), // R8.6
})

export const seleccionOrgSchema = z.object({
  organizacion_id: z.string().uuid(),
})

// Proporciones de logo permitidas para la presentación en el sidebar.
export const ASPECTOS_LOGO = ["1:1", "4:3", "16:9", "3:1"] as const
export type AspectoLogo = (typeof ASPECTOS_LOGO)[number]

// Límite defensivo del data URL del logo (~1.4 MB de binario en base64).
const MAX_LOGO_LEN = 2_000_000

export const actualizarOrganizacionSchema = z
  .object({
    nombre: z.string().trim().min(1, "El nombre es obligatorio").max(160).optional(),
    // data URL (data:image/...;base64,...) o null para eliminar el logo.
    logo: z
      .string()
      .max(MAX_LOGO_LEN, "La imagen es demasiado grande")
      .refine((v) => v.startsWith("data:image/"), "El logo debe ser una imagen válida")
      .nullable()
      .optional(),
    logo_aspecto: z.enum(ASPECTOS_LOGO).nullable().optional(),
  })
  .refine(
    (v) => v.nombre !== undefined || v.logo !== undefined || v.logo_aspecto !== undefined,
    { message: "No hay cambios para guardar" }
  )

export type CrearOrganizacionInput = z.infer<typeof crearOrganizacionSchema>
export type SeleccionOrgInput = z.infer<typeof seleccionOrgSchema>
export type ActualizarOrganizacionInput = z.infer<typeof actualizarOrganizacionSchema>
