/**
 * __tests__/unit/accesibilidad-smoke.test.tsx
 *
 * Smoke estático de coherencia de diseño y accesibilidad.
 *
 * Verifica que los componentes de auth:
 *   1. Usan solo componentes de `components/ui/` (Card, Form, Input, Button).
 *   2. No tienen valores hex hardcodeados (#xxx / #xxxxxx) en las clases CSS.
 *   3. Los botones de envío tienen texto accesible visible en español.
 *
 * Validates: Requirements R5.1, R5.5, R17.6
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"

// ── Mocks de dependencias externas ─────────────────────────────────────────

// react-hook-form: formulario funcional mínimo
vi.mock("react-hook-form", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-hook-form")>()
  return {
    ...actual,
    useForm: () => ({
      handleSubmit: (fn: (v: unknown) => void) => (e: React.FormEvent) => {
        e.preventDefault()
        fn({})
      },
      control: {},
      formState: { isSubmitting: false, errors: {} },
      setError: vi.fn(),
      register: vi.fn(),
    }),
  }
})

// zodResolver: no-op en tests
vi.mock("@hookform/resolvers/zod", () => ({
  zodResolver: () => () => ({ values: {}, errors: {} }),
}))

// ── Mocks de componentes shadcn/ui ─────────────────────────────────────────
// Se mockean con data-testid para verificar que los componentes de auth
// los invocan (R5.1: usar exclusivamente componentes de components/ui/).

vi.mock("@/components/ui/card", () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="ui-card" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="ui-card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h1 data-testid="ui-card-title" className={className}>{children}</h1>
  ),
  CardDescription: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <p data-testid="ui-card-description" className={className}>{children}</p>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="ui-card-content" className={className}>{children}</div>
  ),
}))

vi.mock("@/components/ui/form", () => ({
  Form: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ui-form">{children}</div>
  ),
  FormField: ({
    render,
  }: {
    render: (props: { field: Record<string, unknown> }) => React.ReactNode
  }) => (
    <div data-testid="ui-form-field">
      {render({ field: { value: "", onChange: vi.fn(), onBlur: vi.fn(), name: "" } })}
    </div>
  ),
  FormItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ui-form-item">{children}</div>
  ),
  FormLabel: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <label data-testid="ui-form-label" className={className}>{children}</label>
  ),
  FormControl: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="ui-form-control">{children}</div>
  ),
  FormMessage: () => null,
}))

vi.mock("@/components/ui/input", () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input data-testid="ui-input" {...props} />
  ),
}))

vi.mock("@/components/ui/button", () => ({
  Button: ({
    children,
    className,
    type,
    disabled,
    variant,
    onClick,
  }: {
    children: React.ReactNode
    className?: string
    type?: "button" | "submit" | "reset"
    disabled?: boolean
    variant?: string
    onClick?: () => void
  }) => (
    <button
      data-testid="ui-button"
      type={type ?? "button"}
      className={className}
      disabled={disabled}
      data-variant={variant}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}))

// Importar los componentes bajo prueba DESPUÉS de los mocks
import { LoginScreen } from "@/components/auth/login-screen"
import { RegistroScreen } from "@/components/auth/registro-screen"

// ── Helpers ────────────────────────────────────────────────────────────────

/** Extrae todas las clases CSS del HTML renderizado como un string plano */
function obtenerClasesRenderizadas(container: HTMLElement): string {
  const elementos = container.querySelectorAll("[class]")
  return Array.from(elementos)
    .map((el) => el.getAttribute("class") ?? "")
    .join(" ")
}

/** Detecta valores hex de color en un string de clases CSS */
function tieneHexHardcodeado(clases: string): boolean {
  // Detecta #rgb, #rrggbb, #rrggbbaa (3, 4, 6 u 8 dígitos hex)
  return /#[0-9a-fA-F]{3,8}\b/.test(clases)
}

// ── Props mínimas ──────────────────────────────────────────────────────────

const loginProps = {
  onCambiarPantalla: vi.fn(),
  onLoginExitoso: vi.fn(),
}

const registroProps = {
  onCambiarPantalla: vi.fn(),
}

// ── LoginScreen ────────────────────────────────────────────────────────────

