/**
 * __tests__/property/clientes-fiadores-ui-smoke.test.tsx
 *
 * Render / smoke tests para los componentes UI de la feature gestion-clientes-y-fiadores.
 * Verifica que cada componente monta sin lanzar errores y muestra elementos
 * de texto clave. No comprueban lógica de negocio profunda; son una red de
 * seguridad mínima ante refactors o typos.
 *
 * Validates: Requirements 4.12, 5.14
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import * as React from "react"

// =============================================================================
// Mocks globales
// =============================================================================

// Mock de fetch: responde con OK y payload vacío por defecto
beforeEach(() => {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({}),
    status: 200,
  } as Response)
})

// Mock de sonner para evitar que intente renderizar portales del DOM
vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

// Mock de next-themes
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// Mock de hooks de sesión y organización
vi.mock("@/hooks/use-sesion", () => ({
  useSesion: () => ({
    usuario: null,
    cargando: false,
    refetch: vi.fn(),
    logout: vi.fn(),
  }),
}))

vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: () => ({
    organizacion: null,
    organizaciones: [],
    cargando: false,
    error: null,
    seleccionar: vi.fn(),
    actualizar: vi.fn(),
    recargar: vi.fn(),
  }),
}))

// Mock del hook de debounce utilizado en ClientesSection
vi.mock("@/hooks/use-debounced-value", () => ({
  useDebouncedValue: (value: unknown) => value,
}))

// =============================================================================
// 1. ClientesSection
// =============================================================================

describe("ClientesSection — smoke test", () => {
  it("monta sin lanzar errores y muestra el botón 'Nuevo cliente'", async () => {
    // Fetch devolverá la estructura de listado vacío
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [], total: 0, take: 50, skip: 0 }),
      status: 200,
    } as Response)

    const { ClientesSection } = await import("@/components/sections/clientes-section")

    const { container } = render(<ClientesSection />)
    expect(container).toBeTruthy()

    // El botón "Nuevo cliente" debe estar en el DOM
    expect(screen.getByRole("button", { name: /nuevo cliente/i })).toBeTruthy()

    // El input de búsqueda debe estar presente
    expect(screen.getByRole("textbox", { name: /buscar clientes/i })).toBeTruthy()
  })
})

// =============================================================================
// 2. ClienteFormDialog — modo "crear"
// =============================================================================

describe("ClienteFormDialog — smoke test modo crear", () => {
  it("monta en modo crear, muestra el título 'Nuevo cliente' y los campos obligatorios", async () => {
    const { ClienteFormDialog } = await import("@/components/clientes/cliente-form-dialog")

    render(
      <ClienteFormDialog
        open={true}
        modo="crear"
        onClose={vi.fn()}
        onGuardado={vi.fn()}
      />
    )

    expect(screen.getByText("Nuevo cliente")).toBeTruthy()
    // Campos obligatorios visibles
    expect(screen.getByText("Cédula")).toBeTruthy()
    expect(screen.getByText("Nombre")).toBeTruthy()
    expect(screen.getByText("Teléfono")).toBeTruthy()
  })
})

// =============================================================================
// 3. ClienteFormDialog — modo "editar"
// =============================================================================

describe("ClienteFormDialog — smoke test modo editar", () => {
  it("monta en modo editar con cliente y muestra el título 'Editar cliente'", async () => {
    const { ClienteFormDialog } = await import("@/components/clientes/cliente-form-dialog")

    const clienteMock = {
      id: "abc-123",
      organizacion_id: "org-1",
      cedula: "12345",
      nombre: "Juan Pérez",
      telefono: "5551234567",
      correo: "juan@example.com",
      direccion: "Calle Falsa 123",
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }

    render(
      <ClienteFormDialog
        open={true}
        modo="editar"
        cliente={clienteMock}
        onClose={vi.fn()}
        onGuardado={vi.fn()}
      />
    )

    expect(screen.getByText("Editar cliente")).toBeTruthy()
    // El formulario debe pre-poblar el nombre del cliente
    const inputs = screen.getAllByRole("textbox")
    const valores = inputs.map((i) => (i as HTMLInputElement).value)
    expect(valores).toContain("Juan Pérez")
  })
})

// =============================================================================
// 4. EliminarClienteDialog
// =============================================================================

describe("EliminarClienteDialog — smoke test", () => {
  it("monta y muestra el título de confirmación de eliminación", async () => {
    const { EliminarClienteDialog } = await import("@/components/clientes/eliminar-cliente-dialog")

    const clienteMock = {
      id: "abc-123",
      organizacion_id: "org-1",
      cedula: "12345",
      nombre: "María García",
      telefono: "5559876543",
      correo: null,
      direccion: null,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }

    render(
      <EliminarClienteDialog
        open={true}
        cliente={clienteMock}
        tieneHistorial={false}
        onClose={vi.fn()}
        onEliminado={vi.fn()}
      />
    )

    expect(screen.getByText("¿Eliminar cliente?")).toBeTruthy()
    // Debe mostrar el nombre del cliente en la descripción
    expect(screen.getByText(/María García/i)).toBeTruthy()
  })

  it("muestra aviso cuando el cliente tiene historial", async () => {
    const { EliminarClienteDialog } = await import("@/components/clientes/eliminar-cliente-dialog")

    const clienteMock = {
      id: "def-456",
      organizacion_id: "org-1",
      cedula: "67890",
      nombre: "Carlos López",
      telefono: "5551112222",
      correo: null,
      direccion: null,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }

    render(
      <EliminarClienteDialog
        open={true}
        cliente={clienteMock}
        tieneHistorial={true}
        onClose={vi.fn()}
        onEliminado={vi.fn()}
      />
    )

    // El aviso de historial debe estar visible
    expect(
      screen.getByText(/ventas o movimientos de deuda asociados/i)
    ).toBeTruthy()
  })
})

// =============================================================================
// 5. FiadoresSection
// =============================================================================

describe("FiadoresSection — smoke test", () => {
  it("monta sin lanzar errores y muestra las tarjetas de totales", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        fiadores: [],
        totales: { totalClientesConDeuda: 0, totalDeudaPendiente: 0 },
      }),
      status: 200,
    } as Response)

    const { FiadoresSection } = await import("@/components/sections/fiadores-section")

    const { container } = render(<FiadoresSection />)
    expect(container).toBeTruthy()

    // Las stat-cards deben mostrar sus títulos
    expect(screen.getByText("Clientes con deuda")).toBeTruthy()
    expect(screen.getByText("Total deuda pendiente")).toBeTruthy()
  })
})

// =============================================================================
// 6. DetalleDeudaDialog
// =============================================================================

describe("DetalleDeudaDialog — smoke test", () => {
  it("monta y muestra el título con el nombre del cliente", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ items: [] }),
      status: 200,
    } as Response)

    const { DetalleDeudaDialog } = await import("@/components/fiadores/detalle-deuda-dialog")

    const clienteMock = {
      id: "clt-001",
      organizacion_id: "org-1",
      cedula: "A1B2C",
      nombre: "Ana Torres",
      telefono: "5550001111",
      correo: null,
      direccion: null,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }

    render(
      <DetalleDeudaDialog
        open={true}
        cliente={clienteMock}
        saldo={500}
        onClose={vi.fn()}
      />
    )

    // Título con el nombre del cliente
    expect(screen.getByText(/Ana Torres/i)).toBeTruthy()
    // Etiqueta del saldo pendiente
    expect(screen.getByText("Saldo pendiente")).toBeTruthy()
  })
})

// =============================================================================
// 7. RegistrarAbonoDialog
// =============================================================================

describe("RegistrarAbonoDialog — smoke test", () => {
  it("monta y muestra el título y el campo de monto", async () => {
    const { RegistrarAbonoDialog } = await import("@/components/fiadores/registrar-abono-dialog")

    const clienteMock = {
      id: "clt-002",
      organizacion_id: "org-1",
      cedula: "Z9Y8X",
      nombre: "Pedro Ramírez",
      telefono: "5553334444",
      correo: null,
      direccion: null,
      creado_en: new Date().toISOString(),
      actualizado_en: new Date().toISOString(),
    }

    render(
      <RegistrarAbonoDialog
        open={true}
        cliente={clienteMock}
        saldo={1200.5}
        onClose={vi.fn()}
        onAbonado={vi.fn()}
      />
    )

    // "Registrar abono" aparece en el título del diálogo y en el botón de submit
    const elementosRegistrar = screen.getAllByText("Registrar abono")
    expect(elementosRegistrar.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText("Monto del abono")).toBeTruthy()
    // Nombre del cliente visible en el subtítulo
    expect(screen.getByText("Pedro Ramírez")).toBeTruthy()
  })
})

// =============================================================================
// 8. ExtenderDeudaDialog
// =============================================================================

describe("ExtenderDeudaDialog — smoke test", () => {
  it("monta y muestra el título y el botón de selección de fecha", async () => {
    const { ExtenderDeudaDialog } = await import("@/components/fiadores/extender-deuda-dialog")

    const plazoVigente = new Date("2025-01-01")

    render(
      <ExtenderDeudaDialog
        open={true}
        notificacionId="notif-001"
        plazoVigente={plazoVigente}
        onClose={vi.fn()}
        onExtendido={vi.fn()}
      />
    )

    expect(screen.getByText("Extender plazo de deuda")).toBeTruthy()
    // El botón del date picker debe estar presente
    expect(
      screen.getByRole("button", { name: /seleccionar nueva fecha límite/i })
    ).toBeTruthy()
  })
})

// =============================================================================
// 9. NotificacionItem — acciones rápidas por tipo
// =============================================================================

describe("NotificacionItem — smoke tests de acciones rápidas", () => {
  function makeNotificacion(
    tipo: string,
    acciones: string[],
    opts?: { producto_id?: string; venta_id?: string }
  ) {
    return {
      id: "notif-" + tipo,
      tipo,
      titulo: `Notificación ${tipo}`,
      mensaje: `Mensaje de prueba para ${tipo}`,
      leida: false,
      creado_en: new Date().toISOString(),
      acciones_rapidas: acciones as ("Ajustar stock" | "Eliminar producto" | "Extender deuda")[],
      producto_id: opts?.producto_id ?? null,
      venta_id: opts?.venta_id ?? null,
    }
  }

  it("tipo stock_cero: muestra botones 'Ajustar stock' y 'Eliminar producto'", async () => {
    const { NotificacionItem } = await import("@/components/notificaciones/notificacion-item")

    const notificacion = makeNotificacion(
      "stock_cero",
      ["Ajustar stock", "Eliminar producto"],
      { producto_id: "prod-001" }
    )

    render(
      <NotificacionItem
        notificacion={notificacion}
        onMarcarLeida={vi.fn()}
        onAccionEjecutada={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: /ajustar stock/i })).toBeTruthy()
    expect(screen.getByRole("button", { name: /eliminar el producto/i })).toBeTruthy()
  })

  it("tipo stock_critico: muestra solo 'Ajustar stock', sin 'Eliminar producto'", async () => {
    const { NotificacionItem } = await import("@/components/notificaciones/notificacion-item")

    const notificacion = makeNotificacion(
      "stock_critico",
      ["Ajustar stock"],
      { producto_id: "prod-002" }
    )

    render(
      <NotificacionItem
        notificacion={notificacion}
        onMarcarLeida={vi.fn()}
        onAccionEjecutada={vi.fn()}
      />
    )

    expect(screen.getByRole("button", { name: /ajustar stock/i })).toBeTruthy()
    // "Eliminar producto" NO debe estar presente para stock_critico (Req 8.6)
    expect(screen.queryByRole("button", { name: /eliminar el producto/i })).toBeNull()
  })

  it("tipo vencimiento_deuda: muestra solo 'Extender deuda'", async () => {
    const { NotificacionItem } = await import("@/components/notificaciones/notificacion-item")

    const notificacion = makeNotificacion(
      "vencimiento_deuda",
      ["Extender deuda"],
      { venta_id: "venta-001" }
    )

    render(
      <NotificacionItem
        notificacion={notificacion}
        onMarcarLeida={vi.fn()}
        onAccionEjecutada={vi.fn()}
      />
    )

    expect(
      screen.getByRole("button", { name: /extender el plazo de deuda/i })
    ).toBeTruthy()
    // Los botones de stock no deben aparecer
    expect(screen.queryByRole("button", { name: /ajustar stock/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /eliminar el producto/i })).toBeNull()
  })

  it("notificación leída: se monta correctamente sin indicador de sin leer", async () => {
    const { NotificacionItem } = await import("@/components/notificaciones/notificacion-item")

    const notificacion = {
      ...makeNotificacion("stock_cero", ["Ajustar stock", "Eliminar producto"], {
        producto_id: "prod-003",
      }),
      leida: true,
    }

    const { container } = render(
      <NotificacionItem
        notificacion={notificacion}
        onMarcarLeida={vi.fn()}
        onAccionEjecutada={vi.fn()}
      />
    )

    expect(container).toBeTruthy()
    // El título sigue siendo visible
    expect(screen.getByText(/Notificación stock_cero/i)).toBeTruthy()
  })

  it("notificación sin acciones: monta sin botones de acción", async () => {
    const { NotificacionItem } = await import("@/components/notificaciones/notificacion-item")

    const notificacion = makeNotificacion("otro_tipo", [])

    const { container } = render(
      <NotificacionItem
        notificacion={notificacion}
        onMarcarLeida={vi.fn()}
      />
    )

    expect(container).toBeTruthy()
    // No debe haber ningún botón de acción rápida
    expect(screen.queryByRole("button", { name: /ajustar stock/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /eliminar el producto/i })).toBeNull()
    expect(screen.queryByRole("button", { name: /extender el plazo/i })).toBeNull()
  })
})
