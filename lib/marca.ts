/**
 * lib/marca.ts
 * Constante central de marca (Marca_Dego) para evitar literales dispersos.
 * Fuente única del nombre de marca, texto de respaldo, remitente de correo
 * y prefijo del logger usados en todo el Branding_Visible.
 *
 * - nombre: nombre de marca visible del producto.
 * - fallback: texto de respaldo neutral cuando "Dego" no esté disponible (R1.7).
 * - remitenteCorreo: nombre de remitente para correos transaccionales (R1.4).
 * - prefijoLog: prefijo de registro observable en logs (R1.6).
 */
export const MARCA = {
  nombre: "Dego",
  fallback: "Sistema de Inventario",
  remitenteCorreo: "Dego",
  prefijoLog: "[dego]",
} as const

export type Marca = typeof MARCA
