import { z } from "zod"

export const actualizarConfiguracionSchema = z.object({
  porcentaje_impuesto: z.number().min(0).max(100).optional(),
  etiqueta_ancho_mm: z.number().int().min(20).max(200).optional(),
  etiqueta_alto_mm: z.number().int().min(10).max(150).optional(),
  ticket_ancho_mm: z.number().int().min(40).max(200).optional(),
  imprimir_automaticamente: z.boolean().optional(),
  permitir_sobreventa: z.boolean().optional(),
})

export type ActualizarConfiguracionInput = z.infer<typeof actualizarConfiguracionSchema>

// Tipo de configuración completa con defaults
export type ConfiguracionMap = {
  porcentaje_impuesto: number
  etiqueta_ancho_mm: number
  etiqueta_alto_mm: number
  ticket_ancho_mm: number
  imprimir_automaticamente: boolean
  permitir_sobreventa: boolean
}

export const CONFIG_DEFAULTS: ConfiguracionMap = {
  porcentaje_impuesto: 0,
  etiqueta_ancho_mm: 57,
  etiqueta_alto_mm: 40,
  ticket_ancho_mm: 80,
  imprimir_automaticamente: false,
  permitir_sobreventa: false,
}
