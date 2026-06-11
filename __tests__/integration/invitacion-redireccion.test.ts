/**
 * __tests__/integration/invitacion-redireccion.test.ts
 *
 * Pruebas de integración del fix de redirección de invitación.
 *
 * Renderiza el árbol completo de compuertas (AuthGate → InvitacionGate →
 * OrganizacionGate) con mocks de hooks y fetch, verificando el comportamiento
 * end-to-end de la cadena de compuertas.
 *
 * Flujos cubiertos:
 * - Flujo completo autenticado (cláusulas 2.1, 2.3, 2.4): usuario con sesión
 *   abre /?token=…&accion=invitacion → ve "Aceptar invitación" → acepta →
 *   URL limpia → contexto recargado → entra a la app.
 * - Flujo de error autenticado (cláusulas 2.2, 3.3): token expirado → mensaje
 *   de error visible → "Volver al inicio" limpia la URL → aplica
 *   OrganizacionGate normal.
 * - Regresión no autenticado (cláusula 3.1): abrir el enlace sin sesión sigue
 *   mostrando AceptarInvitacionScreen con opción de registrarse/iniciar sesión.
 * - Regresión verificación (cláusula 3.2): ?accion=verificar sigue mostrando
 *   la pantalla de verificación.
 *
 * Validates: Requirements 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3
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

// ─── Mocks de dependencias externas ───────────────────────────────────────────

vi.mock("@/hooks/use-sesion", () => ({
  useSesion: vi.fn(),
}))

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: vi.fn(),
  OrganizacionActivaProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

// Mock de sub-componentes de AuthScreens (necesario para hoisting de vi.mock)
vi.mock("@/components/auth/login-screen", () => ({
  LoginScreen: ({
    onLoginExitoso,
  }: {
    onLoginExitoso?: () => void
  }) => (
    React.createElement("div", { "data-testid": "login-screen" },
      React.createElement("button", {
        "data-testid": "trigger-login-exitoso",
        onClick: () => onLoginExitoso?.(),
      }, "Simular login exitoso")
    )
  ),
}))

vi.mock("@/components/auth/registro-screen", () => ({
  RegistroScreen: () => React.createElement("div", { "data-testid": "registro-screen" }, "Registro"),
}))

vi.mock("@/components/auth/verificacion-screen", () => ({
  VerificacionScreen: ({ token }: { token: string }) =>
    React.createElement("div", { "data-testid": "verificacion-screen" }, `Verificacion token=${token}`),
}))

// Mock mínimo de SeleccionOrganizacion para identificarla en el DOM
vi.mock("@/components/organizaciones/seleccion-organizacion", () => ({
  SeleccionOrganizacion: () =>
    React.createElement("div", { "data-testid": "seleccion-organizacion" }, "Selecciona una organización"),
}))

// Mock del Skeleton de UI
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement("div", { "data-testid": "skeleton", className }),
}))

// ─── Imports tras los mocks ────────────────────────────────────────────────────

import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { AuthGate } from "@/components/auth/auth-gate"
import { InvitacionGate } from "@/components/auth/invitacion-gate"
import { OrganizacionGate } from "@/components/organizaciones/organizacion-gate"

const mockUseSesion = useSesion as ReturnType<typeof vi.fn>
const mockUseOrganizacionActiva = useOrganizacionActiva as ReturnType<typeof vi.fn>

// ─── Constantes de prueba ──────────────────────────────────────────────────────

const USUARIO_TEST = { id: "u1", correo: "test@ejemplo.com", nombre: "Test" }
const ORG_TEST = { id: "org1", nombre: "Org Test", slug: "org-test" }

// ─── Árbol de compuertas completo (como en page.tsx) ──────────────────────────

/**
 * Renderiza la cadena completa de compuertas: AuthGate → InvitacionGate →
 * OrganizacionGate. Los children representan la app autenticada con
 * organización activa.
 */
function ArbolCompuertas() {
  return React.createElement(
    AuthGate,
    null,
    React.createElement(
      InvitacionGate,
      null,
      React.createElement(
        OrganizacionGate,
        null,
        React.createElement("div", { "data-testid": "app-shell" }, "App Shell")
      )
    )
  )
}

// ─── Helpers de setup de mocks ─────────────────────────────────────────────────

function mockSesionAutenticada(extra?: Partial<ReturnType<typeof useSesion>>) {
  mockUseSesion.mockReturnValue({
    usuario: USUARIO_TEST,
    cargando: false,
    refetch: vi.fn(),
    logout: vi.fn(),
    ...extra,
  })
}

