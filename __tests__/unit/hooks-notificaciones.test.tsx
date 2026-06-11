/**
 * __tests__/unit/hooks-notificaciones.test.tsx
 *
 * Tests unitarios de los hooks del Centro_Notificaciones:
 *   - useNotificaciones: marcado optimista con rollback y conteo derivado (R9.7, R9.8, R9.9, R9.10).
 *   - useSonidoNotificacion: default activado, persistencia, volumen ≤0.5, tolera autoplay (R10.2, R10.5, R10.6, R10.8).
 *   - usePollingNotificaciones: polling 30s, timeout 10s, onAumento una vez por aumento,
 *     conserva conteo en fallo (R10.1, R11.1, R11.4, R11.5).
 *
 * Validates: Requirements R9.8, R10.1, R10.2, R10.5, R10.6, R10.8, R11.1, R11.4, R11.5
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { renderHook, act, waitFor } from "@testing-library/react"

import type { NotificacionDTO } from "@/lib/api/serializadores"

// ── Mock de sonner (toast) ──────────────────────────────────────────────────
const toastError = vi.fn()
vi.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => toastError(...args),
  },
}))

// ── Helpers de fixtures ──────────────────────────────────────────────────────

function notif(over: Partial<NotificacionDTO> = {}): NotificacionDTO {
  return {
    id: over.id ?? "n1",
    tipo: over.tipo ?? "stock_critico",
    titulo: over.titulo ?? "Stock crítico",
    mensaje: over.mensaje ?? "El producto está en nivel crítico.",
    producto_id: over.producto_id ?? "p1",
    leida: over.leida ?? false,
    creado_en: over.creado_en ?? "2025-04-20T10:00:00.000Z",
  }
}

/** Respuesta `fetch` simulada. */
function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
  } as unknown as Response
}

beforeEach(() => {
  toastError.mockClear()
  vi.restoreAllMocks()
  // localStorage limpio en jsdom.
  window.localStorage.clear()
})

afterEach(() => {
  vi.useRealTimers()
})

// ════════════════════════════════════════════════════════════════════════════
// useNotificaciones
// ════════════════════════════════════════════════════════════════════════════

describe("useNotificaciones — carga y conteo derivado", () => {
  it("recargar() pasa a 'listo' y deriva el conteo de no leídas", async () => {
    const lista = [
      notif({ id: "a", leida: false }),
      notif({ id: "b", leida: true }),
      notif({ id: "c", leida: false }),
    ]
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(lista)))

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })

    expect(result.current.estado).toBe("listo")
    expect(result.current.items).toHaveLength(3)
    expect(result.current.conteo).toBe(2)
  })

  it("recargar() pasa a 'error' cuando el fetch falla", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("red caída")))

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })

    expect(result.current.estado).toBe("error")
  })
})

describe("useNotificaciones — marcarLeida optimista con rollback (R9.7, R9.8)", () => {
  it("marca leída de forma optimista y decrementa el conteo al tener éxito", async () => {
    const lista = [notif({ id: "a", leida: false }), notif({ id: "b", leida: false })]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(lista)) // recargar
      .mockResolvedValueOnce(jsonResponse({}, true)) // PATCH
    vi.stubGlobal("fetch", fetchMock)

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })
    expect(result.current.conteo).toBe(2)

    await act(async () => {
      await result.current.marcarLeida("a")
    })

    expect(result.current.items.find((n) => n.id === "a")?.leida).toBe(true)
    expect(result.current.conteo).toBe(1)
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/notificaciones/a",
      expect.objectContaining({ method: "PATCH" })
    )
  })

  it("revierte por completo el cambio cuando el PATCH falla (rollback) y muestra toast", async () => {
    const lista = [notif({ id: "a", leida: false }), notif({ id: "b", leida: false })]
    // El PATCH se controla manualmente para garantizar que la actualización
    // optimista se haya confirmado en React antes de que la petición falle.
    let rechazarPatch: () => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(lista)) // recargar
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            rechazarPatch = () => resolve(jsonResponse({}, false, 500))
          })
      )
    vi.stubGlobal("fetch", fetchMock)

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })

    // Dispara el marcado: aplica la actualización optimista y deja el PATCH pendiente.
    let pendiente: Promise<void> = Promise.resolve()
    await act(async () => {
      pendiente = result.current.marcarLeida("a")
    })

    // Optimista: ya aparece como leída y el conteo bajó.
    expect(result.current.items.find((n) => n.id === "a")?.leida).toBe(true)
    expect(result.current.conteo).toBe(1)

    // Falla el PATCH ⇒ rollback completo.
    await act(async () => {
      rechazarPatch()
      await pendiente
    })

    expect(result.current.items.find((n) => n.id === "a")?.leida).toBe(false)
    expect(result.current.conteo).toBe(2)
    expect(toastError).toHaveBeenCalledTimes(1)
  })

  it("marcar una ya leída no altera su estado ni muestra error (idempotente)", async () => {
    const lista = [notif({ id: "a", leida: true })]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(lista))
      .mockResolvedValue(jsonResponse({}, true))
    vi.stubGlobal("fetch", fetchMock)

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })

    await act(async () => {
      await result.current.marcarLeida("a")
    })

    // Permanece leída, el conteo sigue en 0 y no hay error de rollback.
    expect(result.current.items.find((n) => n.id === "a")?.leida).toBe(true)
    expect(result.current.conteo).toBe(0)
    expect(toastError).not.toHaveBeenCalled()
  })
})

