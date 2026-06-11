/**
 * __tests__/unit/invitacion-gate.test.tsx
 *
 * Pruebas unitarias del fix de redirección de invitación.
 *
 * Cubre:
 * - InvitacionGate: con sesión autenticada y ?token=&accion=invitacion → monta AceptarInvitacionScreen
 * - InvitacionGate: sin params → renderiza children
 * - InvitacionGate: con ?accion=verificar → NO intercepta (renderiza children)
 * - InvitacionGate: tras onAceptado → invoca recargar() del contexto y limpia la URL
 * - AceptarInvitacionScreen: muestra mensaje correcto para INVITACION_INVALIDA e INVITACION_OTRO_CORREO
 * - AuthScreens: ya no realiza aceptación automática silenciosa (no llama POST /api/invitaciones/aceptar en handleLoginExitoso)
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.2
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// ─── Helpers de URL ────────────────────────────────────────────────────────────

function setSearch(search: string) {
  Object.defineProperty(window, "location", {
    writable: true,
    value: { ...window.location, search, pathname: "/" },
  })
}

// ─── Mocks globales ────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-sesion", () => ({
  useSesion: vi.fn(),
}))

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: vi.fn(),
}))

// Mocks de sub-componentes de AuthScreens al top-level (necesario para hoisting de vi.mock)
vi.mock("@/components/auth/login-screen", () => ({
  LoginScreen: ({
    onLoginExitoso,
  }: {
    onLoginExitoso?: () => void
  }) => (
    <button
      data-testid="trigger-login-exitoso"
      onClick={() => onLoginExitoso?.()}
    >
      Simular login exitoso
    </button>
  ),
}))

vi.mock("@/components/auth/registro-screen", () => ({
  RegistroScreen: () => <div>RegistroScreen</div>,
}))

vi.mock("@/components/auth/verificacion-screen", () => ({
  VerificacionScreen: () => <div>VerificacionScreen</div>,
}))

// Mockeamos AceptarInvitacionScreen con un test-id sencillo para verificar su montaje.
// También exponemos los callbacks para poder invocarlos en pruebas.
let capturedOnAceptado: (() => void) | undefined
let capturedOnCambiarPantalla: ((p: "registro" | "login") => void) | undefined
let capturedToken: string | undefined

vi.mock("@/components/auth/aceptar-invitacion-screen", () => ({
  AceptarInvitacionScreen: ({
    token,
    onAceptado,
    onCambiarPantalla,
  }: {
    token: string
    onAceptado?: () => void
    onCambiarPantalla?: (p: "registro" | "login") => void
  }) => {
    capturedToken = token
    capturedOnAceptado = onAceptado
    capturedOnCambiarPantalla = onCambiarPantalla
    return (
      <div data-testid="aceptar-invitacion-screen">
        AceptarInvitacionScreen token={token}
      </div>
    )
  },
}))

import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { InvitacionGate } from "@/components/auth/invitacion-gate"

const mockUseSesion = useSesion as ReturnType<typeof vi.fn>
const mockUseOrganizacionActiva = useOrganizacionActiva as ReturnType<typeof vi.fn>

// Usuario de prueba reutilizable
const USUARIO_TEST = { id: "u1", correo: "test@ejemplo.com", nombre: "Test" }

function mockSesionAutenticada() {
  mockUseSesion.mockReturnValue({
    usuario: USUARIO_TEST,
    cargando: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  })
}

function mockOrganizacionActiva(recargar?: ReturnType<typeof vi.fn>) {
  mockUseOrganizacionActiva.mockReturnValue({
    organizacion: null,
    organizaciones: [],
    cargando: false,
    error: null,
    seleccionar: vi.fn(),
    recargar: recargar ?? vi.fn(),
  })
}

// ─── InvitacionGate ────────────────────────────────────────────────────────────

describe("InvitacionGate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    capturedOnAceptado = undefined
    capturedOnCambiarPantalla = undefined
    capturedToken = undefined
  })

  afterEach(() => {
    // Limpiar la URL entre pruebas
    setSearch("")
  })

  describe("con sesión autenticada y ?token=&accion=invitacion", () => {
    it("monta AceptarInvitacionScreen en lugar de children", () => {
      setSearch("?token=tok-abc&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido protegido</div>
        </InvitacionGate>
      )

      expect(screen.getByTestId("aceptar-invitacion-screen")).toBeDefined()
      expect(screen.queryByTestId("children")).toBeNull()
    })

    it("pasa el token correcto a AceptarInvitacionScreen", () => {
      setSearch("?token=mi-token-123&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido</div>
        </InvitacionGate>
      )

      expect(capturedToken).toBe("mi-token-123")
    })
  })

  describe("sin parámetros de invitación en la URL", () => {
    it("renderiza children cuando no hay query string", () => {
      setSearch("")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido protegido</div>
        </InvitacionGate>
      )

      expect(screen.getByTestId("children")).toBeDefined()
      expect(screen.queryByTestId("aceptar-invitacion-screen")).toBeNull()
    })

    it("renderiza children cuando hay token pero sin accion=invitacion", () => {
      setSearch("?token=tok-abc")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido protegido</div>
        </InvitacionGate>
      )

      expect(screen.getByTestId("children")).toBeDefined()
      expect(screen.queryByTestId("aceptar-invitacion-screen")).toBeNull()
    })
  })

  describe("con ?accion=verificar", () => {
    it("NO intercepta y renderiza children (no confunde verificación con invitación)", () => {
      setSearch("?token=tok-ver&accion=verificar")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido protegido</div>
        </InvitacionGate>
      )

      expect(screen.getByTestId("children")).toBeDefined()
      expect(screen.queryByTestId("aceptar-invitacion-screen")).toBeNull()
    })
  })

  describe("tras onAceptado", () => {
    it("invoca recargar() del contexto", async () => {
      setSearch("?token=tok-abc&accion=invitacion")
      mockSesionAutenticada()
      const recargarMock = vi.fn().mockResolvedValue(undefined)
      mockOrganizacionActiva(recargarMock)

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido</div>
        </InvitacionGate>
      )

      // El componente está interceptando — invocar onAceptado
      expect(capturedOnAceptado).toBeDefined()
      await act(async () => {
        await capturedOnAceptado!()
      })

      expect(recargarMock).toHaveBeenCalledOnce()
    })

    it("limpia la URL (window.history.replaceState con pathname sin query)", async () => {
      setSearch("?token=tok-abc&accion=invitacion")
      mockSesionAutenticada()
      const recargarMock = vi.fn().mockResolvedValue(undefined)
      mockOrganizacionActiva(recargarMock)

      const replaceStateSpy = vi.fn()
      Object.defineProperty(window, "history", {
        writable: true,
        value: { ...window.history, replaceState: replaceStateSpy },
      })

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido</div>
        </InvitacionGate>
      )

      await act(async () => {
        await capturedOnAceptado!()
      })

      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/")
    })

    it("deja de interceptar y renderiza children tras onAceptado", async () => {
      setSearch("?token=tok-abc&accion=invitacion")
      mockSesionAutenticada()
      const recargarMock = vi.fn().mockResolvedValue(undefined)
      mockOrganizacionActiva(recargarMock)

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido</div>
        </InvitacionGate>
      )

      // Antes: está interceptando
      expect(screen.getByTestId("aceptar-invitacion-screen")).toBeDefined()

      await act(async () => {
        await capturedOnAceptado!()
      })

      // Después: delega en children
      await waitFor(() => {
        expect(screen.getByTestId("children")).toBeDefined()
        expect(screen.queryByTestId("aceptar-invitacion-screen")).toBeNull()
      })
    })
  })

  describe("tras onCambiarPantalla (Volver al inicio / cierre de error)", () => {
    it("limpia la URL y deja de interceptar al volver", async () => {
      setSearch("?token=tok-abc&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      const replaceStateSpy = vi.fn()
      Object.defineProperty(window, "history", {
        writable: true,
        value: { ...window.history, replaceState: replaceStateSpy },
      })

      render(
        <InvitacionGate>
          <div data-testid="children">Contenido</div>
        </InvitacionGate>
      )

      expect(capturedOnCambiarPantalla).toBeDefined()
      act(() => {
        capturedOnCambiarPantalla!("login")
      })

      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/")

      await waitFor(() => {
        expect(screen.getByTestId("children")).toBeDefined()
        expect(screen.queryByTestId("aceptar-invitacion-screen")).toBeNull()
      })
    })
  })
})

// ─── AceptarInvitacionScreen — mensajes de error por código ───────────────────
// Estos tests NO usan el mock de AceptarInvitacionScreen definido arriba;
// deben importar el componente real. Se usan imports con un módulo separado.

describe("AceptarInvitacionScreen — mensajes de error por código", () => {
  // Necesitamos desactivar el mock de AceptarInvitacionScreen para estos tests
  // Usamos un sub-módulo con vi.importActual para obtener el real.
  // Como vitest no soporta vi.unmock() de manera simple dentro de un describe,
  // creamos los tests de una manera diferente usando fetch mock.

  beforeEach(() => {
    vi.clearAllMocks()
    // Mock useSesion con usuario autenticado para estos tests
    mockUseSesion.mockReturnValue({
      usuario: USUARIO_TEST,
      cargando: false,
      refetch: vi.fn(),
      logout: vi.fn(),
    })
  })

  it("muestra el mensaje correcto para INVITACION_INVALIDA al aceptar", async () => {
    // Para este test necesitamos el componente real, no el mock.
    // Importamos dinámicamente para esquivar el hoisting del mock.
    const { AceptarInvitacionScreen } = await vi.importActual<
      typeof import("@/components/auth/aceptar-invitacion-screen")
    >("@/components/auth/aceptar-invitacion-screen")

    // Mock fetch: primero GET /api/invitaciones/info devuelve info válida,
    // luego POST /api/invitaciones/aceptar devuelve error INVITACION_INVALIDA
    let fetchCallCount = 0
    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      fetchCallCount++
      if (typeof url === "string" && url.includes("/api/invitaciones/info")) {
        return {
          ok: true,
          json: async () => ({
            organizacion: "Org Test",
            rol: "Editor",
            correo: "test@ejemplo.com",
          }),
        } as Response
      }
      if (typeof url === "string" && url.includes("/api/invitaciones/aceptar")) {
        return {
          ok: false,
          status: 400,
          json: async () => ({ error: { codigo: "INVITACION_INVALIDA" } }),
        } as Response
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <AceptarInvitacionScreen token="tok-invalido" onAceptado={vi.fn()} />
    )

    // Esperar a que cargue la info
    await waitFor(() => {
      expect(screen.queryByText(/Cargando información/i)).toBeNull()
    })

    // Hacer click en "Aceptar invitación"
    const boton = screen.getByRole("button", { name: /Aceptar invitación/i })
    await userEvent.click(boton)

    // Verificar mensaje de error
    await waitFor(() => {
      expect(
        screen.getByText(
          /Esta invitación no es válida, ha expirado o ya fue utilizada\./i
        )
      ).toBeDefined()
    })

    vi.unstubAllGlobals()
  })

  it("muestra el mensaje correcto para INVITACION_OTRO_CORREO al aceptar", async () => {
    const { AceptarInvitacionScreen } = await vi.importActual<
      typeof import("@/components/auth/aceptar-invitacion-screen")
    >("@/components/auth/aceptar-invitacion-screen")

    const fetchMock = vi.fn(async (url: string, opts?: RequestInit) => {
      if (typeof url === "string" && url.includes("/api/invitaciones/info")) {
        return {
          ok: true,
          json: async () => ({
            organizacion: "Org Test",
            rol: "Editor",
            correo: "otro@ejemplo.com",
          }),
        } as Response
      }
      if (typeof url === "string" && url.includes("/api/invitaciones/aceptar")) {
        return {
          ok: false,
          status: 403,
          json: async () => ({ error: { codigo: "INVITACION_OTRO_CORREO" } }),
        } as Response
      }
      return { ok: false, status: 500, json: async () => ({}) } as Response
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <AceptarInvitacionScreen token="tok-otro-correo" onAceptado={vi.fn()} />
    )

    await waitFor(() => {
      expect(screen.queryByText(/Cargando información/i)).toBeNull()
    })

    const boton = screen.getByRole("button", { name: /Aceptar invitación/i })
    await userEvent.click(boton)

    await waitFor(() => {
      expect(
        screen.getByText(
          /Esta invitación fue enviada a otro correo electrónico\./i
        )
      ).toBeDefined()
    })

    vi.unstubAllGlobals()
  })
})

// ─── AuthScreens — sin aceptación automática silenciosa ──────────────────────

describe("AuthScreens — sin aceptación automática silenciosa", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    setSearch("?token=tok-abc&accion=invitacion")
    // Sesión sin usuario (estado no autenticado)
    mockUseSesion.mockReturnValue({
      usuario: null,
      cargando: false,
      refetch: vi.fn(),
      logout: vi.fn(),
    })
  })

  afterEach(() => {
    setSearch("")
    vi.unstubAllGlobals()
  })

  it("handleLoginExitoso no llama POST /api/invitaciones/aceptar tras login exitoso", async () => {
    // Importar el componente real de AuthScreens (sin mocks de sus subcomponentes)
    const { AuthScreens } = await vi.importActual<
      typeof import("@/components/auth/auth-screens")
    >("@/components/auth/auth-screens")

    // Mock fetch para detectar cualquier llamada a /api/invitaciones/aceptar
    const fetchMock = vi.fn(async (url: string) => {
      // Respondemos OK a cualquier llamada para que no lance
      return {
        ok: true,
        json: async () => ({}),
      } as Response
    })
    vi.stubGlobal("fetch", fetchMock)

    // refetch de sesión: resuelve rápido
    const refetchMock = vi.fn().mockResolvedValue(undefined)
    mockUseSesion.mockReturnValue({
      usuario: null,
      cargando: false,
      refetch: refetchMock,
      logout: vi.fn(),
    })

    render(<AuthScreens />)

    const boton = screen.queryByTestId("trigger-login-exitoso")
    if (boton) {
      await userEvent.click(boton)

      // Esperar a que refetch se resuelva
      await waitFor(() => {
        expect(refetchMock).toHaveBeenCalled()
      })
    }

    // Verificar que NO se llamó a POST /api/invitaciones/aceptar
    const llamadasAceptar = fetchMock.mock.calls.filter(
      ([url]) =>
        typeof url === "string" && url.includes("/api/invitaciones/aceptar")
    )
    expect(llamadasAceptar).toHaveLength(0)
  })
})
