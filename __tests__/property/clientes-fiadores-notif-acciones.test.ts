// Feature: gestion-clientes-y-fiadores, Property 19: Acciones rápidas por tipo de notificación
import { describe, it, expect } from "vitest"
import * as fc from "fast-check"
import { accionesPorTipo, type AccionRapida } from "@/lib/api/serializadores"

/**
 * Property 19: Acciones rápidas por tipo de notificación
 *
 * Para toda notificación, el conjunto de Acciones_Rapidas expuesto está
 * determinado exactamente por su tipo:
 *   - stock_cero:        {"Ajustar stock", "Eliminar producto"}  (Req 8.2)
 *   - stock_critico:     {"Ajustar stock"}                       (Req 8.5, 8.6)
 *   - vencimiento_deuda: {"Extender deuda"}                      (Req 8.7)
 *   - Cualquier otro tipo: conjunto vacío.
 *
 * La función es pura y determinista: el tipo es el único input y siempre
 * produce la misma salida.
 *
 * Validates: Requirements 8.2, 8.5, 8.6, 8.7
 */

// ── Datos canónicos ───────────────────────────────────────────────────────

/** Mapa canónico tipo → conjunto esperado de acciones (fuente de verdad del spec). */
const ACCIONES_ESPERADAS: Record<string, AccionRapida[]> = {
  stock_cero: ["Ajustar stock", "Eliminar producto"],
  stock_critico: ["Ajustar stock"],
  vencimiento_deuda: ["Extender deuda"],
}

/** Todos los tipos canónicos. */
const TIPOS_CANONICOS = Object.keys(ACCIONES_ESPERADAS) as Array<keyof typeof ACCIONES_ESPERADAS>

/** Todas las acciones definidas por el sistema. */
const TODAS_LAS_ACCIONES: AccionRapida[] = ["Ajustar stock", "Eliminar producto", "Extender deuda"]

// ── Generadores ───────────────────────────────────────────────────────────

/** Genera uno de los tres tipos canónicos al azar. */
const arbTipoCanónico = fc.constantFrom(...TIPOS_CANONICOS)

/**
 * Genera cadenas arbitrarias que NO son tipos canónicos.
 * Representa cualquier tipo desconocido o futuro que no esté en el mapa.
 */
const arbTipoDesconocido = fc
  .string({ minLength: 0, maxLength: 40 })
  .filter((s) => !TIPOS_CANONICOS.includes(s as never))

// ── Tests de Property 19 ─────────────────────────────────────────────────

describe("Property 19: Acciones rápidas por tipo de notificación", () => {
  it(
    "P19.1 — Para cada tipo canónico, el conjunto de acciones es exactamente el esperado",
    () => {
      fc.assert(
        fc.property(arbTipoCanónico, (tipo) => {
          const acciones = accionesPorTipo(tipo)
          const esperadas = ACCIONES_ESPERADAS[tipo]

          // Misma longitud y mismos elementos (en el mismo orden)
          return (
            acciones.length === esperadas.length &&
            acciones.every((a, i) => a === esperadas[i])
          )
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.2 — stock_cero expone exactamente ['Ajustar stock', 'Eliminar producto'] (Req 8.2)",
    () => {
      fc.assert(
        fc.property(fc.constant("stock_cero"), (tipo) => {
          const acciones = accionesPorTipo(tipo)
          return (
            acciones.length === 2 &&
            acciones.includes("Ajustar stock") &&
            acciones.includes("Eliminar producto")
          )
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.3 — stock_critico expone exactamente ['Ajustar stock'] y excluye 'Eliminar producto' (Req 8.5, 8.6)",
    () => {
      fc.assert(
        fc.property(fc.constant("stock_critico"), (tipo) => {
          const acciones = accionesPorTipo(tipo)
          return (
            acciones.length === 1 &&
            acciones.includes("Ajustar stock") &&
            !acciones.includes("Eliminar producto")
          )
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.4 — vencimiento_deuda expone exactamente ['Extender deuda'] (Req 8.7)",
    () => {
      fc.assert(
        fc.property(fc.constant("vencimiento_deuda"), (tipo) => {
          const acciones = accionesPorTipo(tipo)
          return (
            acciones.length === 1 &&
            acciones.includes("Extender deuda")
          )
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.5 — Cualquier tipo no canónico expone conjunto vacío (sin acciones)",
    () => {
      fc.assert(
        fc.property(arbTipoDesconocido, (tipo) => {
          const acciones = accionesPorTipo(tipo)
          return acciones.length === 0
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.6 — La función es determinista: el mismo tipo siempre produce el mismo conjunto",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(arbTipoCanónico, arbTipoDesconocido),
          (tipo) => {
            const primera = accionesPorTipo(tipo)
            const segunda = accionesPorTipo(tipo)
            return (
              primera.length === segunda.length &&
              primera.every((a, i) => a === segunda[i])
            )
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.7 — Todas las acciones expuestas son valores válidos del tipo AccionRapida",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(arbTipoCanónico, arbTipoDesconocido),
          (tipo) => {
            const acciones = accionesPorTipo(tipo)
            return acciones.every((a) => TODAS_LAS_ACCIONES.includes(a))
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P19.8 — El conjunto de acciones no contiene duplicados para ningún tipo",
    () => {
      fc.assert(
        fc.property(
          fc.oneof(arbTipoCanónico, arbTipoDesconocido),
          (tipo) => {
            const acciones = accionesPorTipo(tipo)
            const unicos = new Set(acciones)
            return unicos.size === acciones.length
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