describe("useNotificaciones — marcarTodasLeidas optimista con rollback (R9.9, R9.10)", () => {
  it("pone el conteo a cero al tener éxito", async () => {
    const lista = [notif({ id: "a", leida: false }), notif({ id: "b", leida: false })]
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(lista))
      .mockResolvedValueOnce(jsonResponse({ actualizadas: 2 }, true))
    vi.stubGlobal("fetch", fetchMock)

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })
    await act(async () => {
      await result.current.marcarTodasLeidas()
    })

    expect(result.current.conteo).toBe(0)
  })

  it("revierte el conteo cuando el POST falla", async () => {
    const lista = [notif({ id: "a", leida: false }), notif({ id: "b", leida: false })]
    let rechazarPost: () => void = () => {}
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(lista))
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            rechazarPost = () => resolve(jsonResponse({}, false, 500))
          })
      )
    vi.stubGlobal("fetch", fetchMock)

    const { useNotificaciones } = await import("@/hooks/use-notificaciones")
    const { result } = renderHook(() => useNotificaciones())

    await act(async () => {
      await result.current.recargar()
    })

    let pendiente: Promise<void> = Promise.resolve()
    await act(async () => {
      pendiente = result.current.marcarTodasLeidas()
    })

    // Optimista: conteo a cero antes de la respuesta.
    expect(result.current.conteo).toBe(0)

    await act(async () => {
      rechazarPost()
      await pendiente
    })

    await waitFor(() => expect(result.current.conteo).toBe(2))
    expect(toastError).toHaveBeenCalledTimes(1)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// useSonidoNotificacion
// ════════════════════════════════════════════════════════════════════════════

/** Instancias creadas por el mock de Audio, para inspección. */
let audiosCreados: MockAudio[] = []

class MockAudio {
  src: string
  volume = 1
  currentTime = 0
  playResultado: Promise<void> = Promise.resolve()
  playLlamadas = 0

  constructor(src: string) {
    this.src = src
    audiosCreados.push(this)
  }

  play(): Promise<void> {
    this.playLlamadas += 1
    return this.playResultado
  }
}

