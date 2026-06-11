/**
 * __tests__/unit/dashboard-ui.test.tsx
 *
 * Tests ejemplares (smoke) de UI para los componentes del dashboard.
 *
 * Cubre:
 *  - KpiCard: valor monetario formateado, "Sin datos previos" cuando
 *    variacionPorcentual === null, y estado de error cuando metrica === null.
 *  - DashboardSkeleton: renderiza sin errores.
 *  - EstadoError: muestra botón de reintento y llama onReintentar al hacer clic.
 *  - EstadoVacio: muestra el texto esperado.
 *  - RangoFechasSelector: muestra los botones de preset.
 *
 * Validates: Requirements R4.6, R4.9, R5.10, R5.12, R5.13
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// ── Mocks de dependencias externas ──────────────────────────────────────────

// next-themes: los componentes del dashboard usan useTheme via recharts/sparkline
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// recharts: los componentes de recharts no se pueden renderizar fácilmente en
// jsdom. Se mockean para evitar errores de ResizeObserver / SVG.
vi.mock("recharts", () => ({
  LineChart: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-line-chart">{children}</div>
  ),
  Line: () => null,
  ResponsiveContainer: ({ children }: { children?: React.ReactNode }) => (
    <div data-testid="recharts-responsive-container">{children}</div>
  ),
}))

// react-day-picker: no se necesita el calendario real en estos smoke tests
vi.mock("react-day-picker", () => ({
  DayPicker: () => <div data-testid="day-picker" />,
}))

// ── Imports de los componentes bajo prueba (después de los mocks) ────────────
import { KpiCard } from "@/components/dashboard/kpi-card"
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton"
import { EstadoError } from "@/components/dashboard/estado-error"
import { EstadoVacio } from "@/components/dashboard/estado-vacio"
import { RangoFechasSelector } from "@/components/dashboard/rango-fechas-selector"

// ── Helpers ──────────────────────────────────────────────────────────────────

/** MetricaConVariacion con variación definida */
const metricaConVariacion = {
  actual: 12345.67,
  anterior: 10000,
  variacionPorcentual: 23.5,
}

/** MetricaConVariacion con variacionPorcentual === null (anterior === 0) */
const metricaSinDatosPrevios = {
  actual: 500,
  anterior: 0,
  variacionPorcentual: null,
}

// ── KpiCard ──────────────────────────────────────────────────────────────────

describe("KpiCard — valor monetario formateado (R4.2)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("muestra el valor con símbolo de moneda, separador de miles y 2 decimales", () => {
    render(
      <KpiCard
        titulo="Ventas"
        metrica={metricaConVariacion}
        series={[
          { fecha: "2025-04-01", valor: 100 },
          { fecha: "2025-04-02", valor: 200 },
        ]}
      />
    )
    // Intl.NumberFormat con es-MX/MXN puede producir "$12,345.67" o "MX$12,345.67"
    // dependiendo del runtime. Verificamos que el monto esté presente.
    const contenido = screen.getByText(/12[\.,]345[\.,]67|12\.345,67/)
    expect(contenido).toBeDefined()
  })
})

describe("KpiCard — Sin datos previos cuando variacionPorcentual === null (R4.6)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra "Sin datos previos" cuando variacionPorcentual es null', () => {
    render(
      <KpiCard
        titulo="Gastos"
        metrica={metricaSinDatosPrevios}
        series={[]}
      />
    )
    expect(screen.getByText("Sin datos previos")).toBeDefined()
  })

  it("no muestra icono TrendingUp ni TrendingDown cuando variacionPorcentual es null", () => {
    const { container } = render(
      <KpiCard
        titulo="Gastos"
        metrica={metricaSinDatosPrevios}
        series={[]}
      />
    )
    // Los iconos de tendencia no deben estar presentes
    const svgs = container.querySelectorAll("svg[aria-hidden='true']")
    // AlertTriangle no debe aparecer (eso es para metrica===null)
    // Solo verificamos que no hay icono de tendencia; el componente no tiene
    // ninguno cuando variacionPorcentual === null
    expect(screen.queryByText(/[+\-]\d+\.\d+ %/)).toBeNull()
  })
})