function mockSesionNoAutenticada(extra?: Partial<ReturnType<typeof useSesion>>) {
  mockUseSesion.mockReturnValue({
    usuario: null,
    cargando: false,
    refetch: vi.fn(),
    logout: vi.fn(),
    ...extra,
  })
}

function mockOrganizacionSinSeleccionar(recargar?: ReturnType<typeof vi.fn>) {
  mockUseOrganizacionActiva.mockReturnValue({
    organizacion: null,
    organizaciones: [],
    cargando: false,
    error: null,
    seleccionar: vi.fn(),
    recargar: recargar ?? vi.fn().mockResolvedValue(undefined),
  })
}

function mockOrganizacionActiva() {
  mockUseOrganizacionActiva.mockReturnValue({
    organizacion: ORG_TEST,
    organizaciones: [ORG_TEST],
    cargando: false,
    error: null,
    seleccionar: vi.fn(),
    recargar: vi.fn().mockResolvedValue(undefined),
  })
}

// ─── Tests ─────────────────────────────────────────────────────────────────────

describe("Integración: Redirección de invitación por correo (cadena de compuertas)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    setSearch("")
    vi.unstubAllGlobals()
  })

  // ─── Flujo completo autenticado ──────────────────────────────────────────────

  describe("Flujo completo autenticado (cláusulas 2.1, 2.3, 2.4)", () => {
    it("usuario autenticado con ?token=…&accion=invitacion ve AceptarInvitacionScreen en lugar de SeleccionOrganizacion", async () => {
      // Arrange
      setSearch("?token=tok-valido&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionSinSeleccionar()

      // Mock fetch: GET /api/invitaciones/info devuelve info válida
      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: true,
            json: async () => ({
              organizacion: "Org Test",
              rol: "Editor",
              correo: "test@ejemplo.com",
            }),
          } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: InvitacionGate intercepta → AceptarInvitacionScreen se monta.
      // La pantalla muestra el heading "Invitación a organización" o bien el
      // skeleton de carga ("Invitación" en el CardTitle) y el botón de aceptar.
      // Verificamos que aparece el contenedor de la pantalla de invitación.
      await waitFor(() => {
        // El botón "Aceptar invitación" o el estado de carga son la señal más
        // inequívoca de que AceptarInvitacionScreen se montó.
        const botonOCargando =
          screen.queryByRole("button", { name: /Aceptar invitación/i }) ??
          screen.queryByText(/Cargando información de la invitación/i)
        expect(botonOCargando).not.toBeNull()
      })

      // SeleccionOrganizacion NO debe estar visible (requisito 2.1)
      expect(screen.queryByTestId("seleccion-organizacion")).toBeNull()
      // El app shell tampoco
      expect(screen.queryByTestId("app-shell")).toBeNull()
    })

    it("tras aceptar la invitación se limpia la URL (requisito 2.3)", async () => {
      // Arrange
      setSearch("?token=tok-valido&accion=invitacion")
      mockSesionAutenticada()
      const recargarMock = vi.fn().mockResolvedValue(undefined)
      mockOrganizacionSinSeleccionar(recargarMock)

      const replaceStateSpy = vi.fn()
      Object.defineProperty(window, "history", {
        writable: true,
        value: { ...window.history, replaceState: replaceStateSpy },
      })

      let fetchCallCount = 0
      vi.stubGlobal("fetch", vi.fn(async (url: string, opts?: RequestInit) => {
        fetchCallCount++
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: true,
            json: async () => ({
              organizacion: "Org Test",
              rol: "Editor",
              correo: "test@ejemplo.com",
            }),
          } as Response
        }
        if (url.includes("/api/invitaciones/aceptar")) {
          return { ok: true, json: async () => ({}) } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      // Esperar a que cargue la info de la invitación
      await waitFor(() => {
        expect(screen.queryByText(/Cargando información/i)).toBeNull()
      })

      // Hacer click en "Aceptar invitación"
      const botonAceptar = screen.getByRole("button", { name: /Aceptar invitación/i })
      await userEvent.click(botonAceptar)

      // Assert: replaceState llamado con pathname sin query (requisito 2.3)
      await waitFor(() => {
        expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/")
      })
    })

    it("tras aceptar con éxito, se recarga el contexto de organizaciones (requisito 2.4)", async () => {
      // Arrange
      setSearch("?token=tok-valido&accion=invitacion")
      mockSesionAutenticada()
      const recargarMock = vi.fn().mockResolvedValue(undefined)
      mockOrganizacionSinSeleccionar(recargarMock)

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: true,
            json: async () => ({
              organizacion: "Org Test",
              rol: "Editor",
              correo: "test@ejemplo.com",
            }),
          } as Response
        }
        if (url.includes("/api/invitaciones/aceptar")) {
          return { ok: true, json: async () => ({}) } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      await waitFor(() => {
        expect(screen.queryByText(/Cargando información/i)).toBeNull()
      })

      const botonAceptar = screen.getByRole("button", { name: /Aceptar invitación/i })
      await userEvent.click(botonAceptar)

      // Assert: recargar() invocado (requisito 2.4)
      await waitFor(() => {
        expect(recargarMock).toHaveBeenCalledOnce()
      })
    })

    it("tras aceptar con éxito, InvitacionGate deja de interceptar y delega en OrganizacionGate (requisito 2.4)", async () => {
      // Arrange
      setSearch("?token=tok-valido&accion=invitacion")
      mockSesionAutenticada()
      const recargarMock = vi.fn().mockResolvedValue(undefined)

      // Primera llamada: sin org activa (mientras intercept); segunda: con org activa (tras aceptar)
      let recargarLlamadas = 0
      mockUseOrganizacionActiva.mockImplementation(() => {
        // Tras recargar, la org ya estará disponible en el contexto real.
        // Simulamos que tras recargar hay org activa.
        return {
          organizacion: recargarLlamadas > 0 ? ORG_TEST : null,
          organizaciones: recargarLlamadas > 0 ? [ORG_TEST] : [],
          cargando: false,
          error: null,
          seleccionar: vi.fn(),
          recargar: async () => {
            recargarLlamadas++
            recargarMock()
          },
        }
      })

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: true,
            json: async () => ({
              organizacion: "Org Test",
              rol: "Editor",
              correo: "test@ejemplo.com",
            }),
          } as Response
        }
        if (url.includes("/api/invitaciones/aceptar")) {
          return { ok: true, json: async () => ({}) } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      await waitFor(() => {
        expect(screen.queryByText(/Cargando información/i)).toBeNull()
      })

      const botonAceptar = screen.getByRole("button", { name: /Aceptar invitación/i })
      await userEvent.click(botonAceptar)

      // Assert: el árbol entero deja de mostrar la pantalla de invitación
      await waitFor(() => {
        expect(screen.queryByText(/Invitación a organización/i)).toBeNull()
      })

      // App shell visible (OrganizacionGate resolvió con org activa)
      await waitFor(() => {
        expect(screen.getByTestId("app-shell")).toBeDefined()
      })
    })
  })

  // ─── Flujo de error autenticado ──────────────────────────────────────────────

  describe("Flujo de error autenticado (cláusulas 2.2, 3.3)", () => {
    it("token expirado → mensaje de error visible al usuario (cláusula 2.2)", async () => {
      // Arrange
      setSearch("?token=tok-expirado&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionSinSeleccionar()

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: false,
            status: 400,
            json: async () => ({}),
          } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: mensaje de error visible (cláusula 2.2 — errores visibles, no silenciosos)
      await waitFor(() => {
        expect(
          screen.getByText(/no es válida, ha expirado o ya fue utilizada/i)
        ).toBeDefined()
      })

      // SeleccionOrganizacion NO debe aparecer (el error se maneja en AceptarInvitacionScreen)
      expect(screen.queryByTestId("seleccion-organizacion")).toBeNull()
    })

    it("'Volver al inicio' limpia la URL y aplica OrganizacionGate normal (cláusula 3.3)", async () => {
      // Arrange
      setSearch("?token=tok-expirado&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionSinSeleccionar()

      const replaceStateSpy = vi.fn()
      Object.defineProperty(window, "history", {
        writable: true,
        value: { ...window.history, replaceState: replaceStateSpy },
      })

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: false,
            status: 400,
            json: async () => ({}),
          } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      // Esperar a que aparezca el estado de error
      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Volver al inicio/i })).toBeDefined()
      })

      // Hacer click en "Volver al inicio"
      await userEvent.click(screen.getByRole("button", { name: /Volver al inicio/i }))

      // Assert: URL limpiada (cláusula 2.3)
      expect(replaceStateSpy).toHaveBeenCalledWith(null, "", "/")

      // Assert: InvitacionGate ya no intercepta → OrganizacionGate se aplica
      // normalmente (cláusula 3.3) → sin org activa muestra SeleccionOrganizacion
      await waitFor(() => {
        expect(screen.getByTestId("seleccion-organizacion")).toBeDefined()
      })
    })

    it("tras 'Volver al inicio', InvitacionGate no vuelve a interceptar (URL ya limpia)", async () => {
      // Arrange
      setSearch("?token=tok-expirado&accion=invitacion")
      mockSesionAutenticada()
      mockOrganizacionActiva() // con org activa para que app-shell se muestre

      const replaceStateSpy = vi.fn()
      Object.defineProperty(window, "history", {
        writable: true,
        value: { ...window.history, replaceState: replaceStateSpy },
      })

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return { ok: false, status: 400, json: async () => ({}) } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Volver al inicio/i })).toBeDefined()
      })

      await userEvent.click(screen.getByRole("button", { name: /Volver al inicio/i }))

      // Assert: delega en OrganizacionGate → con org activa muestra app-shell
      await waitFor(() => {
        expect(screen.getByTestId("app-shell")).toBeDefined()
      })

      // La pantalla de invitación ya no se muestra
      expect(screen.queryByText(/Invitación/i)).toBeNull()
    })
  })

  // ─── Regresión: flujo no autenticado (cláusula 3.1) ──────────────────────────

  describe("Regresión no autenticado (cláusula 3.1)", () => {
    it("sin sesión y con ?token=…&accion=invitacion, AuthGate monta AuthScreens (no InvitacionGate)", async () => {
      // Arrange
      setSearch("?token=tok-valido&accion=invitacion")
      mockSesionNoAutenticada()
      mockOrganizacionSinSeleccionar()

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: AuthGate detecta !usuario y monta AuthScreens, que internamente
      // muestra AceptarInvitacionScreen (pantallaInicial detecta accion=invitacion).
      // InvitacionGate nunca se monta porque es child de AuthGate.
      // Lo que se muestra debe ser la pantalla de invitación no autenticada,
      // que contiene la opción de registrarse/iniciar sesión (cláusula 3.1).
      await waitFor(() => {
        // AuthScreens con accion=invitacion muestra AceptarInvitacionScreen
        // (que internamente hace fetch de /api/invitaciones/info)
        // En modo no autenticado, mostrará la pantalla de invitación con la opción
        // de registrarse o iniciar sesión.
        // Verificamos que NO se muestra el app-shell ni la selección de org.
        expect(screen.queryByTestId("app-shell")).toBeNull()
        expect(screen.queryByTestId("seleccion-organizacion")).toBeNull()
      })
    })

    it("sin sesión y con token, AuthScreens muestra la pantalla de invitación con opción de registrarse", async () => {
      // Arrange
      setSearch("?token=tok-valido&accion=invitacion")
      mockSesionNoAutenticada()
      mockOrganizacionSinSeleccionar()

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          return {
            ok: true,
            json: async () => ({
              organizacion: "Org Test",
              rol: "Editor",
              correo: "invitado@ejemplo.com",
            }),
          } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: pantalla de invitación visible con opción para registrarse (cláusula 3.1)
      await waitFor(() => {
        // Sin usuario autenticado, AceptarInvitacionScreen muestra "Regístrate para aceptar"
        expect(
          screen.getByRole("button", { name: /Regístrate para aceptar/i })
        ).toBeDefined()
      })

      // No debe aparecer la pantalla del app autenticado
      expect(screen.queryByTestId("app-shell")).toBeNull()
    })

    it("sin sesión y con token, la pantalla de invitación conserva el token (cláusula 3.1)", async () => {
      // El token debe estar accesible para que AuthScreens pueda pasarlo a
      // AceptarInvitacionScreen al navegar a registro/login.
      // Verificamos que la pantalla se renderiza con el token de la URL.

      const TOKEN = "tok-preservado-abc123"
      setSearch(`?token=${TOKEN}&accion=invitacion`)
      mockSesionNoAutenticada()
      mockOrganizacionSinSeleccionar()

      vi.stubGlobal("fetch", vi.fn(async (url: string) => {
        if (url.includes("/api/invitaciones/info")) {
          // Verificar que el token correcto fue incluido en la URL
          expect(url).toContain(TOKEN)
          return {
            ok: true,
            json: async () => ({
              organizacion: "Org Test",
              rol: "Editor",
              correo: "invitado@ejemplo.com",
            }),
          } as Response
        }
        return { ok: false, status: 404, json: async () => ({}) } as Response
      }))

      render(React.createElement(ArbolCompuertas))

      // Esperar a que la pantalla cargue la info con el token correcto
      await waitFor(() => {
        expect(
          screen.getByRole("button", { name: /Regístrate para aceptar/i })
        ).toBeDefined()
      })
    })
  })

  // ─── Regresión: flujo de verificación (cláusula 3.2) ─────────────────────────

  describe("Regresión verificación (cláusula 3.2)", () => {
    it("sin sesión y con ?accion=verificar, AuthScreens muestra VerificacionScreen", async () => {
      // Arrange
      setSearch("?token=tok-ver&accion=verificar")
      mockSesionNoAutenticada()
      mockOrganizacionSinSeleccionar()

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: VerificacionScreen se muestra (cláusula 3.2)
      await waitFor(() => {
        expect(screen.getByTestId("verificacion-screen")).toBeDefined()
      })

      // No debe mostrarse la pantalla de invitación ni la app
      expect(screen.queryByRole("button", { name: /Aceptar invitación/i })).toBeNull()
      expect(screen.queryByTestId("app-shell")).toBeNull()
    })

    it("con sesión autenticada y ?accion=verificar, InvitacionGate NO intercepta → OrganizacionGate normal (cláusula 3.2)", async () => {
      // Arrange: sesión autenticada pero con accion=verificar (no invitacion)
      setSearch("?token=tok-ver&accion=verificar")
      mockSesionAutenticada()
      mockOrganizacionActiva() // con org activa para llegar al app-shell

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: InvitacionGate no intercepta (accion != "invitacion")
      // → OrganizacionGate con org activa → app-shell visible
      await waitFor(() => {
        expect(screen.getByTestId("app-shell")).toBeDefined()
      })

      expect(screen.queryByRole("button", { name: /Aceptar invitación/i })).toBeNull()
    })

    it("con sesión autenticada y ?accion=verificar sin org activa, InvitacionGate delega en OrganizacionGate (cláusula 3.2, 3.3)", async () => {
      // Arrange: sesión autenticada, accion=verificar, sin org activa
      setSearch("?token=tok-ver&accion=verificar")
      mockSesionAutenticada()
      mockOrganizacionSinSeleccionar()

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: OrganizacionGate se aplica normalmente (cláusula 3.3)
      await waitFor(() => {
        expect(screen.getByTestId("seleccion-organizacion")).toBeDefined()
      })

      expect(screen.queryByRole("button", { name: /Aceptar invitación/i })).toBeNull()
      expect(screen.queryByTestId("app-shell")).toBeNull()
    })
  })

  // ─── Casos límite / edge cases ────────────────────────────────────────────────

  describe("Edge cases", () => {
    it("usuario autenticado sin params → OrganizacionGate se aplica normalmente (cláusula 3.3)", async () => {
      // Arrange
      setSearch("")
      mockSesionAutenticada()
      mockOrganizacionSinSeleccionar()

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: sin params, InvitacionGate no intercepta → OrganizacionGate muestra
      // selección de organización
      await waitFor(() => {
        expect(screen.getByTestId("seleccion-organizacion")).toBeDefined()
      })

      expect(screen.queryByRole("button", { name: /Aceptar invitación/i })).toBeNull()
    })

    it("usuario autenticado con org activa y sin params → app-shell visible (cláusula 3.3)", async () => {
      // Arrange
      setSearch("")
      mockSesionAutenticada()
      mockOrganizacionActiva()

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: flujo normal → app-shell
      await waitFor(() => {
        expect(screen.getByTestId("app-shell")).toBeDefined()
      })
    })

    it("usuario autenticado con token pero sin accion=invitacion → OrganizacionGate normal", async () => {
      // Arrange: token presente pero sin accion (o con otro valor)
      setSearch("?token=tok-abc")
      mockSesionAutenticada()
      mockOrganizacionSinSeleccionar()

      // Act
      render(React.createElement(ArbolCompuertas))

      // Assert: InvitacionGate no intercepta (falta accion=invitacion)
      await waitFor(() => {
        expect(screen.getByTestId("seleccion-organizacion")).toBeDefined()
      })

      expect(screen.queryByRole("button", { name: /Aceptar invitación/i })).toBeNull()
    })
  })
})
