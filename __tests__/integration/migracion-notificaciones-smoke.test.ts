// __tests__/integration/migracion-notificaciones-smoke.test.ts
// Smoke test de la migración `notificaciones` contra una BD limpia.
// Verifica que la restricción UNIQUE de `clave_deduplicacion` rechaza
// claves duplicadas no nulas, pero permite múltiples filas con clave NULL.
// Validates: Requirements R6.5, R6.6
import { describe, it, expect, beforeAll, afterAll } from "vitest"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Etiqueta única por ejecución para aislar las filas creadas por este test
// y poder limpiarlas con seguridad en afterAll.
const SUFIJO = `smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
const CLAVE_DEDUP = `stock_critico:${SUFIJO}`
const TIPO = `test_smoke_${SUFIJO}`

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Migración notificaciones — smoke test de unicidad de clave_deduplicacion",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    const idsCreados: string[] = []

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p
    })

    afterAll(async () => {
      // Limpieza: elimina sólo las filas creadas por este test.
      if (!prisma) return
      await prisma.notificacion.deleteMany({
        where: { OR: [{ tipo: TIPO }, { id: { in: idsCreados } }] },
      })
    })

    it("acepta una Notificacion con clave_deduplicacion no nula", async () => {
      const notif = await prisma.notificacion.create({
        data: {
          tipo: TIPO,
          titulo: "Stock crítico",
          mensaje: "El producto alcanzó stock crítico.",
          clave_deduplicacion: CLAVE_DEDUP,
        },
      })
      idsCreados.push(notif.id)

      expect(notif.id).toBeTruthy()
      expect(notif.clave_deduplicacion).toBe(CLAVE_DEDUP)
      expect(notif.leida).toBe(false)
    })

    it("rechaza una segunda Notificacion con la misma clave_deduplicacion (UNIQUE)", async () => {
      await expect(
        prisma.notificacion.create({
          data: {
            tipo: TIPO,
            titulo: "Stock crítico duplicado",
            mensaje: "Intento de inserción con clave repetida.",
            clave_deduplicacion: CLAVE_DEDUP,
          },
        })
      ).rejects.toMatchObject({ code: "P2002" })
    })

    it("acepta dos Notificaciones con clave_deduplicacion = null", async () => {
      const primera = await prisma.notificacion.create({
        data: {
          tipo: TIPO,
          titulo: "Sin clave 1",
          mensaje: "Primera notificación sin clave de deduplicación.",
          clave_deduplicacion: null,
        },
      })
      idsCreados.push(primera.id)

      const segunda = await prisma.notificacion.create({
        data: {
          tipo: TIPO,
          titulo: "Sin clave 2",
          mensaje: "Segunda notificación sin clave de deduplicación.",
          clave_deduplicacion: null,
        },
      })
      idsCreados.push(segunda.id)

      expect(primera.id).not.toBe(segunda.id)
      expect(primera.clave_deduplicacion).toBeNull()
      expect(segunda.clave_deduplicacion).toBeNull()

      // Confirmación: ambas filas null persisten simultáneamente.
      const conteoNull = await prisma.notificacion.count({
        where: { tipo: TIPO, clave_deduplicacion: null },
      })
      expect(conteoNull).toBe(2)
    })
  }
)
