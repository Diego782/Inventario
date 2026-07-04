"use client"

/**
 * components/sections/inventario-section.tsx
 * Sección principal de Inventario.
 * Orquesta la barra de búsqueda, las tarjetas de resumen, la tabla de productos
 * y el estado de qué diálogo está abierto.
 * Requisitos: R2.1, R2.9, R3.1, R4.1, R5.1, R6.1, R6.2, R6.3, R6.4, R8.1, R8.2, R12.1, R13.1, R22.1, R22.2
 */

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Search, Plus, TrendingUp, ShoppingCart } from "lucide-react"
import { InventarioTable } from "@/components/inventario/inventario-table"
import { FiltrosInventario, type FiltrosInventario as FiltrosInventarioTipo } from "@/components/inventario/filtros-inventario"
import { ProductoFormDialog } from "@/components/inventario/producto-form-dialog"
import { EliminarProductoDialog } from "@/components/inventario/eliminar-producto-dialog"
import { AjustarStockDialog } from "@/components/inventario/ajustar-stock-dialog"
import { HistorialMovimientosDialog } from "@/components/inventario/historial-movimientos-dialog"
import { ImprimirEtiquetaDialog } from "@/components/inventario/imprimir-etiqueta-dialog"
import { StatCard } from "@/components/stat-card"
import type { ProductoDTO } from "@/lib/api/serializadores"

// ---- Tipos ----

type AccionTipo = "crear" | "editar" | "eliminar" | "ajustar-stock" | "historial" | "imprimir-etiqueta"

interface EstadoDialog {
  tipo: AccionTipo | null
  productoId?: string
}

type ResumenInventario = {
  total: number
  en_stock: number
  bajo_stock: number
  critico: number
}

type ValorInventario = {
  inversion: number
  recaudacion_potencial: number
}

// ---- Helpers ----

/** Formatea un monto con separadores regionales en español y 2 decimales. */
function formatearMoneda(valor: number): string {
  return valor.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

// ---- Componente ----

export function InventarioSection() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filtros, setFiltros] = useState<FiltrosInventarioTipo>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [estadoDialog, setEstadoDialog] = useState<EstadoDialog>({ tipo: null })
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoDTO | null>(null)
  const [resumen, setResumen] = useState<ResumenInventario | null>(null)
  const [valorInventario, setValorInventario] = useState<ValorInventario | null>(null)

  // Cargar tarjetas de resumen
  useEffect(() => {
    fetch("/api/inventario/resumen")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setResumen(data)
      })
      .catch(() => {
        // Silencioso: las tarjetas muestran "—" si falla
      })
  }, [refreshKey])

  // Cargar métricas de Valor de Inventario (Req 2.1, 2.9)
  useEffect(() => {
    fetch("/api/inventario/valor")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setValorInventario(data)
      })
      .catch(() => {
        // Silencioso: las tarjetas muestran "—" si falla
      })
  }, [refreshKey])

  function handleAccion(tipo: string, producto: ProductoDTO) {
    setProductoSeleccionado(producto)
    setEstadoDialog({ tipo: tipo as AccionTipo, productoId: producto.id })
  }

  function handleNuevoProducto() {
    setProductoSeleccionado(null)
    setEstadoDialog({ tipo: "crear" })
  }

  // Cuando se cierre un diálogo que haya modificado datos, refrescar la tabla
  function handleCerrarDialog() {
    setEstadoDialog({ tipo: null })
    setRefreshKey((k) => k + 1)
  }

  // Refresca los datos SIN cerrar el diálogo (útil para ajustes de stock por
  // variante, donde el usuario suele agregar/editar varias tallas seguidas).
  function handleRefrescarSinCerrar() {
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o código de barras..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <FiltrosInventario filtros={filtros} onAplicar={setFiltros} />
          {/* BETA: Botón Exportar oculto — sin funcionalidad implementada, se habilitará en próxima versión
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          */}
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleNuevoProducto}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Producto
          </Button>
        </div>
      </div>

      {/* Tarjetas de resumen */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Productos</p>
          <p className="text-2xl font-bold text-foreground">
            {resumen ? resumen.total.toLocaleString("es-MX") : "—"}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">En Stock</p>
          <p className="text-2xl font-bold text-green-600">
            {resumen ? resumen.en_stock.toLocaleString("es-MX") : "—"}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Bajo Stock</p>
          <p className="text-2xl font-bold text-yellow-600">
            {resumen ? resumen.bajo_stock.toLocaleString("es-MX") : "—"}
          </p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Crítico</p>
          <p className="text-2xl font-bold text-red-500">
            {resumen ? resumen.critico.toLocaleString("es-MX") : "—"}
          </p>
        </div>
      </div>

      {/* Tarjetas de Valor de Inventario (Req 2.1, 2.9) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Inversión"
          value={
            valorInventario !== null
              ? `$${formatearMoneda(valorInventario.inversion)}`
              : "—"
          }
          icon={ShoppingCart}
          iconBg="bg-blue-500/10"
        />
        <StatCard
          title="Recaudación potencial"
          value={
            valorInventario !== null
              ? `$${formatearMoneda(valorInventario.recaudacion_potencial)}`
              : "—"
          }
          icon={TrendingUp}
          iconBg="bg-green-500/10"
        />
      </div>

      {/* Tabla principal */}
      <InventarioTable
        searchTerm={searchTerm}
        filtros={filtros}
        refreshKey={refreshKey}
        onAccion={handleAccion}
      />

      {/* Dialog crear/editar — Tarea 10.4 */}
      <ProductoFormDialog
        open={estadoDialog.tipo === "crear" || estadoDialog.tipo === "editar"}
        modo={estadoDialog.tipo === "crear" ? "crear" : "editar"}
        producto={productoSeleccionado ?? undefined}
        onClose={handleCerrarDialog}
        onGuardado={handleCerrarDialog}
      />

      {/* Dialog eliminar — Tarea 10.6 */}
      <EliminarProductoDialog
        open={estadoDialog.tipo === "eliminar"}
        producto={productoSeleccionado}
        onClose={handleCerrarDialog}
        onEliminado={handleCerrarDialog}
      />

      {/* Dialog ajustar stock — Tarea 10.8 */}
      <AjustarStockDialog
        open={estadoDialog.tipo === "ajustar-stock"}
        producto={productoSeleccionado}
        onClose={handleCerrarDialog}
        onAjustado={handleRefrescarSinCerrar}
      />

      {/* Dialog historial de movimientos — Tarea 10.10 */}
      <HistorialMovimientosDialog
        open={estadoDialog.tipo === "historial"}
        producto={productoSeleccionado}
        onClose={handleCerrarDialog}
      />

      {/* Dialog imprimir etiqueta — Tarea 10.14 */}
      <ImprimirEtiquetaDialog
        open={estadoDialog.tipo === "imprimir-etiqueta"}
        producto={productoSeleccionado}
        onClose={handleCerrarDialog}
      />
    </div>
  )
}
