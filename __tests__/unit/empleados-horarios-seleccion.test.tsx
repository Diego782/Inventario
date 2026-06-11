/**
 * __tests__/unit/empleados-horarios-seleccion.test.tsx
 *
 * Pruebas ejemplares de:
 *   - EmpleadosSection: muestra miembros reales desde /api/organizaciones/{id}/miembros
 *   - HorariosSection:  muestra horarios reales desde /api/organizaciones/{id}/horarios
 *   - SeleccionOrganizacion: lista orgs del hook y llama seleccionar() al hacer clic
 *
 * Validates: Requirements R7.1, R14.6, R14.7
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

// ── Mocks de hooks ──────────────────────────────────────────────────────────

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: vi.fn(),
}))

vi.mock("@/hooks/use-permisos", () => ({
  usePermisos: vi.fn(),
}))

// Mock del diálogo de asignación de horario para evitar dependencias pesadas
vi.mock("@/components/horarios/asignar-horario-dialog", () => ({
  AsignarHorarioDialog: () => (
    <div data-testid="asignar-horario-dialog" />
  ),
}))

// Mock del diálogo de creación de organización
vi.mock("@/components/organizaciones/crear-organizacion-dialog", () => ({
  CrearOrganizacionDialog: () => (
    <div data-testid="crear-organizacion-dialog" />
  ),
}))

// Mocks de sub-componentes de UsuariosSection para evitar dependencias pesadas
vi.mock("@/components/usuarios/miembros-table", () => ({
  MiembrosTable: () => <div data-testid="miembros-table" />,
}))
vi.mock("@/components/usuarios/roles-table", () => ({
  RolesTable: () => <div data-testid="roles-table" />,
}))
vi.mock("@/components/usuarios/invitaciones-table", () => ({
  InvitacionesTable: () => <div data-testid="invitaciones-table" />,
}))
vi.mock("@/components/usuarios/invitar-miembro-dialog", () => ({
  InvitarMiembroDialog: () => <div data-testid="invitar-miembro-dialog" />,
}))

import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { usePermisos } from "@/hooks/use-permisos"
import { UsuariosSection as EmpleadosSection } from "@/components/sections/usuarios-section"
import { HorariosSection } from "@/components/sections/horarios-section"
import { SeleccionOrganizacion } from "@/components/organizaciones/seleccion-organizacion"

const mockUseOrganizacionActiva = useOrganizacionActiva as ReturnType<typeof vi.fn>
const mockUsePermisos = usePermisos as ReturnType<typeof vi.fn>

// ── Datos de prueba ─────────────────────────────────────────────────────────

const ORG = { id: "org-1", nombre: "Tienda Norte", slug: "tienda-norte", creado_por: "u1", creado_en: "2024-01-01T00:00:00.000Z", actualizado_en: "2024-01-01T00:00:00.000Z" }

const MIEMBROS = [
  {
    id: "mem-1",
    usuario: { id: "u1", correo: "ana@ejemplo.com", nombre: "Ana García" },
    rol: "Propietario",
    estado: "activa",
    creado_en: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "mem-2",
    usuario: { id: "u2", correo: "bob@ejemplo.com", nombre: "Bob López" },
    rol: "Empleado",
    estado: "activa",
    creado_en: "2024-01-02T00:00:00.000Z",
  },
]

const HORARIOS = [
  {
    id: "hor-1",
    membresia_id: "mem-1",
    dia: 0,
    hora_inicio: "09:00",
    hora_fin: "17:00",
    tipo: "normal",
    creado_en: "2024-01-01T00:00:00.000Z",
  },
  {
    id: "hor-2",
    membresia_id: "mem-2",
    dia: 1,
    hora_inicio: null,
    hora_fin: null,
    tipo: "vacaciones",
    creado_en: "2024-01-02T00:00:00.000Z",
  },
]

const ORGS_CON_ROL = [
  { ...ORG, rol: "Propietario" },
  {
    id: "org-2",
    nombre: "Sucursal Sur",
    slug: "sucursal-sur",
    creado_por: "u1",
    creado_en: "2024-01-01T00:00:00.000Z",
    actualizado_en: "2024-01-01T00:00:00.000Z",
    rol: "Empleado",
  },
]

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Configura fetch global para responder a las URLs de la org activa */
function mockFetch(
  horariosData: unknown = HORARIOS,
  miembrosData: unknown = MIEMBROS
) {
  const fetchMock = vi.fn((url: string) => {
    if (url.includes("/miembros")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(miembrosData),
      })
    }
    if (url.includes("/horarios")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(horariosData),
      })
    }
    return Promise.resolve({ ok: false, json: () => Promise.resolve({}) })
  })
  vi.stubGlobal("fetch", fetchMock)
  return fetchMock
}