describe("useSonidoNotificacion — preferencia y reproducción (R10.2, R10.5, R10.6, R10.8)", () => {
  beforeEach(() => {
    audiosCreados = []
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio)
  })

  it("por defecto el sonido está activado (no silenciado) (R10.6)", async () => {
    const { useSonidoNotificacion } = await import("@/hooks/use-sonido-notificacion")
    const { result } = renderHook(() => useSonidoNotificacion())
    expect(result.current.silenciado).toBe(false)
  })

  it("alternarSilencio persiste la preferencia en localStorage (R10.5)", async () => {
    const { useSonidoNotificacion } = await import("@/hooks/use-sonido-notificacion")
    const { result } = renderHook(() => useSonidoNotificacion())

    act(() => {
      result.current.alternarSilencio()
    })

    expect(result.current.silenciado).toBe(true)
    expect(window.localStorage.getItem("dego:sonido_notificacion")).toBe("true")
  })

  it("rehidrata como silenciado cuando la preferencia previa es 'true'", async () => {
    window.localStorage.setItem("dego:sonido_notificacion", "true")
    const { useSonidoNotificacion } = await import("@/hooks/use-sonido-notificacion")
    const { result } = renderHook(() => useSonidoNotificacion())

    await waitFor(() => expect(result.current.silenciado).toBe(true))
  })

  it("reproducir() crea un Audio con volumen 0.5 y llama play (R10.2)", async () => {
    const { useSonidoNotificacion } = await import("@/hooks/use-sonido-notificacion")
    const { result } = renderHook(() => useSonidoNotificacion())

    act(() => {
      result.current.reproducir()
    })

    expect(audiosCreados).toHaveLength(1)
    expect(audiosCreados[0].volume).toBeLessThanOrEqual(0.5)
    expect(audiosCreados[0].playLlamadas).toBe(1)
  })

  it("reproducir() no suena cuando está silenciado", async () => {
    window.localStorage.setItem("dego:sonido_notificacion", "true")
    const { useSonidoNotificacion } = await import("@/hooks/use-sonido-notificacion")
    const { result } = renderHook(() => useSonidoNotificacion())

    await waitFor(() => expect(result.current.silenciado).toBe(true))

    act(() => {
      result.current.reproducir()
    })

    expect(audiosCreados).toHaveLength(0)
  })

  it("tolera el rechazo de autoplay sin lanzar (R10.8)", async () => {
    const { useSonidoNotificacion } = await import("@/hooks/use-sonido-notificacion")
    const { result } = renderHook(() => useSonidoNotificacion())

    // Provoca que la próxima reproducción rechace su promesa de play().
    act(() => {
      result.current.reproducir()
    })
    audiosCreados[0].playResultado = Promise.reject(new Error("autoplay bloqueado"))

    expect(() =>
      act(() => {
        result.current.reproducir()
      })
    ).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// usePollingNotificaciones
// ════════════════════════════════════════════════════════════════════════════

describe("usePollingNotificaciones — polling, timeout y aumento (R10.1, R11.1, R11.4, R11.5)", () => {
  beforeEach(() => {
    audiosCreados = []
    vi.stubGlobal("Audio", MockAudio as unknown as typeof Audio)
    vi.useFakeTimers()
  })

  it("consulta el conteo al montar y de nuevo tras 30 s (R11.1)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ conteo: 0 }))
    vi.stubGlobal("fetch", fetchMock)

    const { usePollingNotificaciones } = await import(
      "@/hooks/use-polling-notificaciones"
    )
    renderHook(() => usePollingNotificaciones())

    // Primera consulta inmediata.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // Segundo ciclo a los 30 s.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000)
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/notificaciones/conteo",
      expect.objectContaining({ method: "GET" })
    )
  })

  it("dispara onAumento exactamente una vez por ciclo con aumento y reproduce sonido (R11.3)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ conteo: 1 })) // ciclo 1: 0 -> 1 (aumento)
      .mockResolvedValueOnce(jsonResponse({ conteo: 1 })) // ciclo 2: sin aumento
      .mockResolvedValue(jsonResponse({ conteo: 3 })) // ciclo 3+: 1 -> 3 (aumento)
    vi.stubGlobal("fetch", fetchMock)

    const { usePollingNotificaciones } = await import(
      "@/hooks/use-polling-notificaciones"
    )
    const aumentos: number[] = []
    const { result } = renderHook(() => usePollingNotificaciones())

    act(() => {
      result.current.onAumento((n) => aumentos.push(n))
    })

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0) // ciclo 1
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000) // ciclo 2
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000) // ciclo 3
    })

    expect(aumentos).toEqual([1, 3])
    expect(result.current.conteo).toBe(3)
    // Un Audio reproducido por cada uno de los 2 aumentos.
    const totalPlays = audiosCreados.reduce((acc, a) => acc + a.playLlamadas, 0)
    expect(totalPlays).toBe(2)
  })

  it("conserva el conteo previo cuando una consulta falla (R11.5)", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ conteo: 5 })) // ciclo 1
      .mockRejectedValueOnce(new Error("red caída")) // ciclo 2 falla
      .mockResolvedValue(jsonResponse({ conteo: 5 }))
    vi.stubGlobal("fetch", fetchMock)

    const { usePollingNotificaciones } = await import(
      "@/hooks/use-polling-notificaciones"
    )
    const { result } = renderHook(() => usePollingNotificaciones())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(result.current.conteo).toBe(5)

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000) // falla: conserva 5
    })
    expect(result.current.conteo).toBe(5)
  })

  it("aborta la consulta tras el timeout de 10 s y conserva el conteo (R11.4)", async () => {
    // fetch que sólo se resuelve/rechaza al abortarse la señal.
    const fetchMock = vi.fn(
      (_url: string, opts: { signal?: AbortSignal }) =>
        new Promise<Response>((_resolve, reject) => {
          opts.signal?.addEventListener("abort", () =>
            reject(new DOMException("Aborted", "AbortError"))
          )
        })
    )
    vi.stubGlobal("fetch", fetchMock)

    const { usePollingNotificaciones } = await import(
      "@/hooks/use-polling-notificaciones"
    )
    const { result } = renderHook(() => usePollingNotificaciones())

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0)
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)

    // A los 10 s la petición se aborta; el conteo permanece en 0 sin lanzar.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10_000)
    })
    expect(result.current.conteo).toBe(0)
  })
})
