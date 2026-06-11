/**
 * __tests__/unit/login-tema.test.tsx
 *
 * Pruebas ejemplares del LoginScreen rediseñado (Layout_Split, Marca Dego).
 *
 * Renderiza el LoginScreen real (sin mockear react-hook-form ni los
 * componentes de components/ui/) para poder verificar el comportamiento
 * efectivo del formulario y la estructura responsive.
 *
 * Verifica:
 *   1. Render del Layout_Split (contenedor grid lg:grid-cols-2).
 *   2. Presencia del título "Sistema de Inventario".
 *   3. SUBTITULO_LOGIN: 20–160 caracteres y menciona "inventario" y "ventas".
 *   4. Ausencia de control de inicio de sesión con Google / terceros.
 *   5. Una sola columna a <768px (panel de marca hidden/lg:flex y
 *      encabezado compacto lg:hidden — verificado estructuralmente).
 *   6. Conservación de los valores del formulario ante un error de validación.
 *   7. Escaneo del archivo fuente sin literales de color (#hex, rgb(, hsl(,
 *      nombres de color CSS comunes).
 *
 * Validates: Requirements R3.2, R3.3, R3.4, R3.7, R3.8, R4.1
 */

import * as fs from "node:fs"
import * as path from "node:path"

import * as React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import { LoginScreen, SUBTITULO_LOGIN } from "@/components/auth/login-screen"

// ── Ruta del archivo fuente bajo prueba (para el escaneo de literales) ──────
const RUTA_LOGIN = path.resolve(
  process.cwd(),
  "components/auth/login-screen.tsx",
)

// ── Props mínimas ──────────────────────────────────────────────────────────
const loginProps = {
  onCambiarPantalla: vi.fn(),
  onLoginExitoso: vi.fn(),
}

// ── 1. Layout_Split ─────────────────────────────────────────────────────────

describe("LoginScreen — Layout_Split", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza un contenedor grid de 2 columnas en >=lg (lg:grid-cols-2)", () => {
    const { container } = render(<LoginScreen {...loginProps} />)
    const grid = container.querySelector('[class*="lg:grid-cols-2"]')
    expect(grid).not.toBeNull()
    expect(grid?.className).toContain("grid")
  })
})

// ── 2. Título "Sistema de Inventario" ───────────────────────────────────────

describe("LoginScreen — título de marca", () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra el título "Sistema de Inventario"', () => {
    render(<LoginScreen {...loginProps} />)
    // Aparece tanto en el panel de marca (>=lg) como en el encabezado compacto
    expect(screen.getAllByText("Sistema de Inventario").length).toBeGreaterThan(0)
  })
})

// ── 3. SUBTITULO_LOGIN ──────────────────────────────────────────────────────

describe("LoginScreen — subtítulo profesional", () => {
  it("tiene una longitud entre 20 y 160 caracteres", () => {
    expect(SUBTITULO_LOGIN.length).toBeGreaterThanOrEqual(20)
    expect(SUBTITULO_LOGIN.length).toBeLessThanOrEqual(160)
  })

  it('menciona "inventario" y "ventas"', () => {
    expect(SUBTITULO_LOGIN.toLowerCase()).toContain("inventario")
    expect(SUBTITULO_LOGIN.toLowerCase()).toContain("ventas")
  })

  it("se renderiza visible en la pantalla", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.getAllByText(SUBTITULO_LOGIN).length).toBeGreaterThan(0)
  })
})

// ── 4. Sin inicio de sesión con Google / terceros ───────────────────────────

describe("LoginScreen — sin proveedores de terceros (R3.4)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("no muestra ningún control que mencione Google", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.queryByText(/google/i)).toBeNull()
  })

  it("no muestra controles de proveedores de terceros comunes", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.queryByText(/facebook|github|microsoft|apple|continuar con/i)).toBeNull()
  })
})

// ── 5. Una sola columna a <768px (estructura responsive) ────────────────────

