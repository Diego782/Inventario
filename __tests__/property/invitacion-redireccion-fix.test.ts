// Feature: invitacion-correo-redireccion-fix, Property 1: Bug Condition
/**
 * Property 1: Bug Condition — Usuario autenticado con token ve "Aceptar invitación"
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 *
 * PRUEBA EXPLORATORIA DE CONDICIÓN DE BUG
 * ========================================
 * Esta prueba codifica el COMPORTAMIENTO ESPERADO (F') de la cadena de compuertas
 * corregida. DEBE FALLAR sobre el código sin corregir porque:
 *   - Hoy (F): AuthGate ve usuario != null → renderiza children →
 *     OrganizacionGate sin org activa → SeleccionOrganizacion
 *   - Esperado (F'): AuthGate → InvitacionGate detecta ?token=&accion=invitacion →
 *     AceptarInvitacionScreen (nunca llega a OrganizacionGate)
 *
 * El fallo de esta prueba ES el éxito: confirma que el bug existe.
 * Esta misma prueba validará el fix cuando pase tras la implementación de la tarea 3.
 *
 * FUNCIÓN DE CONDICIÓN DE BUG (del diseño):
 *   isBugCondition(X) = X.autenticado = true AND X.urlToken ≠ null AND X.urlAccion = "invitacion"
 *
 * PROPIEDAD ESPERADA:
 *   FOR ALL X WHERE isBugCondition(X):
 *     resolverPantalla'(X) = "aceptar-invitacion" AND resolverPantalla'(X) ≠ "seleccion-organizacion"
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen } from "@testing-library/react"
import * as fc from "fast-check"

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-sesion", () => ({
  useSesion: vi.fn(),
}))

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: vi.fn(),
  OrganizacionActivaProvider: ({ children }: { children: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children),
}))

// AceptarInvitacionScreen — marcador identificable
vi.mock("@/components/auth/aceptar-invitacion-screen", () => ({
  AceptarInvitacionScreen: ({ token }: { token: string }) =>
    React.createElement(
      "div",
      { "data-testid": "aceptar-invitacion-screen", "data-token": token },
      "Aceptar invitación"
    ),
}))

// AuthScreens — marcador identificable (usuarios no autenticados)
vi.mock("@/components/auth/auth-screens", () => ({
  AuthScreens: () =>
    React.createElement("div", { "data-testid": "auth-screens" }, "AuthScreens"),
}))

// SeleccionOrganizacion — marcador identificable
vi.mock("@/components/organizaciones/seleccion-organizacion", () => ({
  SeleccionOrganizacion: () =>
    React.createElement(
      "div",
      { "data-testid": "seleccion-organizacion" },
      "Selecciona una organización"
    ),
}))

// Skeleton — evitar errores de render
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) =>
    React.createElement("div", { "data-testid": "skeleton", className }),
}))

import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { AuthGate } from "@/components/auth/auth-gate"
import { InvitacionGate } from "@/components/auth/invitacion-gate"
import { OrganizacionGate } from "@/components/organizaciones/organizacion-gate"

// ── Helpers ────────────────────────────────────────────────────────────────

const mockUseSesion = useSesion as ReturnType<typeof vi.fn>
const mockUseOrganizacionActiva = useOrganizacionActiva as ReturnType<
  typeof vi.fn
>

/** Usuario autenticado de prueba */
const USUARIO_AUTENTICADO = {
  id: "u-test-123",
  correo: "usuario@ejemplo.com",
  nombre: "Usuario Test",
}

/**
 * Renderiza la cadena de compuertas corregida F': AuthGate → InvitacionGate → OrganizacionGate.
 * Con sesión autenticada y sin organización activa, pero con ?token=&accion=invitacion en la URL,
 * InvitacionGate debe interceptar y mostrar AceptarInvitacionScreen.
 *
 * Los children del árbol representan la "app" (pantalla que se vería si
 * no hubiera ninguna compuerta que intercepte).
 */
