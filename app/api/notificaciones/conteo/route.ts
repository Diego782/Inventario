/**
 * app/api/notificaciones/conteo/route.ts
 * GET /api/notificaciones/conteo — devuelve el conteo de notificaciones sin leer.
 * Respuesta: 200 { conteo: number } (entero ≥ 0).
 * Errores: BD_NO_DISPONIBLE (503) ante fallos de inicialización/conexión de Prisma.
 */
import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"

export async function GET(): Promise<Response> {
  try {
    const conteo = await prisma.notificacion.count({ where: { leida: false } })
    return ok({ conteo })
  } catch (e) {
    return mapPrismaError(e)
  }
}
