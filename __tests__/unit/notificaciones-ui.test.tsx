/**
 * __tests__/unit/notificaciones-ui.test.tsx
 *
 * Tests ejemplares (smoke) de UI para los componentes de notificaciones.
 *
 * Cubre:
 *  - NotificacionItem: renderiza título, mensaje, tiempo relativo; muestra
 *    indicador de no leída; llama onMarcarLeida al clic en no leída;
 *    NO llama onMarcarLeida al clic en ya leída.
 *  - ListaNotificaciones: renderiza EstadoVacioNotificaciones cuando items=[],
 *    y renderiza los items cuando hay contenido.
 *  - EstadoVacioNotificaciones: muestra "No tienes notificaciones" (R9.11).
 *  - PanelNotificaciones: renderiza sin error; muestra "Marcar todas como leídas".
 *
 * Validates: Requirements R9.5, R9.6, R9.7, R9.11, R13.1
 */

import * as React from "react"
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"

// ── Mocks de dependencias externas ──────────────────────────────────────────

// next-themes: requerido por componentes que usan useTheme
vi.mock("next-themes", () => ({
  useTheme: () => ({ resolvedTheme: "light", theme: "light", setTheme: vi.fn() }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

// tiempoRelativoEs: función pura; se mockea para devolver siempre "Hace un momento"
// y así hacer los tests deterministas sin depender del reloj.
vi.mock("@/lib/notificaciones/tiempo", () => ({
  tiempoRelativoEs: () => "Hace un momento",
}))

// use-notificaciones: se mockea para PanelNotificaciones, que lo consuma
// internamente a través de sus props (el panel recibe el estado como prop).
// No necesitamos mockear el hook directamente porque PanelNotificaciones
// recibe `notificaciones: UseNotificaciones` como prop.

// ── Imports de los componentes bajo prueba (después de los mocks) ────────────
import { NotificacionItem } from "@/components/notificaciones/notificacion-item"
import { ListaNotificaciones } from "@/components/notificaciones/lista-notificaciones"
import { EstadoVacioNotificaciones } from "@/components/notificaciones/estado-vacio-notificaciones"
import { PanelNotificaciones } from "@/components/notificaciones/panel-notificaciones"
import type { NotificacionDTO } from "@/lib/api/serializadores"
import type { UseNotificaciones } from "@/hooks/use-notificaciones"

// ── Helpers de fixtures ──────────────────────────────────────────────────────

function crearNotif(over: Partial<NotificacionDTO> = {}): NotificacionDTO {
  return {
    id: over.id ?? "notif-1",
    tipo: over.tipo ?? "stock_critico",
    titulo: over.titulo ?? "Stock crítico detectado",
    mensaje: over.mensaje ?? "El producto Arroz tiene stock crítico: 0 unidades (mínimo: 10).",
    producto_id: over.producto_id ?? "prod-1",
    venta_id: over.venta_id ?? null,
    leida: over.leida ?? false,
    creado_en: over.creado_en ?? "2025-04-20T10:00:00.000Z",
    // acciones_rapidas vacío por defecto para que los tests básicos no muestren botones de acción
    acciones_rapidas: over.acciones_rapidas ?? [],
  }
}

/** Stub de UseNotificaciones con valores por defecto sobreescribibles. */
function crearEstadoNotificaciones(
  over: Partial<UseNotificaciones> = {}
): UseNotificaciones {
  return {
    items: over.items ?? [],
    conteo: over.conteo ?? 0,
    estado: over.estado ?? "listo",
    recargar: over.recargar ?? vi.fn().mockResolvedValue(undefined),
    marcarLeida: over.marcarLeida ?? vi.fn().mockResolvedValue(undefined),
    marcarTodasLeidas: over.marcarTodasLeidas ?? vi.fn().mockResolvedValue(undefined),
  }
}

// ════════════════════════════════════════════════════════════════════════════
// NotificacionItem
// ════════════════════════════════════════════════════════════════════════════

describe("NotificacionItem — renderizado básico (R9.5)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("muestra el título de la notificación", () => {
    const notif = crearNotif({ titulo: "Stock crítico detectado" })
    render(<NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />)
    expect(screen.getByText("Stock crítico detectado")).toBeDefined()
  })

  it("muestra el mensaje de la notificación", () => {
    const notif = crearNotif({
      mensaje: "El producto Arroz tiene stock crítico: 0 unidades (mínimo: 10).",
    })
    render(<NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />)
    expect(
      screen.getByText("El producto Arroz tiene stock crítico: 0 unidades (mínimo: 10).")
    ).toBeDefined()
  })

  it("muestra el tiempo relativo devuelto por tiempoRelativoEs (mockeado)", () => {
    const notif = crearNotif()
    render(<NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />)
    // tiempoRelativoEs está mockeado para devolver "Hace un momento"
    expect(screen.getByText("Hace un momento")).toBeDefined()
  })
})

describe("NotificacionItem — indicador de no leída (R9.6)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("muestra el indicador visual (punto) cuando la notificación no está leída", () => {
    const notif = crearNotif({ leida: false })
    const { container } = render(
      <NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />
    )
    // El indicador es un <span> con clase bg-primary; sólo existe en no leídas.
    const indicador = container.querySelector(".bg-primary")
    expect(indicador).not.toBeNull()
  })

  it("no muestra el indicador visual (punto primario) cuando la notificación está leída", () => {
    const notif = crearNotif({ leida: true })
    const { container } = render(
      <NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />
    )
    const indicador = container.querySelector(".bg-primary")
    expect(indicador).toBeNull()
  })

  it("el botón tiene aria-label que indica 'sin leer' para no leídas", () => {
    const notif = crearNotif({ leida: false, titulo: "Alerta de stock" })
    render(<NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />)
    const boton = screen.getByRole("button", { name: /sin leer.*Alerta de stock/i })
    expect(boton).toBeDefined()
  })

  it("el botón tiene aria-label que indica 'leída' cuando ya fue leída", () => {
    const notif = crearNotif({ leida: true, titulo: "Alerta de stock" })
    render(<NotificacionItem notificacion={notif} onMarcarLeida={vi.fn()} />)
    const boton = screen.getByRole("button", { name: /leída.*Alerta de stock/i })
    expect(boton).toBeDefined()
  })
})

