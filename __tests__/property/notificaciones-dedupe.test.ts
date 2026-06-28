// Feature: dashboard-metricas-notificaciones, Property 7: Deduplicación lógica de stock crítico
// Validates: Requirements 6.5, 6.6, 7.1, 7.3, 7.4, 7.5
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import * as fc from "fast-check"
import { randomUUID } from "node:crypto"

// `detectarStockCritico` aún no existe: este test debe COMPILAR pero FALLAR
// hasta que se implemente `lib/dominio/notificaciones.ts` (TDD test-first).
import { detectarStockCritico } from "@/lib/dominio/notificaciones"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Organización por defecto sembrada por la migración multi-tenant del core.
const DEFAULT_ORG_ID = "00000000-0000-4000-8000-000000000001"

// `stock_minimo` fijo ⇒ Crítico cuando stock === 0 o stock <= stock_minimo * 0.3 = 3.
const STOCK_MINIMO = 10
const STOCK_INICIAL = 100

type EstadoStock = "En Stock" | "Bajo Stock" | "Crítico"

// Oráculo independiente del módulo bajo prueba (misma regla que el core / R Estado_Stock).
function estadoStockModelo(stockActual: number, stockMinimo: number): EstadoStock {
  if (stockActual === 0 || stockActual <= stockMinimo * 0.3) return "Crítico"
  if (stockActual <= stockMinimo) return "Bajo Stock"
  return "En Stock"
}

// ---- Generadores ----

const arbEvento = fc.oneof(
  fc.record({ tipo: fc.constant("stock" as const), stock: fc.integer({ min: 0, max: 30 }) }),
  fc.record({ tipo: fc.constant("marcar_leidas" as const) }),
)
const arbHistoria = fc.array(arbEvento, { maxLength: 40 })

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Property 7: Deduplicación lógica de stock crítico",
  () => {
    let prisma: import("@prisma/client").PrismaClient

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p
    })

    afterAll(async () => {
      // Limpia cualquier notificación residual de la corrida PBT.
      await prisma.notificacion.deleteMany({
        where: { clave_deduplicacion: { startsWith: "stock_critico:" }, tipo: "stock_critico" },
      })
    })

    it("P7 — nunca más de una notificación no leída por clave; creación sólo en transición a Crítico", async () => {
      await fc.assert(
        fc.asyncProperty(arbHistoria, async (historia) => {
          const productoId = randomUUID()
          const clave = `stock_critico:${productoId}`
          const nombre = "Producto PBT"

          await prisma.producto.create({
            data: {
              id: productoId,
              organizacion_id: DEFAULT_ORG_ID,
              sku: `PBT-${productoId.slice(0, 12)}`,
              nombre,
              precio_venta: 100,
              precio_compra: 50,
              stock_actual: STOCK_INICIAL,
              stock_minimo: STOCK_MINIMO,
            },
          })

          try {
            // Estado del modelo de referencia en memoria.
            let estadoModelo = estadoStockModelo(STOCK_INICIAL, STOCK_MINIMO)
            let hayNoLeidaModelo = false

            for (const evento of historia) {
              if (evento.tipo === "stock") {
                const estadoPrevio = estadoModelo
                const nuevoStock = evento.stock
                const estadoNuevo = estadoStockModelo(nuevoStock, STOCK_MINIMO)

                // Aplica el cambio de stock + detección dentro de una única transacción.
                await prisma.$transaction(async (tx) => {
                  await tx.producto.update({
                    where: { id: productoId },
                    data: { stock_actual: nuevoStock },
                  })
                  await detectarStockCritico(
                    tx,
                    {
                      producto_id: productoId,
                      nombre,
                      stock_actual: nuevoStock,
                      stock_minimo: STOCK_MINIMO,
                      organizacion_id: DEFAULT_ORG_ID,
                    },
                    estadoPrevio,
                  )
                })

                // Modelo: se crea exactamente al transicionar no-Crítico ⇒ Crítico
                // y sólo si no había ya una notificación no leída (R7.1, R7.4, R7.5).
                const deberiaCrear =
                  estadoPrevio !== "Crítico" && estadoNuevo === "Crítico" && !hayNoLeidaModelo
                if (deberiaCrear) hayNoLeidaModelo = true
                estadoModelo = estadoNuevo
              } else {
                // marcar_leidas: todas las no leídas de la clave pasan a leídas.
                await prisma.notificacion.updateMany({
                  where: { clave_deduplicacion: clave, leida: false },
                  data: { leida: true },
                })
                hayNoLeidaModelo = false
              }

              // Invariante duro: jamás más de una no leída con esta clave (R6.5, R7.4).
              const noLeidas = await prisma.notificacion.count({
                where: { clave_deduplicacion: clave, leida: false },
              })
              expect(noLeidas).toBeLessThanOrEqual(1)

              // El estado real de la BD coincide con el modelo de referencia.
              expect(noLeidas).toBe(hayNoLeidaModelo ? 1 : 0)
            }
          } finally {
            // Limpieza determinista por iteración (notificaciones antes del producto por la FK).
            await prisma.notificacion.deleteMany({ where: { producto_id: productoId } })
            await prisma.notificacion.deleteMany({ where: { clave_deduplicacion: clave } })
            await prisma.producto.delete({ where: { id: productoId } }).catch(() => {})
          }
        }),
        { numRuns: 50 },
      )
    })
  },
)
