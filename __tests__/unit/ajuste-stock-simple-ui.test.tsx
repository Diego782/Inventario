import { describe, expect, it, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AjustarStockDialog } from "@/components/inventario/ajustar-stock-dialog"
import type { ProductoDTO } from "@/lib/api/serializadores"

vi.mock("@/components/inventario/variantes-editor", () => ({
  VariantesEditor: () => <div>Editor de variantes</div>,
}))
vi.mock("@/components/inventario/lotes-editor", () => ({
  LotesEditor: () => <div>Editor de lotes</div>,
}))

const producto = {
  id: "producto-1", nombre: "Prueba", stock_actual: 9, stock_minimo: 2,
  unidad: "unidad", controla_vencimiento: false, variantes: [],
} as unknown as ProductoDTO

describe("ajuste de producto sin variantes", () => {
  it("muestra el editor directo y deja agregar variantes solo si se elige", async () => {
    render(<AjustarStockDialog open producto={producto} onClose={vi.fn()} onAjustado={vi.fn()} />)
    expect(screen.getByRole("spinbutton", { name: "Stock actual del producto" })).toHaveValue(9)
    expect(screen.getByRole("spinbutton", { name: "Stock mínimo del producto" })).toHaveValue(2)
    expect(screen.queryByText("Editor de variantes")).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole("button", { name: "Agregar una variante" }))
    expect(screen.getByText("Editor de variantes")).toBeInTheDocument()
    await userEvent.click(screen.getByRole("button", { name: "Volver al stock sin variantes" }))
    expect(screen.getByRole("spinbutton", { name: "Stock actual del producto" })).toBeInTheDocument()
  })
})
