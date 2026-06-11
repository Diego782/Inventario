/**
 * __tests__/unit/params-invitacion.test.ts
 *
 * Tests unitarios para lib/auth/params-invitacion.ts
 * Valida la lectura y limpieza de parámetros ?token= y ?accion= de la URL.
 *
 * Validates: Requirements 2.3
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import {
  leerParamsInvitacion,
  limpiarParamsInvitacion,
} from "@/lib/auth/params-invitacion"

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      ...window.location,
      search,
      pathname: "/",
    },
  })
}

// ─── leerParamsInvitacion ─────────────────────────────────────────────────────

describe("leerParamsInvitacion", () => {
  it("devuelve token y accion desde la query string", () => {
    setSearch("?token=abc123&accion=invitacion")
    const result = leerParamsInvitacion()
    expect(result).toEqual({ token: "abc123", accion: "invitacion" })
  })

  it("devuelve null para ambos cuando no hay query string", () => {
    setSearch("")
    const result = leerParamsInvitacion()
    expect(result).toEqual({ token: null, accion: null })
  })

  it("devuelve null para token cuando solo hay accion", () => {
    setSearch("?accion=invitacion")
    const result = leerParamsInvitacion()
    expect(result).toEqual({ token: null, accion: "invitacion" })
  })

  it("devuelve null para accion cuando solo hay token", () => {
    setSearch("?token=xyz789")
    const result = leerParamsInvitacion()
    expect(result).toEqual({ token: "xyz789", accion: null })
  })

  it("funciona con accion=verificar", () => {
    setSearch("?token=tok-ver&accion=verificar")
    const result = leerParamsInvitacion()
    expect(result).toEqual({ token: "tok-ver", accion: "verificar" })
  })

  it("devuelve { token: null, accion: null } en entorno SSR (sin window)", () => {
    // Simular entorno SSR temporalmente
    const originalWindow = global.window
    // @ts-expect-error — simular ausencia de window
    delete global.window
    const result = leerParamsInvitacion()
    expect(result).toEqual({ token: null, accion: null })
    global.window = originalWindow
  })
})

// ─── limpiarParamsInvitacion ──────────────────────────────────────────────────

describe("limpiarParamsInvitacion", () => {
  let replaceStateSpy: ReturnType<typeof vi.fn>

  beforeEach(() => {
    replaceStateSpy = vi.fn()
    Object.defineProperty(window, "history", {
      writable: true,
      value: { ...window.history, replaceState: replaceStateSpy },
    })
    setSearch("?token=abc&accion=invitacion")
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("invoca window.history.replaceState con pathname sin query string", () => {
    limpiarParamsInvitacion()
    expect(replaceStateSpy).toHaveBeenCalledOnce()
    expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/")
  })

  it("no lanza error en entorno SSR (sin window)", () => {
    const originalWindow = global.window
    // @ts-expect-error — simular ausencia de window
    delete global.window
    // No debe lanzar excepción
    expect(() => limpiarParamsInvitacion()).not.toThrow()
    global.window = originalWindow
  })
})