// ── EmpleadosSection ────────────────────────────────────────────────────────

describe("EmpleadosSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePermisos.mockReturnValue({
      permisos: [],
      cargando: false,
      puede: () => false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sin organización activa no realiza fetch y no muestra miembros", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    const fetchMock = mockFetch()

    render(<EmpleadosSection />)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.queryByText("Ana García")).toBeNull()
  })

  it("con organización activa hace fetch a /api/organizaciones/{id}/miembros", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    const fetchMock = mockFetch()

    render(<EmpleadosSection />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/organizaciones/${ORG.id}/miembros`,
        expect.objectContaining({ credentials: "include" })
      )
    })
  })

  it("muestra los nombres reales de los miembros tras cargar", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<EmpleadosSection />)

    await waitFor(() => {
      expect(screen.getByText("Ana García")).toBeDefined()
      expect(screen.getByText("Bob López")).toBeDefined()
    })
  })

  it("muestra el correo de cada miembro", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<EmpleadosSection />)

    await waitFor(() => {
      expect(screen.getAllByText("ana@ejemplo.com").length).toBeGreaterThan(0)
      expect(screen.getAllByText("bob@ejemplo.com").length).toBeGreaterThan(0)
    })
  })

  it("muestra el rol de cada miembro", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<EmpleadosSection />)

    await waitFor(() => {
      expect(screen.getByText("Propietario")).toBeDefined()
      expect(screen.getByText("Empleado")).toBeDefined()
    })
  })

  it("muestra mensaje de error cuando el fetch falla", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({ error: { mensaje: "Error de servidor" } }),
        })
      )
    )

    render(<EmpleadosSection />)

    await waitFor(() => {
      expect(screen.getByText("Error de servidor")).toBeDefined()
    })
  })
})

// ── HorariosSection ─────────────────────────────────────────────────────────

describe("HorariosSection", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePermisos.mockReturnValue({
      permisos: [],
      cargando: false,
      puede: () => false,
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("sin organización activa muestra mensaje de selección", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<HorariosSection />)

    expect(
      screen.getByText(/selecciona una organización/i)
    ).toBeDefined()
  })

  it("con organización activa hace fetch a /api/organizaciones/{id}/horarios", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    const fetchMock = mockFetch()

    render(<HorariosSection />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/organizaciones/${ORG.id}/horarios`,
        expect.objectContaining({ credentials: "include" })
      )
    })
  })

  it("también hace fetch a /api/organizaciones/{id}/miembros para resolver nombres", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    const fetchMock = mockFetch()

    render(<HorariosSection />)

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        `/api/organizaciones/${ORG.id}/miembros`,
        expect.objectContaining({ credentials: "include" })
      )
    })
  })

  it("muestra los horarios reales con el nombre del miembro resuelto", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<HorariosSection />)

    await waitFor(() => {
      // El nombre del miembro se resuelve desde el mapa membresia_id → nombre
      expect(screen.getByText("Ana García")).toBeDefined()
    })
  })

  it("muestra el tipo de horario con badge", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<HorariosSection />)

    await waitFor(() => {
      expect(screen.getByText("Normal")).toBeDefined()
      expect(screen.getByText("Vacaciones")).toBeDefined()
    })
  })

  it("muestra las horas de inicio y fin cuando están definidas", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<HorariosSection />)

    await waitFor(() => {
      expect(screen.getByText("09:00")).toBeDefined()
      expect(screen.getByText("17:00")).toBeDefined()
    })
  })

  it("muestra '—' cuando hora_inicio o hora_fin son null", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    mockFetch()

    render(<HorariosSection />)

    await waitFor(() => {
      // El horario de vacaciones tiene hora_inicio y hora_fin null → "—"
      const dashes = screen.getAllByText("—")
      expect(dashes.length).toBeGreaterThanOrEqual(2)
    })
  })

  it("muestra mensaje de error cuando el fetch de horarios falla", async () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: ORG,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          json: () => Promise.resolve({}),
        })
      )
    )

    render(<HorariosSection />)

    await waitFor(() => {
      expect(screen.getByText(/no se pudieron cargar los horarios/i)).toBeDefined()
    })
  })
})

