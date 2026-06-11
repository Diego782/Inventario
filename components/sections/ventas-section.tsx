"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search,
  Plus,
} from "lucide-react"
import { VentasTable } from "@/components/ventas/ventas-table"
import { FiltrosVentas, type FiltrosVentas as FiltrosVentasTipo } from "@/components/ventas/filtros-ventas"
import { NuevaVentaDialog } from "@/components/ventas/nueva-venta-dialog"
import { TicketDialog } from "@/components/ventas/ticket-dialog"
import { DetalleVentaDialog } from "@/components/ventas/detalle-venta-dialog"
import type { VentaDTO } from "@/lib/api/serializadores"

// ---- Tipos de estado de diálogo ----

type EstadoDialog =
  | { tipo: "ninguno" }
  | { tipo: "nueva" }
  | { tipo: "ticket"; ventaId: string }
  | { tipo: "detalle"; ventaId: string }
  | { tipo: "reimprimir"; ventaId: string }

export function VentasSection() {
  const [searchTerm, setSearchTerm] = useState("")
  const [filtros, setFiltros] = useState<FiltrosVentasTipo>({})
  const [refreshKey, setRefreshKey] = useState(0)
  const [estado, setEstado] = useState<EstadoDialog>({ tipo: "ninguno" })
  const [ventaActual, setVentaActual] = useState<VentaDTO | null>(null)

  function handleAccion(tipo: "detalle" | "reimprimir", ventaId: string) {
    if (tipo === "reimprimir") {
      // Cargar la venta por ID para tener los datos completos en TicketDialog
      fetch(`/api/ventas/${ventaId}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (data) setVentaActual(data)
          setEstado({ tipo: "reimprimir", ventaId })
        })
        .catch(() => {
          setEstado({ tipo: "reimprimir", ventaId })
        })
    } else {
      setEstado({ tipo, ventaId })
    }
  }

  function handleNuevaVenta() {
    setEstado({ tipo: "nueva" })
  }

  const handleVentaCreada = useCallback((venta: VentaDTO) => {
    setVentaActual(venta)
    setEstado({ tipo: "ticket", ventaId: venta.id })
    setRefreshKey((k) => k + 1)
  }, [])

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por folio, método de pago..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <FiltrosVentas filtros={filtros} onAplicar={setFiltros} />
          {/* BETA: Botón Exportar oculto — sin funcionalidad implementada, se habilitará en próxima versión
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          */}
          <Button
            size="sm"
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
            onClick={handleNuevaVenta}
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Venta
          </Button>
        </div>
      </div>

      {/* Tarjetas resumen — valores pendientes de conectar a la API */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Ventas Hoy</p>
          <p className="text-2xl font-bold text-foreground">—</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Transacciones</p>
          <p className="text-2xl font-bold text-foreground">—</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Ticket Promedio</p>
          <p className="text-2xl font-bold text-foreground">—</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Pendiente Fiados</p>
          <p className="text-2xl font-bold text-red-500">—</p>
        </div>
      </div>

      {/* Tabla de ventas */}
      <VentasTable
        searchTerm={searchTerm}
        filtros={filtros}
        refreshKey={refreshKey}
        onAccion={handleAccion}
      />

      {/* Dialog nueva venta */}
      <NuevaVentaDialog
        open={estado.tipo === "nueva"}
        onClose={() => setEstado({ tipo: "ninguno" })}
        onVentaCreada={handleVentaCreada}
      />

      {/* Dialog ticket — se muestra tras crear venta o al reimprimir */}
      <TicketDialog
        open={estado.tipo === "ticket" || estado.tipo === "reimprimir"}
        venta={ventaActual}
        onClose={() => setEstado({ tipo: "ninguno" })}
        onNuevaVenta={() => setEstado({ tipo: "nueva" })}
      />

      {/* Dialog detalle de venta */}
      <DetalleVentaDialog
        open={estado.tipo === "detalle"}
        ventaId={estado.tipo === "detalle" ? estado.ventaId : null}
        onClose={() => setEstado({ tipo: "ninguno" })}
      />
    </div>
  )
}
