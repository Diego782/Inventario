import { z } from "zod"

// Color_Tema: triada (hue, saturation, lightness).
// Rangos: hue 0–360 (grados), saturation 0–1, lightness 0–1 (compatible con oklch).
export const colorTemaSchema = z.object({
  color_hue: z.number().min(0).max(360),
  color_saturation: z.number().min(0).max(1),
  color_lightness: z.number().min(0).max(1),
})

export const actualizarConfiguracionSchema = z.object({
  porcentaje_impuesto: z.number().min(0).max(100).optional(),
  etiqueta_ancho_mm: z.number().int().min(20).max(200).optional(),
  etiqueta_alto_mm: z.number().int().min(10).max(150).optional(),
  ticket_ancho_mm: z.number().int().min(40).max(200).optional(),
  imprimir_automaticamente: z.boolean().optional(),
  permitir_sobreventa: z.boolean().optional(),
  // Nuevas claves de Identidad_Visual (R6.4)
  color_hue: z.number().min(0).max(360).optional(),
  color_saturation: z.number().min(0).max(1).optional(),
  color_lightness: z.number().min(0).max(1).optional(),
})

export type ColorTema = z.infer<typeof colorTemaSchema>
export type ActualizarConfiguracionInput = z.infer<typeof actualizarConfiguracionSchema>

// Tipo de configuración completa con defaults
export type ConfiguracionMap = {
  porcentaje_impuesto: number
  etiqueta_ancho_mm: number
  etiqueta_alto_mm: number
  ticket_ancho_mm: number
  imprimir_automaticamente: boolean
  permitir_sobreventa: boolean
  color_hue: number
  color_saturation: number
  color_lightness: number
}

// Color_Tema por defecto de la Marca_Dego: negro/neutral (saturación 0 = sin tinte)
export const COLOR_TEMA_DEGO: ColorTema = {
  color_hue: 0,
  color_saturation: 0,
  color_lightness: 0.18, // negro suave, no plano (#0…)
}

export const CONFIG_DEFAULTS: ConfiguracionMap = {
  porcentaje_impuesto: 0,
  etiqueta_ancho_mm: 57,
  etiqueta_alto_mm: 40,
  ticket_ancho_mm: 80,
  imprimir_automaticamente: false,
  permitir_sobreventa: false,
  ...COLOR_TEMA_DEGO, // R6.6: default no persistido hasta actualización explícita
}