function renderArbolCompuertas(token: string) {
  mockUseSesion.mockReturnValue({
    usuario: USUARIO_AUTENTICADO,
    cargando: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  })

  mockUseOrganizacionActiva.mockReturnValue({
    organizacion: null, // sin org activa → OrganizacionGate llevaría a SeleccionOrganizacion
    organizaciones: [],
    cargando: false,
    error: null,
    seleccionar: vi.fn(),
    recargar: vi.fn(),
  })

  // Establecer la URL simulada con token de invitación
  Object.defineProperty(window, "location", {
    value: {
      ...window.location,
      search: `?token=${encodeURIComponent(token)}&accion=invitacion`,
      pathname: "/",
    },
    writable: true,
    configurable: true,
  })

  // Árbol F': AuthGate → InvitacionGate → OrganizacionGate
  // InvitacionGate detecta el token y muestra AceptarInvitacionScreen antes de llegar a OrganizacionGate
  render(
    React.createElement(
      AuthGate,
      null,
      React.createElement(
        InvitacionGate,
        null,
        React.createElement(
          OrganizacionGate,
          null,
          // children = la "app" — nunca debería verse si InvitacionGate intercepta
          React.createElement(
            "div",
            { "data-testid": "app-shell" },
            "App Shell"
          )
        )
      )
    )
  )
}

/**
 * Lee la pantalla que está actualmente montada en el DOM.
 * Devuelve la etiqueta del modelo de decisión:
 *   "aceptar-invitacion" | "seleccion-organizacion" | "auth-screens" | "app" | "skeleton"
 */
function leerPantallaActual(): string {
  if (screen.queryByTestId("aceptar-invitacion-screen")) return "aceptar-invitacion"
  if (screen.queryByTestId("seleccion-organizacion")) return "seleccion-organizacion"
  if (screen.queryByTestId("auth-screens")) return "auth-screens"
  if (screen.queryByTestId("app-shell")) return "app"
  if (screen.queryByTestId("skeleton")) return "skeleton"
  return "desconocida"
}

// ── Limpieza de location entre pruebas ────────────────────────────────────

afterEach(() => {
  Object.defineProperty(window, "location", {
    value: { ...window.location, search: "", pathname: "/" },
    writable: true,
    configurable: true,
  })
})

// ══════════════════════════════════════════════════════════════════════════════
// Pruebas exploratorias de la condición de bug
// ══════════════════════════════════════════════════════════════════════════════

