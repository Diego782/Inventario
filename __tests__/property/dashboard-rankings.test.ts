// Feature: dashboard-metricas-notificaciones, Property 6: Orden y desempate de rankings
// Validates: Requirements 3.6, 3.7, 3.8, 3.9, 3.10, 3.12
import { describe, it } from "vitest"
import * as fc from "fast-check"
import { ordenarRanking } from "@/lib/dominio/rankings"

// ---------------------------------------------------------------------------
// Generadores
// ---------------------------------------------------------------------------
// El rango pequeño de `valor` fuerza empates frecuentes en la métrica, de modo
// que el desempate por `producto_id` ascendente se ejercita con frecuencia.
const arbRankItem = fc.record({
  producto_id: fc.uuid(),
  valor: fc.integer({ min: 0, max: 50 }),
})
const arbItems = fc.array(arbRankItem, { minLength: 0, maxLength: 60 })
const arbLimite = fc.integer({ min: 1, max: 50 })
const arbDireccion = fc.constantFrom<"asc" | "desc">("asc", "desc")

type RankItem = { producto_id: string; valor: number }

// Comparador de referencia: ordena por la métrica en la dirección indicada y
// desempata SIEMPRE por producto_id ascendente.
function comparar(a: RankItem, b: RankItem, direccion: "asc" | "desc"): number {
  if (a.valor !== b.valor) {
    return direccion === "desc" ? b.valor - a.valor : a.valor - b.valor
  }
  // Empate en la métrica ⇒ desempate por producto_id ascendente.
  if (a.producto_id < b.producto_id) return -1
  if (a.producto_id > b.producto_id) return 1
  return 0
}

describe("Property 6: Orden y desempate de rankings", () => {
  it("P6 — ordenarRanking es monótono en la dirección, desempata por producto_id asc y respeta el límite", () => {
    fc.assert(
      fc.property(arbItems, arbDireccion, arbLimite, (items, direccion, limite) => {
        const resultado = ordenarRanking(
          items as RankItem[],
          "valor",
          direccion,
          limite
        ) as RankItem[]

        // Invariante 1: longitud ≤ limite y exactamente min(items.length, limite).
        if (resultado.length > limite) return false
        if (resultado.length !== Math.min(items.length, limite)) return false

        // Invariante 2 y 3: monotonía por la métrica en la dirección dada y
        // desempate por producto_id ascendente entre elementos adyacentes.
        for (let i = 1; i < resultado.length; i++) {
          const prev = resultado[i - 1]
          const cur = resultado[i]
          if (direccion === "desc") {
            if (prev.valor < cur.valor) return false
          } else {
            if (prev.valor > cur.valor) return false
          }
          // Ante empate en la métrica, producto_id debe quedar ascendente.
          if (prev.valor === cur.valor && prev.producto_id > cur.producto_id) {
            return false
          }
        }

        // Invariante 4: el resultado coincide exactamente con el orden de
        // referencia truncado a `limite` (preserva los elementos correctos).
        const esperado = [...(items as RankItem[])]
          .sort((a, b) => comparar(a, b, direccion))
          .slice(0, limite)

        if (resultado.length !== esperado.length) return false
        for (let i = 0; i < esperado.length; i++) {
          if (resultado[i].producto_id !== esperado[i].producto_id) return false
          if (resultado[i].valor !== esperado[i].valor) return false
        }

        return true
      }),
      { numRuns: 100 }
    )
  })
})
