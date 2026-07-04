// Feature: gestion-clientes-y-fiadores, Property 12: Historial de deuda ordenado con saldo corrido
/**
 * Property 12: Historial de deuda ordenado con saldo corrido
 * **Validates: Requirements 5.2**
 *
 * Para todo cliente con movimientos de deuda:
 * 1. El historial se devuelve en orden cronológico ascendente por `fecha`,
 *    con desempate por `creado_en` (orden de registro).
 * 2. El `saldoResultante` anotado en cada movimiento es igual al acumulado
 *    de cargos menos abonos hasta ese movimiento inclusive, con redondeo
 *    bancario aplicado.
 */

import { describe, it, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { historialDeuda } from "@/lib/dominio/deuda"
import { redondearBancario } from "@/lib/money"

// ── In-memory types ──────────────────────────────────────────────────────────

interface InMemoryMovimiento {
  id: string
  cliente_id: string
  organizacion_id: string
  tipo: "cargo" | "abono"
  /**
   * `monto` se almacena como número plano en los tests.
   * La implementación de historialDeuda llama a `Number(m.monto)`, que
   * funciona tanto con Decimal de Prisma como con un número primitivo.
   */
  monto: number
  venta_id: string | null
  plazo_deuda: Date | null
  fecha: Date
  creado_en: Date
}

// ── In-memory DB state ───────────────────────────────────────────────────────

let movimientosDB: InMemoryMovimiento[]

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/lib/db", () => ({
  prisma: {
    movimientoDeuda: {
      findMany: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"

// ── Setup beforeEach ─────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  movimientosDB = []

  /**
   * prisma.movimientoDeuda.findMany — filtra por cliente_id y organizacion_id,
   * ordena ascendente por fecha con desempate por creado_en, tal como lo hace
   * la implementación real de historialDeuda.
   */
  vi.mocked(prisma.movimientoDeuda.findMany).mockImplementation(async ({ where, orderBy }: any) => {
    const clienteId: string = where?.cliente_id
    const orgId: string = where?.organizacion_id

    const filtrados = movimientosDB.filter(
      (m) => m.cliente_id === clienteId && m.organizacion_id === orgId
    )

    // Replicar la ordenación de la implementación: fecha ASC, creado_en ASC
    const sorted = [...filtrados].sort((a, b) => {
      const fechaDiff = a.fecha.getTime() - b.fecha.getTime()
      if (fechaDiff !== 0) return fechaDiff
      return a.creado_en.getTime() - b.creado_en.getTime()
    })

    return sorted as any[]
  })
})

// ── Generadores fast-check ───────────────────────────────────────────────────

/** UUID simplificado para IDs. */
const arbId = fc.uuid()

/** Tipo de movimiento: cargo o abono. */
const arbTipo = fc.constantFrom("cargo" as const, "abono" as const)

/**
 * Genera un conjunto de movimientos de deuda con fechas variadas.
 * Los montos son siempre positivos (>=0.01).
 *
 * Para garantizar que la secuencia es válida (nunca saldo negativo),
 * construimos los movimientos en orden de inserción usando una estrategia
 * acumulativa: cada cargo puede tener cualquier monto positivo; cada abono
 * tiene como máximo el saldo acumulado hasta ese punto.
 * Si el saldo acumulado es 0 y el siguiente sería abono, lo convertimos en cargo.
 */
const arbMovimientosMonto = fc
  .array(
    fc.record({
      tipo: arbTipo,
      // montos con hasta 2 decimales, entre 0.01 y 999.99
      monto: fc.integer({ min: 1, max: 99999 }).map((n) => n / 100),
    }),
    { minLength: 1, maxLength: 15 }
  )
  .map((movs) => {
    // Ajustar los abonos para que nunca excedan el saldo acumulado
    let acumulado = 0
    return movs.map((m) => {
      if (m.tipo === "cargo") {
        acumulado += m.monto
        return m
      } else {
        // abono: no puede exceder el saldo acumulado
        if (acumulado <= 0) {
          // Si no hay saldo, convertir a cargo
          acumulado += m.monto
          return { tipo: "cargo" as const, monto: m.monto }
        }
        const montoAbono = Math.min(m.monto, acumulado)
        const montoRedondeado = Math.round(montoAbono * 100) / 100
        if (montoRedondeado < 0.01) {
          // Muy pequeño, convertir en cargo
          acumulado += m.monto
          return { tipo: "cargo" as const, monto: m.monto }
        }
        acumulado -= montoRedondeado
        return { tipo: "abono" as const, monto: montoRedondeado }
      }
    })
  })

/**
 * Genera una fecha base y offsets de milisegundos para los movimientos,
 * con posibles empates (misma fecha, diferente creado_en).
 */
const arbFechas = (count: number) =>
  fc
    .array(
      fc.integer({ min: 0, max: 10_000_000 }), // ms offset desde una base
      { minLength: count, maxLength: count }
    )
    .chain((offsets) =>
      // creado_en siempre va creciendo (orden de inserción)
      fc
        .array(fc.integer({ min: 1, max: 1000 }), {
          minLength: count,
          maxLength: count,
        })
        .map((increments) => {
          const BASE = new Date("2024-01-01T00:00:00.000Z").getTime()
          let creadoEnAcum = BASE
          return offsets.map((offset, i) => {
            creadoEnAcum += increments[i]
            return {
              fecha: new Date(BASE + offset),
              creado_en: new Date(creadoEnAcum),
            }
          })
        })
    )

// ── Tests PBT ─────────────────────────────────────────────────────────────────

describe("Property 12: Historial de deuda ordenado con saldo corrido", () => {
  it(
    "P12.1 — El historial se devuelve en orden cronológico ascendente (fecha ASC, creado_en ASC) (Req 5.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.uuid(), // clienteId
          arbMovimientosMonto,
          async (orgId, clienteId, montos) => {
            movimientosDB = []

            // Obtener fechas para los movimientos
            const count = montos.length
            const BASE = new Date("2024-01-01T00:00:00.000Z").getTime()

            montos.forEach((m, i) => {
              // fechas variadas con posibles empates
              const fechaOffset = (i % 5) * 3_600_000 // algunos empates cada 5
              const creadoEnOffset = i * 1000 // siempre creciente → orden de inserción

              movimientosDB.push({
                id: `mov-${i}`,
                cliente_id: clienteId,
                organizacion_id: orgId,
                tipo: m.tipo,
                monto: m.monto,
                venta_id: null,
                plazo_deuda: null,
                fecha: new Date(BASE + fechaOffset),
                creado_en: new Date(BASE + creadoEnOffset),
              })
            })

            const historial = await historialDeuda(clienteId, orgId)

            // Verificar orden cronológico ascendente
            for (let i = 1; i < historial.length; i++) {
              const prev = historial[i - 1].movimiento
              const curr = historial[i].movimiento
              const prevFecha = prev.fecha.getTime()
              const currFecha = curr.fecha.getTime()
              const prevCreadoEn = prev.creado_en.getTime()
              const currCreadoEn = curr.creado_en.getTime()

              // fecha corriente debe ser >= fecha anterior
              if (currFecha < prevFecha) {
                throw new Error(
                  `Orden incorrecto en posición ${i}: fecha[${i}]=${currFecha} < fecha[${i - 1}]=${prevFecha}`
                )
              }

              // si misma fecha, creado_en corriente debe ser >= creado_en anterior
              if (currFecha === prevFecha && currCreadoEn < prevCreadoEn) {
                throw new Error(
                  `Desempate incorrecto en posición ${i}: creado_en[${i}]=${currCreadoEn} < creado_en[${i - 1}]=${prevCreadoEn}`
                )
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P12.2 — El saldo corrido de cada movimiento es redondearBancario(Σ cargos − Σ abonos hasta ese movimiento inclusive) (Req 5.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.uuid(), // clienteId
          arbMovimientosMonto,
          async (orgId, clienteId, montos) => {
            movimientosDB = []

            const BASE = new Date("2024-01-01T00:00:00.000Z").getTime()

            // Insertar movimientos con creado_en creciente para que el orden sea determinístico
            montos.forEach((m, i) => {
              movimientosDB.push({
                id: `mov-${i}`,
                cliente_id: clienteId,
                organizacion_id: orgId,
                tipo: m.tipo,
                monto: m.monto,
                venta_id: null,
                plazo_deuda: null,
                fecha: new Date(BASE + i * 60_000), // 1 min de diferencia cada uno
                creado_en: new Date(BASE + i * 1_000),
              })
            })

            const historial = await historialDeuda(clienteId, orgId)

            // Calcular saldo corrido esperado paso a paso
            let acumulado = 0
            for (let i = 0; i < historial.length; i++) {
              const { movimiento, saldoResultante } = historial[i]
              const monto = Number(movimiento.monto)

              if (movimiento.tipo === "cargo") {
                acumulado += monto
              } else {
                acumulado -= monto
              }

              const saldoEsperado = redondearBancario(acumulado)

              if (saldoResultante !== saldoEsperado) {
                throw new Error(
                  `Saldo corrido incorrecto en movimiento ${i}: ` +
                    `esperado=${saldoEsperado}, obtenido=${saldoResultante} ` +
                    `(tipo=${movimiento.tipo}, monto=${monto}, acumulado=${acumulado})`
                )
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P12.3 — Historial vacío para cliente sin movimientos (Req 5.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(fc.uuid(), fc.uuid(), async (orgId, clienteId) => {
          movimientosDB = []
          // Sin movimientos → historial vacío
          const historial = await historialDeuda(clienteId, orgId)
          if (historial.length !== 0) {
            throw new Error(`Esperaba historial vacío, obtuve ${historial.length} movimientos`)
          }
        }),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P12.4 — Con fechas que empatan, el desempate por creado_en mantiene el orden de registro (Req 5.2)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgId
          fc.uuid(), // clienteId
          // Genera entre 2 y 8 montos de cargo (todos cargo para simplificar el empate)
          fc.array(fc.integer({ min: 1, max: 10000 }).map((n) => n / 100), {
            minLength: 2,
            maxLength: 8,
          }),
          async (orgId, clienteId, montos) => {
            movimientosDB = []

            // Misma fecha para todos (forzar empate por fecha)
            const FECHA_UNICA = new Date("2024-06-15T12:00:00.000Z")
            const BASE_CREADO_EN = new Date("2024-06-15T12:00:00.000Z").getTime()

            montos.forEach((monto, i) => {
              movimientosDB.push({
                id: `mov-empate-${i}`,
                cliente_id: clienteId,
                organizacion_id: orgId,
                tipo: "cargo",
                monto: monto,
                venta_id: null,
                plazo_deuda: null,
                fecha: FECHA_UNICA,
                creado_en: new Date(BASE_CREADO_EN + i * 500), // 500ms entre cada uno
              })
            })

            const historial = await historialDeuda(clienteId, orgId)

            // Con misma fecha, el orden debe seguir creado_en ASC
            for (let i = 1; i < historial.length; i++) {
              const prevCreadoEn = historial[i - 1].movimiento.creado_en.getTime()
              const currCreadoEn = historial[i].movimiento.creado_en.getTime()

              if (currCreadoEn < prevCreadoEn) {
                throw new Error(
                  `Desempate por creado_en incorrecto en pos ${i}: ` +
                    `creado_en[${i}]=${currCreadoEn} < creado_en[${i - 1}]=${prevCreadoEn}`
                )
              }
            }

            // Verificar también el saldo corrido de cargos acumulados
            let acumulado = 0
            for (const { movimiento, saldoResultante } of historial) {
              acumulado += Number(movimiento.monto)
              const esperado = redondearBancario(acumulado)
              if (saldoResultante !== esperado) {
                throw new Error(
                  `Saldo corrido incorrecto: esperado=${esperado}, obtenido=${saldoResultante}`
                )
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )

  it(
    "P12.5 — El historial solo incluye movimientos del cliente y organización solicitados (Req 5.2, 5.12)",
    async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.uuid(), // orgA
          fc.uuid(), // orgB (diferente)
          fc.uuid(), // clienteA
          fc.uuid(), // clienteB (diferente)
          fc.integer({ min: 1, max: 5 }),  // movimientos para clienteA/orgA
          fc.integer({ min: 1, max: 3 }),  // movimientos de ruido (otro cliente u org)
          async (orgA, orgB, clienteA, clienteB, countA, countNoise) => {
            // Garantizar que los IDs sean distintos
            fc.pre(orgA !== orgB && clienteA !== clienteB)

            movimientosDB = []

            const BASE = new Date("2024-01-01T00:00:00.000Z").getTime()
            let idx = 0

            // Movimientos de clienteA/orgA
            for (let i = 0; i < countA; i++, idx++) {
              movimientosDB.push({
                id: `mov-A-${i}`,
                cliente_id: clienteA,
                organizacion_id: orgA,
                tipo: "cargo",
                monto: (i + 1) * 10,
                venta_id: null,
                plazo_deuda: null,
                fecha: new Date(BASE + idx * 60_000),
                creado_en: new Date(BASE + idx * 1_000),
              })
            }

            // Movimientos de ruido: clienteB/orgA y clienteA/orgB
            for (let i = 0; i < countNoise; i++, idx++) {
              movimientosDB.push({
                id: `mov-noise-B-${i}`,
                cliente_id: clienteB,
                organizacion_id: orgA,
                tipo: "cargo",
                monto: 999,
                venta_id: null,
                plazo_deuda: null,
                fecha: new Date(BASE + idx * 60_000),
                creado_en: new Date(BASE + idx * 1_000),
              })
              movimientosDB.push({
                id: `mov-noise-orgB-${i}`,
                cliente_id: clienteA,
                organizacion_id: orgB,
                tipo: "cargo",
                monto: 888,
                venta_id: null,
                plazo_deuda: null,
                fecha: new Date(BASE + idx * 60_000),
                creado_en: new Date(BASE + idx * 1_000),
              })
              idx++
            }

            const historial = await historialDeuda(clienteA, orgA)

            // Solo debe haber countA movimientos
            if (historial.length !== countA) {
              throw new Error(
                `Historial filtrado incorrectamente: esperaba ${countA} movimientos, obtuvo ${historial.length}`
              )
            }

            // Todos los movimientos deben pertenecer a clienteA/orgA
            for (const { movimiento } of historial) {
              if (
                (movimiento as any).cliente_id !== clienteA ||
                (movimiento as any).organizacion_id !== orgA
              ) {
                throw new Error(
                  `Movimiento de historial no pertenece al cliente/org solicitado`
                )
              }
            }
          }
        ),
        { numRuns: 100 }
      )
    }
  )
})
