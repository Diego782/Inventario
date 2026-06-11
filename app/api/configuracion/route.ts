import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { resolverContexto } from "@/lib/auth/contexto-request"
import { errorAuth } from "@/lib/api/respuestas-auth"
import { actualizarConfiguracionSchema, CONFIG_DEFAULTS, COLOR_TEMA_DEGO, type ConfiguracionMap } from "@/lib/schemas/configuracion"

/**
 * Variante local de `resolverContexto` para el endpoint de configuración.
 *
 * R8.4/R8.5: la Configuracion_Organizacion exige responder **403**
 * `SIN_ORGANIZACION_ACTIVA` cuando hay una Sesion válida pero el Usuario_Actual
 * no tiene una Organizacion_Activa, mientras que `resolverContexto` devuelve hoy
 * **409** para ese código (ver `lib/auth/contexto-request.ts`).
 *
 * Para no alterar el comportamiento del guard compartido (y sus otros
 * consumidores), aquí se re-mapea localmente ese resultado a 403, conservando el
 * 401 `NO_AUTENTICADO` cuando no hay sesión. El 409 sólo lo emite el guard para
 * el código `SIN_ORGANIZACION_ACTIVA`, por lo que el remapeo es seguro y
 * específico de esta ruta.
 */
type RequeridoConfig = Parameters<typeof resolverContexto>[0]

async function resolverContextoConfiguracion(requerido: RequeridoConfig) {
  const resultado = await resolverContexto(requerido)
  if (resultado.error && resultado.error.status === 409) {
    return { error: errorAuth("SIN_ORGANIZACION_ACTIVA", 403) } as typeof resultado
  }
  return resultado
}

/**
 * Lee la configuración de la BD para una organización y aplica defaults para claves faltantes.
 */
async function leerConfiguracion(organizacion_id: string): Promise<ConfiguracionMap> {
  const filas = await prisma.configuracion.findMany({
    where: { organizacion_id },
  })
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
    // Claves de Identidad_Visual (Color_Tema). R6.6: el default NO se persiste
    // hasta una actualización explícita; aquí solo se aplica en lectura.
    color_hue: mapa.color_hue !== undefined
      ? parseFloat(mapa.color_hue)
      : COLOR_TEMA_DEGO.color_hue,
    color_saturation: mapa.color_saturation !== undefined
      ? parseFloat(mapa.color_saturation)
      : COLOR_TEMA_DEGO.color_saturation,
    color_lightness: mapa.color_lightness !== undefined
      ? parseFloat(mapa.color_lightness)
      : COLOR_TEMA_DEGO.color_lightness,
  }
}

export async function GET() {
  const { ctx, error } = await resolverContextoConfiguracion("requiere-organizacion")
  if (error) return error

  try {
    const config = await leerConfiguracion(ctx.organizacionActiva!.id)
    return ok(config)
  } catch (e) {
    return mapPrismaError(e)
  }
}

export async function PUT(req: NextRequest) {
  const { ctx, error } = await resolverContextoConfiguracion({ seccion: "configuracion", accion: "editar" })
  if (error) return error

  return withValidation(actualizarConfiguracionSchema, req, async (input) => {
    try {
      const organizacion_id = ctx.organizacionActiva!.id

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
      // Claves de Identidad_Visual (Color_Tema). R6.4: persistir solo cuando
      // están presentes en el payload validado (son opcionales). El alcance se
      // deriva siempre de la sesión (organizacion_id), nunca del payload (R8.6).
      if (input.color_hue !== undefined) {
        actualizaciones.push({ clave: "color_hue", valor: String(input.color_hue) })
      }
      if (input.color_saturation !== undefined) {
        actualizaciones.push({ clave: "color_saturation", valor: String(input.color_saturation) })
      }
      if (input.color_lightness !== undefined) {
        actualizaciones.push({ clave: "color_lightness", valor: String(input.color_lightness) })
      }

      // Upsert de cada clave usando la clave compuesta organizacion_id_clave
      await Promise.all(
        actualizaciones.map(({ clave, valor }) =>
          prisma.configuracion.upsert({
            where: { organizacion_id_clave: { organizacion_id, clave } },
            create: { organizacion_id, clave, valor },
            update: { valor },
          })
        )
      )

      // Retornar la configuración completa actualizada
      const config = await leerConfiguracion(organizacion_id)
      return ok(config)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