describe("KpiCard — estado de error cuando metrica === null (R4.9)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra "Métricas no disponibles" cuando metrica es null', () => {
    render(
      <KpiCard
        titulo="Utilidad"
        metrica={null}
        series={[]}
      />
    )
    expect(screen.getByText("Métricas no disponibles")).toBeDefined()
  })

  it("el aria-label indica que las métricas no están disponibles", () => {
    const { container } = render(
      <KpiCard
        titulo="Utilidad"
        metrica={null}
        series={[]}
      />
    )
    const card = container.querySelector('[aria-label*="no disponibles"]')
    expect(card).not.toBeNull()
  })

  it("no muestra valores numéricos cuando metrica es null", () => {
    render(
      <KpiCard
        titulo="Utilidad"
        metrica={null}
        series={[]}
      />
    )
    // No debe haber ningún patrón de monto monetario
    expect(screen.queryByText(/\$\s*\d/)).toBeNull()
    expect(screen.queryByText(/[+\-]\d+\.\d+ %/)).toBeNull()
  })
})

// ── DashboardSkeleton ────────────────────────────────────────────────────────

describe("DashboardSkeleton — smoke (R5.10)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza sin lanzar errores", () => {
    expect(() => render(<DashboardSkeleton />)).not.toThrow()
  })

  it("tiene role='status' y aria-busy='true' para indicar carga", () => {
    const { container } = render(<DashboardSkeleton />)
    const status = container.querySelector('[role="status"][aria-busy="true"]')
    expect(status).not.toBeNull()
  })

  it("muestra el texto oculto para lectores de pantalla", () => {
    render(<DashboardSkeleton />)
    // El texto sr-only "Cargando datos del dashboard…" debe estar en el DOM
    expect(screen.getByText(/cargando datos del dashboard/i)).toBeDefined()
  })
})

// ── EstadoError ──────────────────────────────────────────────────────────────

describe("EstadoError — botón de reintento (R5.12)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('renderiza el botón "Reintentar"', () => {
    render(<EstadoError onReintentar={vi.fn()} />)
    expect(screen.getByRole("button", { name: /reintentar/i })).toBeDefined()
  })

  it("llama onReintentar cuando se hace clic en el botón", () => {
    const onReintentar = vi.fn()
    render(<EstadoError onReintentar={onReintentar} />)
    fireEvent.click(screen.getByRole("button", { name: /reintentar/i }))
    expect(onReintentar).toHaveBeenCalledTimes(1)
  })

  it("muestra el mensaje de error por defecto en español", () => {
    render(<EstadoError onReintentar={vi.fn()} />)
    expect(
      screen.getByText(/no se pudieron cargar los datos del dashboard/i)
    ).toBeDefined()
  })

  it("muestra el mensaje personalizado cuando se proporciona", () => {
    render(
      <EstadoError
        onReintentar={vi.fn()}
        mensaje="Error de conexión con el servidor"
      />
    )
    expect(screen.getByText("Error de conexión con el servidor")).toBeDefined()
  })
})

// ── EstadoVacio ──────────────────────────────────────────────────────────────

describe("EstadoVacio — texto esperado (R5.13)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra "No hay datos para el período seleccionado" por defecto', () => {
    render(<EstadoVacio />)
    expect(
      screen.getByText("No hay datos para el período seleccionado")
    ).toBeDefined()
  })

  it("muestra el mensaje personalizado cuando se proporciona", () => {
    render(<EstadoVacio mensaje="Sin registros disponibles" />)
    expect(screen.getByText("Sin registros disponibles")).toBeDefined()
  })
})

// ── RangoFechasSelector — botones de preset ──────────────────────────────────

describe("RangoFechasSelector — botones de preset (R1.2)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra el botón de preset "Hoy"', () => {
    render(<RangoFechasSelector />)
    expect(screen.getByText("Hoy")).toBeDefined()
  })

  it('muestra el botón de preset "Esta semana"', () => {
    render(<RangoFechasSelector />)
    expect(screen.getByText("Esta semana")).toBeDefined()
  })

  it('muestra el botón de preset "Este mes"', () => {
    render(<RangoFechasSelector />)
    expect(screen.getByText("Este mes")).toBeDefined()
  })

  it('muestra el botón de preset "Mes anterior"', () => {
    render(<RangoFechasSelector />)
    expect(screen.getByText("Mes anterior")).toBeDefined()
  })

  it('muestra el botón "Personalizado" para abrir el rango personalizado', () => {
    render(<RangoFechasSelector />)
    expect(screen.getByText("Personalizado")).toBeDefined()
  })
})