describe("LoginScreen — usa componentes de components/ui/", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza al menos un componente Card de shadcn/ui", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.getAllByTestId("ui-card").length).toBeGreaterThan(0)
  })

  it("renderiza el componente Form de shadcn/ui", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.getAllByTestId("ui-form").length).toBeGreaterThan(0)
  })

  it("renderiza al menos un componente Input de shadcn/ui", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.getAllByTestId("ui-input").length).toBeGreaterThan(0)
  })

  it("renderiza al menos un componente Button de shadcn/ui", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.getAllByTestId("ui-button").length).toBeGreaterThan(0)
  })
})

describe("LoginScreen — sin valores hex hardcodeados (R5.2, R5.3)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("no hay valores hex (#xxx) en las clases CSS del output renderizado", () => {
    const { container } = render(<LoginScreen {...loginProps} />)
    const clases = obtenerClasesRenderizadas(container)
    expect(tieneHexHardcodeado(clases)).toBe(false)
  })
})

describe("LoginScreen — accesibilidad del botón de envío (R5.5, R17.6)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('el botón de envío tiene texto visible "Iniciar sesión"', () => {
    render(<LoginScreen {...loginProps} />)
    const botonSubmit = screen.getByRole("button", { name: /iniciar sesión/i })
    expect(botonSubmit).toBeDefined()
  })

  it("el botón de envío es de tipo submit", () => {
    const { container } = render(<LoginScreen {...loginProps} />)
    const botonSubmit = container.querySelector('button[type="submit"]')
    expect(botonSubmit).not.toBeNull()
  })

  it("el botón de envío no tiene aria-hidden", () => {
    const { container } = render(<LoginScreen {...loginProps} />)
    const botonSubmit = container.querySelector('button[type="submit"]')
    expect(botonSubmit?.getAttribute("aria-hidden")).not.toBe("true")
  })
})

// ── RegistroScreen ─────────────────────────────────────────────────────────

describe("RegistroScreen — usa componentes de components/ui/", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza al menos un componente Card de shadcn/ui", () => {
    render(<RegistroScreen {...registroProps} />)
    expect(screen.getAllByTestId("ui-card").length).toBeGreaterThan(0)
  })

  it("renderiza el componente Form de shadcn/ui", () => {
    render(<RegistroScreen {...registroProps} />)
    expect(screen.getAllByTestId("ui-form").length).toBeGreaterThan(0)
  })

  it("renderiza al menos un componente Input de shadcn/ui", () => {
    render(<RegistroScreen {...registroProps} />)
    expect(screen.getAllByTestId("ui-input").length).toBeGreaterThan(0)
  })

  it("renderiza al menos un componente Button de shadcn/ui", () => {
    render(<RegistroScreen {...registroProps} />)
    expect(screen.getAllByTestId("ui-button").length).toBeGreaterThan(0)
  })
})

describe("RegistroScreen — sin valores hex hardcodeados (R5.2, R5.3)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("no hay valores hex (#xxx) en las clases CSS del output renderizado", () => {
    const { container } = render(<RegistroScreen {...registroProps} />)
    const clases = obtenerClasesRenderizadas(container)
    expect(tieneHexHardcodeado(clases)).toBe(false)
  })
})

describe("RegistroScreen — accesibilidad del botón de envío (R5.5, R17.6)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('el botón de envío tiene texto visible "Crear cuenta"', () => {
    render(<RegistroScreen {...registroProps} />)
    const botonSubmit = screen.getByRole("button", { name: /crear cuenta/i })
    expect(botonSubmit).toBeDefined()
  })

  it("el botón de envío es de tipo submit", () => {
    const { container } = render(<RegistroScreen {...registroProps} />)
    const botonSubmit = container.querySelector('button[type="submit"]')
    expect(botonSubmit).not.toBeNull()
  })

  it("el botón de envío no tiene aria-hidden", () => {
    const { container } = render(<RegistroScreen {...registroProps} />)
    const botonSubmit = container.querySelector('button[type="submit"]')
    expect(botonSubmit?.getAttribute("aria-hidden")).not.toBe("true")
  })

  it("los campos de entrada tienen etiquetas asociadas (FormLabel visible)", () => {
    render(<RegistroScreen {...registroProps} />)
    // Verifica que hay etiquetas de formulario visibles en español
    expect(screen.getByText("Correo electrónico")).toBeDefined()
    expect(screen.getByText("Nombre")).toBeDefined()
    expect(screen.getByText("Contraseña")).toBeDefined()
  })
})
