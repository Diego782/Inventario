import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Header } from "@/components/header"

const { seleccionar } = vi.hoisted(() => ({ seleccionar: vi.fn() }))
vi.mock("@/hooks/use-organizacion-activa", () => ({
  useOrganizacionActiva: () => ({
    organizacion: { id: "org-1", nombre: "Tienda Norte" },
    organizaciones: [
      { id: "org-1", nombre: "Tienda Norte", rol: "Administrador" },
      { id: "org-2", nombre: "Tienda Sur", rol: "Administrador" },
    ],
    seleccionar,
  }),
}))
vi.mock("@/components/notificaciones/campana-notificaciones", () => ({
  CampanaNotificaciones: () => <span>Notificaciones</span>,
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))

describe("selector de organización en la cabecera", () => {
  it("ofrece las organizaciones disponibles y llama a la selección sin cerrar sesión", async () => {
    seleccionar.mockRejectedValueOnce(new Error("Prueba: selección cancelada"))
    render(<Header title="Inventario" />)
    const usuario = userEvent.setup()
    await usuario.click(screen.getByRole("button", { name: /Cambiar organización.*Tienda Norte/ }))
    expect(screen.getByRole("menuitem", { name: "Tienda Norte" })).toHaveAttribute("data-disabled")
    await usuario.click(screen.getByRole("menuitem", { name: "Tienda Sur" }))
    expect(seleccionar).toHaveBeenCalledWith("org-2")
  })
})