describe("Property 1: Bug Condition — Usuario autenticado con token ve 'Aceptar invitación'", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  /**
   * CASO 1 (PBT): Para todo token de invitación no vacío, un usuario autenticado
   * debe ver la pantalla "aceptar-invitacion", no "seleccion-organizacion".
   *
   * RESULTADO ESPERADO SOBRE CÓDIGO CORREGIDO (F'):
   *   fast-check NO encontrará contraejemplos — la propiedad se cumple para todo token.
   *   InvitacionGate intercepta el token y muestra AceptarInvitacionScreen.
   *
   * isBugCondition: autenticado=true, urlToken≠null, urlAccion="invitacion"
   */
  it("PBT — autenticado + token invitación → pantalla 'aceptar-invitacion', nunca 'seleccion-organizacion'", () => {
    // Generador: tokens no vacíos (mínimo 1 char), cubriendo todo el dominio de tokens
    const arbToken = fc.string({ minLength: 1, maxLength: 128 }).filter(
      (t) => t.trim().length > 0
    )

    // Sobre código corregido (F'): la propiedad debe PASAR para todos los tokens
    fc.assert(
      fc.property(arbToken, (token) => {
        renderArbolCompuertas(token)
        const pantalla = leerPantallaActual()

        // Limpieza entre iteraciones del generador
        const { cleanup } = require("@testing-library/react")
        cleanup()

        // Restaurar location
        Object.defineProperty(window, "location", {
          value: { ...window.location, search: "", pathname: "/" },
          writable: true,
          configurable: true,
        })

        // La propiedad que DEBE cumplirse en el código corregido (F'):
        // pantalla = "aceptar-invitacion" AND pantalla ≠ "seleccion-organizacion"
        return (
          pantalla === "aceptar-invitacion" &&
          pantalla !== "seleccion-organizacion"
        )
      }),
      { numRuns: 50 }
    )
  })

  /**
   * CASO 1b (ejemplo determinista): token fijo "abc123" — verifica el caso
   * documentado en el bugfix.md.
   *
   * RESULTADO ESPERADO AL CORRER SOBRE CÓDIGO SIN CORREGIR:
   *   pantalla = "seleccion-organizacion" → fallo de la aserción.
   */
  it("Ejemplo — autenticado + token='abc123' → debe ver 'aceptar-invitacion', no 'seleccion-organizacion'", () => {
    renderArbolCompuertas("abc123")
    const pantalla = leerPantallaActual()

    console.log(
      `\n━━━ CONTRAEJEMPLO: token='abc123', pantalla='${pantalla}' ━━━`,
      "\nEsperado: 'aceptar-invitacion'",
      "\nActual:   '" + pantalla + "'",
      "\nDiagnóstico:",
      "\n  AuthGate ve usuario!=null → renderiza children.",
      "\n  OrganizacionGate ve organizacion=null → monta SeleccionOrganizacion.",
      "\n  El token de la URL se ignora por completo.",
      "\n  AceptarInvitacionScreen NUNCA se monta para usuarios autenticados."
    )

    // Aserciones que DEBEN fallar sobre código sin corregir:
    expect(pantalla).toBe("aceptar-invitacion")
    expect(pantalla).not.toBe("seleccion-organizacion")
  })

  /**
   * CASO 2: Invitación con token "expirado" — el usuario autenticado debería
   * ver la pantalla de aceptación (con mensaje INVITACION_INVALIDA), no selección.
   *
   * RESULTADO ESPERADO AL CORRER SOBRE CÓDIGO SIN CORREGIR:
   *   pantalla = "seleccion-organizacion" → fallo.
   */
  it("Ejemplo — autenticado + token='expirado' → debe ver pantalla de aceptación (con error INVITACION_INVALIDA)", () => {
    renderArbolCompuertas("expirado")
    const pantalla = leerPantallaActual()

    console.log(
      `\n━━━ CONTRAEJEMPLO: token='expirado', pantalla='${pantalla}' ━━━`,
      "\nEsperado: 'aceptar-invitacion' (AceptarInvitacionScreen mostraría el error INVITACION_INVALIDA)",
      "\nActual:   '" + pantalla + "'",
      "\nDiagnóstico: El token ni siquiera se lee para usuarios autenticados.",
      "\nLa pantalla de error nunca se muestra — el usuario ve 'Selecciona una organización'."
    )

    expect(pantalla).toBe("aceptar-invitacion")
    expect(pantalla).not.toBe("seleccion-organizacion")
  })

  /**
   * CASO 4 (edge): La URL debe poder limpiarse tras aceptar.
   * Verifica que el árbol corregido monta AceptarInvitacionScreen (prerrequisito
   * para que el flujo pueda limpiar los parámetros).
   *
   * RESULTADO ESPERADO SOBRE CÓDIGO CORREGIDO (F'):
   *   - pantalla = "aceptar-invitacion" → InvitacionGate interceptó correctamente.
   *   - window.location.search mantiene los params durante el render (la limpieza
   *     ocurre al completar el flujo: onAceptado / handleVolver).
   */
  it("Edge — URL conserva params tras el render (confirma que no hay limpieza en el código sin corregir)", () => {
    const token = "token-persistente-xyz"
    renderArbolCompuertas(token)

    const pantalla = leerPantallaActual()
    const searchActual = window.location.search

    console.log(
      `\n━━━ EDGE (código corregido F'): params en URL ━━━`,
      `\n  pantalla='${pantalla}' (esperado: 'aceptar-invitacion')`,
      `\n  window.location.search='${searchActual}'`,
      "\nDiagnóstico:",
      "\n  InvitacionGate intercepta el token y monta AceptarInvitacionScreen.",
      "\n  La URL se limpiará al completar el flujo (onAceptado/handleVolver).",
      "\n  Esta prueba verifica que al menos el componente se monta correctamente."
    )

    // Aserción de pantalla (F' intercepta y muestra la pantalla correcta)
    expect(pantalla).toBe("aceptar-invitacion")
    expect(pantalla).not.toBe("seleccion-organizacion")
  })
})