describe("LoginScreen — disposición responsive (R3.8)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("el panel de marca está oculto en móvil y visible en >=lg (hidden + lg:flex)", () => {
    const { container } = render(<LoginScreen {...loginProps} />)
    const panelMarca = Array.from(container.querySelectorAll("section")).find(
      (s) => s.className.includes("lg:flex"),
    )
    expect(panelMarca).toBeDefined()
    expect(panelMarca?.className).toContain("hidden")
    expect(panelMarca?.className).toContain("lg:flex")
  })

  it("incluye un encabezado compacto de marca visible solo en móvil (lg:hidden)", () => {
    const { container } = render(<LoginScreen {...loginProps} />)
    const encabezadoCompacto = container.querySelector('[class*="lg:hidden"]')
    expect(encabezadoCompacto).not.toBeNull()
  })

  it("mantiene visibles título, subtítulo y formulario", () => {
    render(<LoginScreen {...loginProps} />)
    expect(screen.getAllByText("Sistema de Inventario").length).toBeGreaterThan(0)
    expect(screen.getAllByText(SUBTITULO_LOGIN).length).toBeGreaterThan(0)
    expect(screen.getByLabelText("Correo electrónico")).toBeDefined()
    expect(screen.getByLabelText("Contraseña")).toBeDefined()
    expect(screen.getByRole("button", { name: /iniciar sesión/i })).toBeDefined()
  })
})

// ── 6. Conservación de valores del formulario ante error de validación ──────

describe("LoginScreen — conserva valores ante error de validación (R3.7)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("mantiene el correo ingresado y muestra un error tras enviar un correo inválido", async () => {
    const user = userEvent.setup()
    const onLoginExitoso = vi.fn()
    render(
      <LoginScreen onCambiarPantalla={vi.fn()} onLoginExitoso={onLoginExitoso} />,
    )

    const correo = screen.getByLabelText("Correo electrónico") as HTMLInputElement
    const contrasena = screen.getByLabelText("Contraseña") as HTMLInputElement

    await user.type(correo, "correo-invalido")
    await user.type(contrasena, "secreto123")
    await user.click(screen.getByRole("button", { name: /iniciar sesión/i }))

    // Aparece un mensaje de validación asociado al campo
    await waitFor(() => {
      const mensajes = document.querySelectorAll('[data-slot="form-message"]')
      expect(mensajes.length).toBeGreaterThan(0)
    })

    // El correo marca aria-invalid y conserva el valor previamente ingresado
    expect(correo.getAttribute("aria-invalid")).toBe("true")
    expect(correo.value).toBe("correo-invalido")
    expect(contrasena.value).toBe("secreto123")

    // No se procesa el login con datos inválidos
    expect(onLoginExitoso).not.toHaveBeenCalled()
  })
})

// ── 7. Escaneo del archivo fuente sin literales de color (R4.1) ─────────────

describe("LoginScreen — sin literales de color en el archivo fuente (R4.1)", () => {
  const fuente = fs.readFileSync(RUTA_LOGIN, "utf8")

  it("no contiene valores hexadecimales de color (#rgb / #rrggbb / #rrggbbaa)", () => {
    expect(/#[0-9a-fA-F]{3,8}\b/.test(fuente)).toBe(false)
  })

  it("no contiene funciones de color rgb()/rgba()", () => {
    expect(/\brgba?\s*\(/i.test(fuente)).toBe(false)
  })

  it("no contiene funciones de color hsl()/hsla() ni oklch()", () => {
    expect(/\b(hsla?|oklch|oklab|lab|lch)\s*\(/i.test(fuente)).toBe(false)
  })

  it("no contiene nombres de color CSS comunes como literales", () => {
    const nombresColor =
      /\b(red|orange|yellow|green|blue|purple|pink|brown|black|white|gray|grey|cyan|magenta|violet|indigo|teal|lime|navy|maroon|olive|silver|gold|crimson|fuchsia|aqua)\b/i
    expect(nombresColor.test(fuente)).toBe(false)
  })
})