describe("NotificacionItem — acción de marcar leída (R9.7)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("llama onMarcarLeida con el id correcto al hacer clic en una notificación no leída", () => {
    const onMarcarLeida = vi.fn()
    const notif = crearNotif({ id: "notif-abc", leida: false })
    render(<NotificacionItem notificacion={notif} onMarcarLeida={onMarcarLeida} />)

    fireEvent.click(screen.getByRole("button"))
    expect(onMarcarLeida).toHaveBeenCalledTimes(1)
    expect(onMarcarLeida).toHaveBeenCalledWith("notif-abc")
  })

  it("NO llama onMarcarLeida al hacer clic en una notificación ya leída", () => {
    const onMarcarLeida = vi.fn()
    const notif = crearNotif({ leida: true })
    render(<NotificacionItem notificacion={notif} onMarcarLeida={onMarcarLeida} />)

    fireEvent.click(screen.getByRole("button"))
    expect(onMarcarLeida).not.toHaveBeenCalled()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// EstadoVacioNotificaciones
// ════════════════════════════════════════════════════════════════════════════

describe("EstadoVacioNotificaciones — texto (R9.11)", () => {
  beforeEach(() => vi.clearAllMocks())

  it('muestra "No tienes notificaciones"', () => {
    render(<EstadoVacioNotificaciones />)
    expect(screen.getByText("No tienes notificaciones")).toBeDefined()
  })

  it("renderiza sin lanzar errores", () => {
    expect(() => render(<EstadoVacioNotificaciones />)).not.toThrow()
  })
})

// ════════════════════════════════════════════════════════════════════════════
// ListaNotificaciones
// ════════════════════════════════════════════════════════════════════════════

describe("ListaNotificaciones — lista vacía (R9.11)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza EstadoVacioNotificaciones cuando items está vacío", () => {
    render(<ListaNotificaciones items={[]} onMarcarLeida={vi.fn()} />)
    expect(screen.getByText("No tienes notificaciones")).toBeDefined()
  })
})

describe("ListaNotificaciones — con items", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza los títulos de los items cuando hay notificaciones", () => {
    const items = [
      crearNotif({ id: "n1", titulo: "Alerta A", leida: false }),
      crearNotif({ id: "n2", titulo: "Alerta B", leida: true }),
    ]
    render(<ListaNotificaciones items={items} onMarcarLeida={vi.fn()} />)
    expect(screen.getByText("Alerta A")).toBeDefined()
    expect(screen.getByText("Alerta B")).toBeDefined()
  })

  it("no muestra el estado vacío cuando hay items", () => {
    const items = [crearNotif({ id: "n1", titulo: "Alerta A" })]
    render(<ListaNotificaciones items={items} onMarcarLeida={vi.fn()} />)
    expect(screen.queryByText("No tienes notificaciones")).toBeNull()
  })

  it("propaga la llamada a onMarcarLeida al hacer clic en item no leído", () => {
    const onMarcarLeida = vi.fn()
    const items = [crearNotif({ id: "n-click", leida: false, titulo: "Click me" })]
    render(<ListaNotificaciones items={items} onMarcarLeida={onMarcarLeida} />)

    fireEvent.click(screen.getByRole("button"))
    expect(onMarcarLeida).toHaveBeenCalledWith("n-click")
  })
})

// ════════════════════════════════════════════════════════════════════════════
// PanelNotificaciones — smoke básico
// ════════════════════════════════════════════════════════════════════════════

describe("PanelNotificaciones — smoke (R9.9)", () => {
  beforeEach(() => vi.clearAllMocks())

  it("renderiza sin lanzar errores", () => {
    const estado = crearEstadoNotificaciones()
    expect(() =>
      render(<PanelNotificaciones notificaciones={estado} abierto={false} />)
    ).not.toThrow()
  })

  it('muestra el botón "Marcar todas como leídas"', () => {
    const estado = crearEstadoNotificaciones({
      items: [crearNotif({ leida: false })],
      conteo: 1,
    })
    render(<PanelNotificaciones notificaciones={estado} abierto={false} />)
    expect(screen.getByText("Marcar todas como leídas")).toBeDefined()
  })

  it('muestra "No tienes notificaciones" cuando items está vacío', () => {
    const estado = crearEstadoNotificaciones({ items: [], conteo: 0 })
    render(<PanelNotificaciones notificaciones={estado} abierto={false} />)
    expect(screen.getByText("No tienes notificaciones")).toBeDefined()
  })

  it("llama recargar cuando se abre el panel (abierto pasa de false a true)", () => {
    const recargar = vi.fn().mockResolvedValue(undefined)
    const estado = crearEstadoNotificaciones({ recargar })

    const { rerender } = render(
      <PanelNotificaciones notificaciones={estado} abierto={false} />
    )
    expect(recargar).not.toHaveBeenCalled()

    rerender(<PanelNotificaciones notificaciones={estado} abierto={true} />)
    expect(recargar).toHaveBeenCalledTimes(1)
  })
})
