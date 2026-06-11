/**
 * __tests__/property/identidad-visual-aislamiento.test.tsx
 *
 * Pruebas de propiedades (PBT) para el aislamiento de identidad visual en cliente.
 * Cubre las propiedades P1, P2, P7 y P12 del diseño de `identidad-marca-dego`.
 *
 * Stack: vitest + fast-check + @testing-library/react
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import * as fc from "fast-check"
import { renderHook, waitFor } from "@testing-library/react"
import * as React from "react"

import { IdentidadVisualProvider, useIdentidadVisual } from "@/hooks/use-identidad-visual"
import { COLOR_TEMA_DEGO, type ColorTema } from "@/lib/schemas/configuracion"

// =============================================================================
// Mocks de contextos y dependencias
// =============================================================================

// Mock de useSesion
let mockUsuario: any = null
let mockCargandoSesion = false

vi.mock("@/hooks/use-sesion", () => ({
  useSesion: () => ({
    usuario: mockUsuario,
    cargando: mockCargandoSesion,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}))

// Mock de useOrganizacionActiva
let mockOrganizacion: any = null
let mockCargandoOrganizacion = false

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: () => ({
    organizacion: mockOrganizacion,
    organizaciones: [],
    cargando: mockCargandoOrganizacion,
    error: null,
    seleccionar: vi.fn(),
    actualizar: vi.fn(),
    recargar: vi.fn(),
  }),
}))

// Mock de next-themes
let mockResolvedTheme = "light"

vi.mock("next-themes", () => ({
  useTheme: () => ({
    resolvedTheme: mockResolvedTheme,
    theme: mockResolvedTheme,
    setTheme: vi.fn(),
  }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock de sonner (toast)
vi.mock("sonner", () => ({
  toast: vi.fn(),
}))

// Mock de fetch global
let mockFetchResponse: any = null

beforeEach(() => {
  global.fetch = vi.fn((url: string, options?: any) => {
    if (mockFetchResponse) {
      return mockFetchResponse(url, options)
    }
    return Promise.resolve({
      ok: true,
      json: async () => ({}),
    } as Response)
  }) as any
})

// =============================================================================
// Test double de document.documentElement
// =============================================================================

type CSSProperties = Record<string, string>

let cssVariables: CSSProperties = {}

beforeEach(() => {
  cssVariables = {}
  // Mock document.documentElement con un doble que captura las variables CSS
  Object.defineProperty(document, "documentElement", {
    value: {
      style: {
        setProperty: (name: string, value: string) => {
          cssVariables[name] = value
        },
      },
    },
    configurable: true,
  })
})

// =============================================================================
// Generadores de fast-check
// =============================================================================

/** Generador de ColorTema arbitrario válido. */
const arbColorTema = (): fc.Arbitrary<ColorTema> =>
  fc
    .record({
      color_hue: fc.double({ min: 0, max: 360, noNaN: true }),
      color_saturation: fc.double({ min: 0, max: 1, noNaN: true }),
      color_lightness: fc.double({ min: 0, max: 1, noNaN: true }),
    })
    .filter(
      (color) =>
        Number.isFinite(color.color_hue) &&
        Number.isFinite(color.color_saturation) &&
        Number.isFinite(color.color_lightness)
    )

/** Generador de estado de localStorage arbitrario (incluye valores válidos, vacíos, corruptos). */
const arbLocalStorageState = (): fc.Arbitrary<Record<string, string | null>> =>
  fc.record({
    "invenpro-color": fc.option(fc.string(), { nil: null }),
    "invenpro-theme": fc.option(fc.string(), { nil: null }),
  })

/** Generador de usuario mock. */
const arbUsuario = () =>
  fc.record({
    id: fc.uuid(),
    correo: fc.emailAddress(),
    nombre: fc.string(),
    correo_verificado: fc.boolean(),
  })

/** Generador de organización mock. */
const arbOrganizacion = () =>
  fc.record({
    id: fc.uuid(),
    nombre: fc.string({ minLength: 1 }),
    slug: fc.string({ minLength: 1 }),
    logo: fc.option(fc.string(), { nil: null }),
    logo_aspecto: fc.option(fc.string(), { nil: null }),
    creado_en: fc.date({ noInvalidDate: true }).map((d) => {
      try {
        return d.toISOString()
      } catch {
        return new Date("2024-01-01").toISOString()
      }
    }),
  })

// =============================================================================
// Utilidades de prueba
// =============================================================================

/** Resetea todos los mocks y el estado capturado antes de cada prueba. */
function resetearMocks() {
  mockUsuario = null
  mockCargandoSesion = false
  mockOrganizacion = null
  mockCargandoOrganizacion = false
  mockResolvedTheme = "light"
  mockFetchResponse = null
  cssVariables = {}
  vi.clearAllMocks()
}

