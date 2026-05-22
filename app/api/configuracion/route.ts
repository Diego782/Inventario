import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { actualizarConfiguracionSchema, CONFIG_DEFAULTS, type ConfiguracionMap } from "@/lib/schemas/configuracion"

/**
 * Lee la configuración de la BD y aplica defaults para claves faltantes.
 */
async function leerConfiguracion(): Promise<ConfiguracionMap> {
  const filas = await prisma.configuracion.findMany()
  const mapa: Record<string, string> = {}
  for (const fila of filas) {
    mapa[fila.clave] = fila.valor
  }

  return {
    porcentaje_impuesto: mapa.porcentaje_impuesto !== undefined
      ? parseFloat(mapa.porcentaje_impuesto)
      : CONFIG_DEFAULTS.porcentaje_impuesto,
    etiqueta_ancho_mm: mapa.etiqueta_ancho_mm !== undefined
      ? parseInt(mapa.etiqueta_ancho_mm, 10)
      : CONFIG_DEFAULTS.etiqueta_ancho_mm,
    etiqueta_alto_mm: mapa.etiqueta_alto_mm !== undefined
      ? parseInt(mapa.etiqueta_alto_mm, 10)
      : CONFIG_DEFAULTS.etiqueta_alto_mm,
    ticket_ancho_mm: mapa.ticket_ancho_mm !== undefined
      ? parseInt(mapa.ticket_ancho_mm, 10)
      : CONFIG_DEFAULTS.ticket_ancho_mm,
    imprimir_automaticamente: mapa.imprimir_automaticamente !== undefined
      ? mapa.imprimir_automaticamente === "true"
      : CONFIG_DEFAULTS.imprimir_automaticamente,
    permitir_sobreventa: mapa.permitir_sobreventa !== undefined
      ? mapa.permitir_sobreventa === "true"
      : CONFIG_DEFAULTS.permitir_sobreventa,
  }
}

export async function GET() {
  try {
    const config = await leerConfiguracion()
    return ok(config)
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function PUT(req: NextRequest) {
  return withValidation(actualizarConfiguracionSchema, req, async (input) => {
    try {
      // Persistir solo las claves presentes en el input
      const actualizaciones: Array<{ clave: string; valor: string }> = []

      if (input.porcentaje_impuesto !== undefined) {
        actualizaciones.push({ clave: "porcentaje_impuesto", valor: String(input.porcentaje_impuesto) })
      }
      if (input.etiqueta_ancho_mm !== undefined) {
        actualizaciones.push({ clave: "etiqueta_ancho_mm", valor: String(input.etiqueta_ancho_mm) })
      }
      if (input.etiqueta_alto_mm !== undefined) {
        actualizaciones.push({ clave: "etiqueta_alto_mm", valor: String(input.etiqueta_alto_mm) })
      }
      if (input.ticket_ancho_mm !== undefined) {
        actualizaciones.push({ clave: "ticket_ancho_mm", valor: String(input.ticket_ancho_mm) })
      }
      if (input.imprimir_automaticamente !== undefined) {
        actualizaciones.push({ clave: "imprimir_automaticamente", valor: String(input.imprimir_automaticamente) })
      }
      if (input.permitir_sobreventa !== undefined) {
        actualizaciones.push({ clave: "permitir_sobreventa", valor: String(input.permitir_sobreventa) })
      }

      // Upsert de cada clave
      await Promise.all(
        actualizaciones.map(({ clave, valor }) =>
          prisma.configuracion.upsert({
            where: { clave },
            create: { clave, valor },
            update: { valor },
          })
        )
      )

      // Retornar la configuración completa actualizada
      const config = await leerConfiguracion()
      return ok(config)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
