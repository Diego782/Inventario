import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"

export async function POST() {
  try {
    const { count } = await prisma.notificacion.updateMany({
      where: { leida: false },
      data: { leida: true },
    })
    return ok({ actualizadas: count })
  } catch (e) {
    return mapPrismaError(e)
  }
}