// ── SeleccionOrganizacion ───────────────────────────────────────────────────

describe("SeleccionOrganizacion", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUsePermisos.mockReturnValue({
      permisos: [],
      cargando: false,
      puede: () => false,
    })
  })

  it("muestra la lista de organizaciones del hook", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: ORGS_CON_ROL,
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    expect(screen.getByText("Tienda Norte")).toBeDefined()
    expect(screen.getByText("Sucursal Sur")).toBeDefined()
  })

  it("muestra el rol de cada organización", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: ORGS_CON_ROL,
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    // Ambos roles deben aparecer como badges
    expect(screen.getByText("Propietario")).toBeDefined()
    expect(screen.getByText("Empleado")).toBeDefined()
  })

  it("llama a seleccionar() con el id correcto al hacer clic en Seleccionar", async () => {
    const seleccionar = vi.fn().mockResolvedValue(undefined)
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: ORGS_CON_ROL,
      cargando: false,
      error: null,
      seleccionar,
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    const botones = screen.getAllByRole("button", { name: /seleccionar/i })
    // El primer botón corresponde a "Tienda Norte" (org-1)
    await userEvent.click(botones[0])

    await waitFor(() => {
      expect(seleccionar).toHaveBeenCalledWith("org-1")
    })
  })

  it("llama a seleccionar() con el id de la segunda org al hacer clic en su botón", async () => {
    const seleccionar = vi.fn().mockResolvedValue(undefined)
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: ORGS_CON_ROL,
      cargando: false,
      error: null,
      seleccionar,
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    const botones = screen.getAllByRole("button", { name: /seleccionar/i })
    await userEvent.click(botones[1])

    await waitFor(() => {
      expect(seleccionar).toHaveBeenCalledWith("org-2")
    })
  })

  it("muestra mensaje cuando no hay organizaciones", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: false,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    expect(
      screen.getByText(/no perteneces a ninguna organización/i)
    ).toBeDefined()
  })

  it("muestra skeletons mientras carga", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: true,
      error: null,
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    // No debe mostrar ninguna org ni el botón "Crear organización"
    expect(screen.queryByText("Tienda Norte")).toBeNull()
    expect(screen.queryByRole("button", { name: /crear organización/i })).toBeNull()
  })

  it("muestra error y botón Reintentar cuando falla la carga", () => {
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: false,
      error: "No se pudieron cargar las organizaciones",
      seleccionar: vi.fn(),
      recargar: vi.fn(),
    })

    render(<SeleccionOrganizacion />)

    // El Alert renderiza el texto en AlertTitle y en AlertDescription → usamos getAllByText
    const matches = screen.getAllByText(/no se pudieron cargar las organizaciones/i)
    expect(matches.length).toBeGreaterThan(0)
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeDefined()
  })

  it("llama a recargar() al hacer clic en Reintentar", async () => {
    const recargar = vi.fn().mockResolvedValue(undefined)
    mockUseOrganizacionActiva.mockReturnValue({
      organizacion: null,
      organizaciones: [],
      cargando: false,
      error: "Error de red",
      seleccionar: vi.fn(),
      recargar,
    })

    render(<SeleccionOrganizacion />)

    await userEvent.click(screen.getByRole("button", { name: /reintentar/i }))

    expect(recargar).toHaveBeenCalledOnce()
  })
})
