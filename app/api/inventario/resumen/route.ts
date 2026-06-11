import { NextRequest } from "next/server"
import { prisma } from "@/lib/db"
import { ok } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { resolverContexto } from "@/lib/auth/contexto-request"

export async function GET(_req: NextRequest) {
  const { ctx, error } = await resolverContexto({ seccion: "inventario", accion: "ver" })
  if (error) return error

  const orgId = ctx.organizacionActiva!.id

  try {
    // Contar todos los productos activos del tenant
    const total = await prisma.producto.count({ where: { activo: true, organizacion_id: orgId } })

    // Contar por estado de stock usando la lógica de R7:
    // Crítico: stock_actual = 0 OR stock_actual <= stock_minimo * 0.3
    // Bajo Stock: stock_actual > stock_minimo * 0.3 AND stock_actual <= stock_minimo
    // En Stock: stock_actual > stock_minimo

    // Usamos raw query para el cálculo de porcentaje
    const resultados = await prisma.$queryRaw<Array<{ estado: string; cantidad: bigint }>>`
      SELECT
        CASE
          WHEN stock_actual = 0 OR stock_actual <= stock_minimo * 0.3 THEN 'Crítico'
          WHEN stock_actual <= stock_minimo THEN 'Bajo Stock'
          ELSE 'En Stock'
        END AS estado,
        COUNT(*) AS cantidad
      FROM productos
      WHERE activo = true AND organizacion_id = ${orgId}
      GROUP BY estado
    `

    const conteos: Record<string, number> = {
      "En Stock": 0,
      "Bajo Stock": 0,
      "Crítico": 0,
    }

    for (const row of resultados) {
      conteos[row.estado] = Number(row.cantidad)
    }

    return ok({
      total,
      en_stock: conteos["En Stock"],
      bajo_stock: conteos["Bajo Stock"],
      critico: conteos["Crítico"],
    })
  } catch (e) {
    return mapPrismaError(e)
  }
}