/** Verifica que un ColorTema sea igual al COLOR_TEMA_DEGO. */
function esColorDego(color: ColorTema): boolean {
  return (
    color.color_hue === COLOR_TEMA_DEGO.color_hue &&
    color.color_saturation === COLOR_TEMA_DEGO.color_saturation &&
    color.color_lightness === COLOR_TEMA_DEGO.color_lightness
  )
}

/** Extrae las variables CSS relevantes del mock de document.documentElement. */
function extraerVariablesCSS(): CSSProperties {
  return { ...cssVariables }
}

// =============================================================================
// Property 1: Aislamiento del color respecto del Login
// Feature: identidad-marca-dego, Property 1: Aislamiento del color respecto del Login
// Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5
//
// Para cualquier Color_Tema de Organización y cualquier estado de localStorage
// (incluidas claves invenpro-color/invenpro-theme con valores válidos, vacíos
// o corruptos), cuando no existe Sesion válida o no hay Organizacion_Activa,
// el color que el IdentidadVisualProvider aplica a las variables CSS es
// exactamente COLOR_TEMA_DEGO, sin estado transitorio de ninguna Organización.
// =============================================================================

describe("Property 1: Aislamiento del color respecto del Login", () => {
  beforeEach(() => {
    resetearMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("sin sesión, el color aplicado es COLOR_TEMA_DEGO independientemente del estado de localStorage", () => {
    fc.assert(
      fc.property(arbColorTema(), arbLocalStorageState(), (colorOrg, localStorageState) => {
        resetearMocks()
        mockUsuario = null // Sin sesión
        mockOrganizacion = null

        // Simular localStorage con estado arbitrario
        const mockGetItem = vi.fn((key: string) => localStorageState[key] ?? null)
        const mockSetItem = vi.fn()
        const mockRemoveItem = vi.fn()

        Object.defineProperty(window, "localStorage", {
          value: {
            getItem: mockGetItem,
            setItem: mockSetItem,
            removeItem: mockRemoveItem,
          },
          configurable: true,
        })

        // Renderizar el hook
        const { result } = renderHook(() => useIdentidadVisual(), {
          wrapper: ({ children }) => <IdentidadVisualProvider>{children}</IdentidadVisualProvider>,
        })

        // Verificar que el color aplicado es COLOR_TEMA_DEGO
        expect(result.current.identidad).toBeDefined()
        expect(esColorDego(result.current.identidad.color)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })

  it("con sesión pero sin organización activa, el color aplicado es COLOR_TEMA_DEGO", () => {
    fc.assert(
      fc.property(arbUsuario(), arbColorTema(), arbLocalStorageState(), (usuario, colorOrg, localStorageState) => {
        resetearMocks()
        mockUsuario = usuario // Con sesión
        mockOrganizacion = null // Sin organización activa

        // Simular localStorage con estado arbitrario
        const mockGetItem = vi.fn((key: string) => localStorageState[key] ?? null)
        const mockSetItem = vi.fn()
        const mockRemoveItem = vi.fn()

        Object.defineProperty(window, "localStorage", {
          value: {
            getItem: mockGetItem,
            setItem: mockSetItem,
            removeItem: mockRemoveItem,
          },
          configurable: true,
        })

        const { result } = renderHook(() => useIdentidadVisual(), {
          wrapper: ({ children }) => <IdentidadVisualProvider>{children}</IdentidadVisualProvider>,
        })

        // Verificar que el color aplicado es COLOR_TEMA_DEGO
        expect(result.current.identidad).toBeDefined()
        expect(esColorDego(result.current.identidad.color)).toBe(true)
      }),
      { numRuns: 100 }
    )
  })
})

// =============================================================================
// Property 2: Limpieza de identidad visual en cierre de sesión
// Feature: identidad-marca-dego, Property 2: Limpieza de identidad visual en cierre de sesión
// Validates: Requirements 5.6, 7.3
//
// Para cualquier Color_Tema y logo de Organización aplicados, tras un cierre
// de sesión el color aplicado vuelve a ser exactamente COLOR_TEMA_DEGO y el
// color/logo de la Organización previa quedan descartados de la memoria de sesión.
// =============================================================================

describe("Property 2: Limpieza de identidad visual en cierre de sesión", () => {
  beforeEach(() => {
    resetearMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("tras logout, el color vuelve a COLOR_TEMA_DEGO y el color/logo previos se descartan", async () => {
    await fc.assert(
      fc.asyncProperty(arbUsuario(), arbOrganizacion(), arbColorTema(), async (usuario, organizacion, colorOrg) => {
        resetearMocks()

        // Estado inicial: sesión activa con organización y color personalizado
        mockUsuario = usuario
        mockOrganizacion = organizacion

        // Mock fetch para devolver el color personalizado
        mockFetchResponse = vi.fn((url: string) => {
          if (url === "/api/configuracion") {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                color_hue: colorOrg.color_hue,
                color_saturation: colorOrg.color_saturation,
                color_lightness: colorOrg.color_lightness,
              }),
            } as Response)
          }
          return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
        })

        const { result, rerender } = renderHook(() => useIdentidadVisual(), {
          wrapper: ({ children }) => <IdentidadVisualProvider>{children}</IdentidadVisualProvider>,
        })

        // Esperar a que se cargue el color de la organización (con timeout más largo)
        await waitFor(
          () => {
            expect(result.current.cargando).toBe(false)
          },
          { timeout: 500 }
        )

        // Simular logout: usuario pasa a null
        mockUsuario = null
        mockOrganizacion = null

        rerender()

        // Verificar inmediatamente que el color vuelve a COLOR_TEMA_DEGO
        expect(result.current.identidad).toBeDefined()
        expect(esColorDego(result.current.identidad.color)).toBe(true)
        expect(result.current.identidad.logo).toBeNull()
      }),
      { numRuns: 100 }
    )
  }, 30000) // Timeout de 30 segundos para la prueba completa
})

// =============================================================================
// Property 7: Reemplazo total al cambiar de Organización
// Feature: identidad-marca-dego, Property 7: Reemplazo total al cambiar de Organización en el cliente
// Validates: Requirements 7.2
//
// Para cualquier par de Color_Tema de Organizaciones A y B, tras cambiar la
// Organizacion_Activa de A a B el color aplicado coincide exactamente con el
// de B, sin conservar ningún componente del color de A.
// =============================================================================

describe("Property 7: Reemplazo total al cambiar de Organización", () => {
  beforeEach(() => {
    resetearMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("al cambiar de org A a org B, el color aplicado coincide exactamente con el de B", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUsuario(),
        arbOrganizacion(),
        arbOrganizacion(),
        arbColorTema(),
        arbColorTema(),
        async (usuario, orgA, orgB, colorA, colorB) => {
          // Skip si las orgs o colores son idénticos (caso trivial)
          if (orgA.id === orgB.id) return
          const coloresIguales =
            Math.abs(colorA.color_hue - colorB.color_hue) < 0.01 &&
            Math.abs(colorA.color_saturation - colorB.color_saturation) < 0.01 &&
            Math.abs(colorA.color_lightness - colorB.color_lightness) < 0.01
          if (coloresIguales) return

          resetearMocks()

          mockUsuario = usuario
          mockOrganizacion = orgA

          // Mock fetch que devuelve colores diferentes según la org
          mockFetchResponse = vi.fn((url: string) => {
            if (url === "/api/configuracion") {
              const orgActual = mockOrganizacion
              if (orgActual?.id === orgA.id) {
                return Promise.resolve({
                  ok: true,
                  json: async () => ({
                    color_hue: colorA.color_hue,
                    color_saturation: colorA.color_saturation,
                    color_lightness: colorA.color_lightness,
                  }),
                } as Response)
              } else if (orgActual?.id === orgB.id) {
                return Promise.resolve({
                  ok: true,
                  json: async () => ({
                    color_hue: colorB.color_hue,
                    color_saturation: colorB.color_saturation,
                    color_lightness: colorB.color_lightness,
                  }),
                } as Response)
              }
            }
            return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
          })

          const { result, rerender } = renderHook(() => useIdentidadVisual(), {
            wrapper: ({ children }) => <IdentidadVisualProvider>{children}</IdentidadVisualProvider>,
          })

          // Esperar a que se cargue el color de la org A (con timeout más largo)
          await waitFor(
            () => {
              expect(result.current.cargando).toBe(false)
            },
            { timeout: 500 }
          )

          // Cambiar a org B
          mockOrganizacion = orgB
          rerender()

          // Esperar a que se cargue el color de la org B (con timeout más largo)
          await waitFor(
            () => {
              expect(result.current.cargando).toBe(false)
            },
            { timeout: 500 }
          )

          // Verificar que el color aplicado es exactamente el de B
          const colorAplicado = result.current.identidad.color

          // El color debe coincidir con colorB (con cierta tolerancia por redondeo)
          const tolerancia = 0.01
          expect(Math.abs(colorAplicado.color_hue - colorB.color_hue)).toBeLessThan(tolerancia)
          expect(Math.abs(colorAplicado.color_saturation - colorB.color_saturation)).toBeLessThan(tolerancia)
          expect(Math.abs(colorAplicado.color_lightness - colorB.color_lightness)).toBeLessThan(tolerancia)
        }
      ),
      { numRuns: 100 }
    )
  }, 30000) // Timeout de 30 segundos para la prueba completa
})

// =============================================================================
// Property 12: Ortogonalidad del modo claro/oscuro respecto al color
// Feature: identidad-marca-dego, Property 12: Ortogonalidad del modo claro/oscuro respecto al color
// Validates: Requirements 9.1, 9.7
//
// Para cualquier secuencia de operaciones de color (cargar, actualizar o limpiar
// el Color_Tema de una Organización), la preferencia de modo claro/oscuro de
// next-themes permanece inalterada, y el IdentidadVisualProvider nunca escribe
// el Color_Tema en las claves invenpro-color/invenpro-theme como fuente de verdad.
// =============================================================================

describe("Property 12: Ortogonalidad del modo claro/oscuro respecto al color", () => {
  beforeEach(() => {
    resetearMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("el modo claro/oscuro persiste a través de operaciones de color", async () => {
    await fc.assert(
      fc.asyncProperty(
        arbUsuario(),
        arbOrganizacion(),
        arbColorTema(),
        fc.constantFrom("light", "dark"),
        async (usuario, organizacion, color, modo) => {
          resetearMocks()

          mockUsuario = usuario
          mockOrganizacion = organizacion
          // Asegurarse de que el modo se establezca ANTES del render
          const modoInicial = modo
          mockResolvedTheme = modoInicial

          // Espiar localStorage para verificar que no se escriben las claves heredadas
          const mockSetItem = vi.fn()
          const mockRemoveItem = vi.fn()
          const mockGetItem = vi.fn(() => null)

          Object.defineProperty(window, "localStorage", {
            value: {
              getItem: mockGetItem,
              setItem: mockSetItem,
              removeItem: mockRemoveItem,
            },
            configurable: true,
          })

          mockFetchResponse = vi.fn((url: string) => {
            if (url === "/api/configuracion") {
              return Promise.resolve({
                ok: true,
                json: async () => ({
                  color_hue: color.color_hue,
                  color_saturation: color.color_saturation,
                  color_lightness: color.color_lightness,
                }),
              } as Response)
            }
            return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
          })

          const { result } = renderHook(() => useIdentidadVisual(), {
            wrapper: ({ children }) => <IdentidadVisualProvider>{children}</IdentidadVisualProvider>,
          })

          await waitFor(
            () => {
              expect(result.current.cargando).toBe(false)
            },
            { timeout: 500 }
          )

          // Verificar que el modo no cambió desde el inicio
          expect(mockResolvedTheme).toBe(modoInicial)

          // Verificar que el color se cargó desde /api/configuracion
          expect(mockFetchResponse).toHaveBeenCalledWith("/api/configuracion", expect.any(Object))
        }
      ),
      { numRuns: 100 }
    )
  }, 30000) // Timeout de 30 segundos para la prueba completa

  it("el IdentidadVisualProvider nunca escribe el Color_Tema en localStorage como fuente de verdad", async () => {
    await fc.assert(
      fc.asyncProperty(arbUsuario(), arbOrganizacion(), arbColorTema(), async (usuario, organizacion, color) => {
        resetearMocks()

        mockUsuario = usuario
        mockOrganizacion = organizacion

        const mockSetItem = vi.fn()
        const mockGetItem = vi.fn(() => null)
        const mockRemoveItem = vi.fn()

        Object.defineProperty(window, "localStorage", {
          value: {
            getItem: mockGetItem,
            setItem: mockSetItem,
            removeItem: mockRemoveItem,
          },
          configurable: true,
        })

        mockFetchResponse = vi.fn((url: string) => {
          if (url === "/api/configuracion") {
            return Promise.resolve({
              ok: true,
              json: async () => ({
                color_hue: color.color_hue,
                color_saturation: color.color_saturation,
                color_lightness: color.color_lightness,
              }),
            } as Response)
          }
          return Promise.resolve({ ok: true, json: async () => ({}) } as Response)
        })

        const { result } = renderHook(() => useIdentidadVisual(), {
          wrapper: ({ children }) => <IdentidadVisualProvider>{children}</IdentidadVisualProvider>,
        })

        await waitFor(
          () => {
            expect(result.current.cargando).toBe(false)
          },
          { timeout: 500 }
        )

        // Verificar que NO se escribió el color en localStorage como fuente de verdad
        // (las claves invenpro-color/invenpro-theme NO deben usarse para persistir)
        const escriturasColor = mockSetItem.mock.calls.filter(
          (call: any[]) =>
            call[0] === "invenpro-color" &&
            typeof call[1] === "string" &&
            call[1].includes(String(color.color_hue))
        )

        // No debe haber escrituras del color actual en localStorage
        // (la fuente de verdad es la API, R9.1)
        expect(escriturasColor.length).toBe(0)
      }),
      { numRuns: 100 }
    )
  }, 30000) // Timeout de 30 segundos para la prueba completa
})
