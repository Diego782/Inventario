/**
 * __tests__/unit/auth-gate.test.tsx
 *
 * Pruebas ejemplares de AuthGate y OrganizacionGate.
 *
 * AuthGate (R5.6, R5.7):
 *   - Cargando → muestra skeleton (sin sesión resuelta aún)
 *   - Sin sesión → muestra AuthScreens
 *   - Con sesión → muestra children
 *
 * OrganizacionGate (R7.5):
 *   - Cargando → muestra skeleton
 *   - Sin org activa → muestra SeleccionOrganizacion
 *   - Con org activa → muestra children
 *
 * Validates: Requirements R5.6, R5.7, R7.5
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

// ── Mocks ──────────────────────────────────────────────────────────────────

vi.mock("@/hooks/use-sesion", () => ({
  useSesion: vi.fn(),
}))

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: vi.fn(),
}))

// Mock AuthScreens para identificarla fácilmente en el DOM
vi.mock("@/components/auth/auth-screens", () => ({
  AuthScreens: () => <div data-testid="auth-screens">AuthScreens</div>,
}))

// Mock SeleccionOrganizacion para identificarla fácilmente en el DOM
vi.mock("@/components/organizaciones/seleccion-organizacion", () => ({
  SeleccionOrganizacion: () => (
    <div data-testid="seleccion-organizacion">SeleccionOrganizacion</div>
  ),
}))

// Mock Skeleton para que sea identificable
vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}))

import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { AuthGate } from "@/components/auth/auth-gate"
import { OrganizacionGate } from "@/components/organizaciones/organizacion-gate"

const mockUseSesion = useSesion as ReturnType<typeof vi.fn>
const mockUseOrganizacionActiva = useOrganizacionActiva as ReturnType<
  typeof vi.fn
>

// ── AuthGate ───────────────────────────────────────────────────────────────

describe("AuthGate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("cargando → muestra skeleton y no muestra children ni AuthScreens", () => {
    mockUseSesion.mockReturnValue({
      usuario: null,
      cargando: true,
      refetch: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <AuthGate>
        <div data-testid="children">Contenido protegido</div>
      </AuthGate>
    )

    // Debe haber al menos un skeleton visible
    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
    // No debe mostrar las pantallas de auth ni el contenido protegido
    expect(screen.queryByTestId("auth-screens")).toBeNull()
    expect(screen.queryByTestId("children")).toBeNull()
  })

  it("sin sesión → muestra AuthScreens y no muestra children", () => {
    mockUseSesion.mockReturnValue({
      usuario: null,
      cargando: false,
      refetch: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <AuthGate>
        <div data-testid="children">Contenido protegido</div>
      </AuthGate>
    )

    expect(screen.getByTestId("auth-screens")).toBeDefined()
    expect(screen.queryByTestId("children")).toBeNull()
    expect(screen.queryByTestId("skeleton")).toBeNull()
  })

  it("con sesión válida → muestra children y no muestra AuthScreens", () => {
    mockUseSesion.mockReturnValue({
      usuario: {
        id: "u1",
        correo: "usuario@ejemplo.com",
        nombre: "Usuario Test",
      },
      cargando: false,
      refetch: vi.fn(),
      logout: vi.fn(),
    })

    render(
      <AuthGate>
        <div data-testid="children">Contenido protegido</div>
      </AuthGate>
    )

    expect(screen.getByTestId("children")).toBeDefined()
    expect(screen.queryByTestId("auth-screens")).toBeNull()
    expect(screen.queryByTestId("skeleton")).toBeNull()
  })
})

// ── OrganizacionGate ───────────────────────────────────────────────────────

describe("OrganizacionGate", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("cargando → muestra skeleton y no muestra children ni SeleccionOrganizacion", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: true,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(
      <OrganizacionGate>
        <div data-testid="children">Shell de la app</div>
      </OrganizacionGate>
    )

    expect(screen.getAllByTestId("skeleton").length).toBeGreaterThan(0)
    expect(screen.queryByTestId("seleccion-organizacion")).toBeNull()
    expect(screen.queryByTestId("children")).toBeNull()
  })

  it("sin org activa → muestra SeleccionOrganizacion y no muestra children", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(
      <OrganizacionGate>
        <div data-testid="children">Shell de la app</div>
      </OrganizacionGate>
    )

    expect(screen.getByTestId("seleccion-organizacion")).toBeDefined()
    expect(screen.queryByTestId("children")).toBeNull()
    expect(screen.queryByTestId("skeleton")).toBeNull()
  })

  it("con org activa → muestra children y no muestra SeleccionOrganizacion", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: {
        id: "org1",
        nombre: "Mi Organización",
        slug: "mi-organizacion",
      },
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(
      <OrganizacionGate>
        <div data-testid="children">Shell de la app</div>
      </OrganizacionGate>
    )

    expect(screen.getByTestId("children")).toBeDefined()
    expect(screen.queryByTestId("seleccion-organizacion")).toBeNull()
    expect(screen.queryByTestId("skeleton")).toBeNull()
  })
})
