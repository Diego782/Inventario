// Feature: dashboard-metricas-notificaciones, Property 8: Orden y tope del listado de notificaciones
// Validates: Requirements 8.1
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { ordenarNotificaciones } from "@/lib/dominio/notificaciones"

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------
// arbNotif: id UUID + creado_en con colisiones forzadas. El rango pequeño de días
// (0..50) sobre una lista de hasta 250 elementos garantiza coincidencias de
// `creado_en` que ejercitan la regla de desempate descendente por `id`.
const arbNotif = fc.record({
  id: fc.uuid(),
  tipo: fc.constant("stock_critico"),
  titulo: fc.string(),
  mensaje: fc.string(),
  producto_id: fc.option(fc.uuid(), { nil: null }),
  leida: fc.boolean(),
  creado_en: fc
    .integer({ min: 0, max: 50 })
    .map((n) => new Date(2025, 0, 1 + n).toISOString()),
})

const arbNotifs = fc.array(arbNotif, { maxLength: 250 })

describe("Property 8: Orden y tope del listado de notificaciones", () => {
  it("P8 — ordena desc por creado_en, desempata desc por id y trunca a <=100", () => {
    fc.assert(
      fc.property(arbNotifs, (items) => {
        const resultado = ordenarNotificaciones(items)

        // Invariante 1: el resultado nunca excede 100 elementos (tope).
        if (resultado.length > 100) return false

        // Invariante 2: la longitud es min(entrada, 100).
        if (resultado.length !== Math.min(items.length, 100)) return false

        // Invariante 3: el orden es descendente por creado_en y, ante coincidencia,
        // descendente por id.
        for (let i = 1; i < resultado.length; i++) {
          const previo = resultado[i - 1]
          const actual = resultado[i]
          if (previo.creado_en < actual.creado_en) return false
          if (previo.creado_en === actual.creado_en && previo.id < actual.id) {
            return false
          }
        }

        // Invariante 4: el resultado es el prefijo de la entrada totalmente ordenada
        // (mismos elementos truncados, sin perder ni inventar registros).
        const ordenadoCompleto = [...items].sort((a, b) => {
          if (a.creado_en !== b.creado_en) {
            return a.creado_en < b.creado_en ? 1 : -1
          }
          if (a.id !== b.id) return a.id < b.id ? 1 : -1
          return 0
        })
        const esperado = ordenadoCompleto.slice(0, 100)
        if (resultado.length !== esperado.length) return false
        for (let i = 0; i < resultado.length; i++) {
          if (resultado[i].id !== esperado[i].id) return false
          if (resultado[i].creado_en !== esperado[i].creado_en) return false
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})
