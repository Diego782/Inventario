/**
 * __tests__/unit/hooks-dashboard.test.tsx
 *
 * Tests unitarios de los hooks del Dashboard_Analitico:
 *   - useRangoFechas: preset inicial este_mes, setPreset recalcula el rango,
 *     setPersonalizado válido actualiza, inválido conserva el rango previo y expone error
 *     (R1.1, R1.2, R1.7, R1.8).
 *   - useDashboardData: cargando→listo en éxito, vacio cuando no hay datos, error en
 *     fallo y timeout de 10 s (R5.10–R5.13, R5.11).
 *
 * Validates: Requirements R5.11
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

import type { MetricasDTO, RankingsDTO } from "@/lib/api/serializadores"

// ── Fixtures de DTO ───────────────────────────────────────────────────────────

function metrica(actual: number) {
  return { actual, anterior: 0, variacionPorcentual: null }
}

function metricasDTO(over: { conDatos?: boolean } = {}): MetricasDTO {
  const v = over.conDatos ? 100 : 0
  return {
    rango: { desde: "2025-04-01", hasta: "2025-04-30" },
    periodoAnterior: { desde: "2025-03-02", hasta: "2025-03-31" },
    totalSales: metrica(v),
    totalReturns: metrica(0),
    totalExpenses: metrica(0),
    estimatedProfit: metrica(v),
    series: { ventas: [], gastos: [] },
  }
}

function rankingsDTO(over: { conDatos?: boolean } = {}): RankingsDTO {
  return {
    rango: { desde: "2025-04-01", hasta: "2025-04-30" },
    limite: 5,
    topSelling: over.conDatos
      ? [{ producto_id: "p1", nombre: "A", unidadesVendidas: 5, montoVendido: 100 }]
      : [],
    topMargin: [],
    topRotation: [],
    lowRotation: [],
  }
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return { ok, status, json: async () => body } as unknown as Response
}

/** fetch que enruta a métricas o rankings según la URL. */
function fetchEnrutado(m: MetricasDTO, r: RankingsDTO) {
  return vi.fn((url: string) =>
    Promise.resolve(
      url.includes("/metricas") ? jsonResponse(m) : jsonResponse(r)
    )
  )
}

beforeEach(() => {
  vi.restoreAllMocks()
})

afterEach(() => {
  vi.useRealTimers()
})

// ════════════════════════════════════════════════════════════════════════════
// useRangoFechas
// ════════════════════════════════════════════════════════════════════════════

describe("useRangoFechas — preset y rango personalizado (R1.1, R1.7, R1.8)", () => {
  it("inicia con preset 'este_mes' y un rango bien formado", async () => {
    const { useRangoFechas } = await import("@/hooks/use-rango-fechas")
    const { result } = renderHook(() => useRangoFechas())

    expect(result.current.preset).toBe("este_mes")
    expect(result.current.rango.desde <= result.current.rango.hasta).toBe(true)
    expect(result.current.error).toBeNull()
    expect(result.current.etiquetaLegible.length).toBeGreaterThan(0)
  })

  it("setPreset('hoy') deja desde === hasta", async () => {
    const { useRangoFechas } = await import("@/hooks/use-rango-fechas")
    const { result } = renderHook(() => useRangoFechas())

    act(() => {
      result.current.setPreset("hoy")
    })

    expect(result.current.preset).toBe("hoy")
    expect(result.current.rango.desde).toBe(result.current.rango.hasta)
  })

  it("setPersonalizado válido actualiza el rango y limpia el error", async () => {
    const { useRangoFechas } = await import("@/hooks/use-rango-fechas")
    const { result } = renderHook(() => useRangoFechas())

    let salida: { ok: boolean } = { ok: false }
    act(() => {
      salida = result.current.setPersonalizado("2020-01-01", "2020-01-10")
    })

    expect(salida.ok).toBe(true)
    expect(result.current.preset).toBe("personalizado")
    expect(result.current.rango).toEqual({ desde: "2020-01-01", hasta: "2020-01-10" })
    expect(result.current.error).toBeNull()
  })

  it("setPersonalizado inválido (inicio > fin) conserva el rango previo y expone error", async () => {
    const { useRangoFechas } = await import("@/hooks/use-rango-fechas")
    const { result } = renderHook(() => useRangoFechas())

    const rangoPrevio = result.current.rango

    let salida: { ok: boolean; mensaje?: string } = { ok: true }
    act(() => {
      salida = result.current.setPersonalizado("2020-02-10", "2020-02-01")
    })

    expect(salida.ok).toBe(false)
    expect(salida.mensaje && salida.mensaje.length).toBeGreaterThan(0)
    // El rango no cambia ante una validación fallida (R1.7, R1.8).
    expect(result.current.rango).toEqual(rangoPrevio)
    expect(result.current.error).not.toBeNull()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// useDashboardData
// ════════════════════════════════════════════════════════════════════════════

const RANGO = { desde: "2025-04-01", hasta: "2025-04-30" }

describe("useDashboardData — estados de carga (R5.10–R5.13)", () => {
  it("pasa de 'cargando' a 'listo' cuando ambas respuestas traen datos", async () => {
    vi.stubGlobal(
      "fetch",
      fetchEnrutado(metricasDTO({ conDatos: true }), rankingsDTO({ conDatos: true }))
    )

    const { useDashboardData } = await import("@/hooks/use-dashboard-data")
    const { result } = renderHook(() => useDashboardData(RANGO))

    await waitFor(() => expect(result.current.estado).toBe("listo"))
    expect(result.current.metricas).not.toBeNull()
    expect(result.current.rankings).not.toBeNull()
  })

  it("queda en 'vacio' cuando ambas respuestas no traen datos (R5.13)", async () => {
    vi.stubGlobal("fetch", fetchEnrutado(metricasDTO(), rankingsDTO()))

    const { useDashboardData } = await import("@/hooks/use-dashboard-data")
    const { result } = renderHook(() => useDashboardData(RANGO))

    await waitFor(() => expect(result.current.estado).toBe("vacio"))
  })

  it("pasa a 'error' cuando una petición falla (R5.12)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("fallo")))

    const { useDashboardData } = await import("@/hooks/use-dashboard-data")
    const { result } = renderHook(() => useDashboardData(RANGO))

    await waitFor(() => expect(result.current.estado).toBe("error"))
  })

  it("pasa a 'error' por timeout de 10 s vía AbortController (R5.11)", async () => {
    vi.useFakeTimers()

    // fetch que sólo rechaza al abortarse su señal (simula petición colgada).
    const fetchMock = vi.fn(
      (_url: string, opts: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { useDashboardData } = await import("@/hooks/use-dashboard-data")
    const { result } = renderHook(() => useDashboardData(RANGO))

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.estado).toBe("cargando")

    // A los 10 s vence el timeout, se aborta y el estado pasa a error.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(result.current.estado).toBe("error")
  })

  it("reintentar() re-lanza la carga", async () => {
    const fetchMock = fetchEnrutado(
      metricasDTO({ conDatos: true }),
      rankingsDTO({ conDatos: true })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { useDashboardData } = await import("@/hooks/use-dashboard-data")
    const { result } = renderHook(() => useDashboardData(RANGO))

    await waitFor(() => expect(result.current.estado).toBe("listo"))
    const llamadasIniciales = fetchMock.mock.calls.length

    act(() => {
      result.current.reintentar()
    })

    await waitFor(() =>
      expect(fetchMock.mock.calls.length).toBeGreaterThan(llamadasIniciales)
    )
  })
})
