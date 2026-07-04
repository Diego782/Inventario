"use client"

/**
 * components/sections/fiadores-section.tsx
 *
 * Sección Fiadores — lista de clientes con deuda pendiente (saldo > 0).
 * Reemplaza los datos mock por fetch real a /api/deuda/fiadores.
 *
 * Muestra:
 *  - Dos stat-cards superiores: Total_Clientes_Con_Deuda y Total_Deuda_Pendiente (Req 5.4, 5.5)
 *  - Tabla de clientes con deuda (nombre, teléfono, saldo) (Req 5.1)
 *  - Acción "Ver" que abre el historial cronológico con saldo corrido (Req 5.2, 5.3)
 *  - Acción "Abonar" que registra un abono (Req 5.7–5.11)
 *
 * Requirements: 5.1–5.14
 */

import { useState, useEffect, useCallback } from "react"
import { Users, DollarSign, Eye, CreditCard, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { StatCard } from "@/components/stat-card"
import { DetalleDeudaDialog } from "@/components/fiadores/detalle-deuda-dialog"
import { RegistrarAbonoDialog } from "@/components/fiadores/registrar-abono-dialog"
import type { ClienteDTO, FiadorDTO } from "@/lib/api/serializadores"

// ---- Tipos locales ----

type TotalesDeuda = {
  totalClientesConDeuda: number
  totalDeudaPendiente: number
}

// ---- Helpers ----

function formatMonto(n: number) {
  return n.toLocaleString("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function iniciales(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("")
}

// ---- Componente ----

export function FiadoresSection() {
  const [fiadores, setFiadores] = useState<FiadorDTO[]>([])
  const [totales, setTotales] = useState<TotalesDeuda>({
    totalClientesConDeuda: 0,
    totalDeudaPendiente: 0,
  })
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")
  const [refreshKey, setRefreshKey] = useState(0)

  // Dialog de detalle / historial
  const [clienteDetalle, setClienteDetalle] = useState<ClienteDTO | null>(null)
  const [saldoDetalle, setSaldoDetalle] = useState(0)
  const [detalleOpen, setDetalleOpen] = useState(false)

  // Dialog de abono
  const [clienteAbono, setClienteAbono] = useState<ClienteDTO | null>(null)
  const [saldoAbono, setSaldoAbono] = useState(0)
  const [abonoOpen, setAbonoOpen] = useState(false)

  // Carga datos de la API
  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch("/api/deuda/fiadores")
      if (!res.ok) {
        if (res.status === 401 || res.status === 409) {
          setError("Sin sesión o sin organización activa.")
        } else {
          setError("Error al cargar los fiadores.")
        }
        return
      }
      const data = await res.json()
      setFiadores(data.fiadores ?? [])
      setTotales(
        data.totales ?? { totalClientesConDeuda: 0, totalDeudaPendiente: 0 }
      )
    } catch {
      setError("Error de red al cargar los fiadores.")
    } finally {
      setCargando(false)
    }
  }, [])

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos, refreshKey])

  // Filtro de búsqueda local
  const fiadorsFiltrados = fiadores.filter((f) => {
    if (!searchTerm.trim()) return true
    const q = searchTerm.toLowerCase()
    return (
      f.cliente.nombre.toLowerCase().includes(q) ||
      f.cliente.telefono.includes(q) ||
      f.cliente.cedula.toLowerCase().includes(q)
    )
  })

  function handleVerDetalle(fiador: FiadorDTO) {
    setClienteDetalle(fiador.cliente)
    setSaldoDetalle(fiador.saldo)
    setDetalleOpen(true)
  }

  function handleAbonar(fiador: FiadorDTO) {
    setClienteAbono(fiador.cliente)
    setSaldoAbono(fiador.saldo)
    setAbonoOpen(true)
  }

  function handleAbonadoExito() {
    setAbonoOpen(false)
    setRefreshKey((k) => k + 1)
  }

  return (
    <div className="space-y-6">
      {/* Stat-cards superiores (Req 5.4, 5.5) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <StatCard
          title="Clientes con deuda"
          value={
            cargando
              ? "—"
              : totales.totalClientesConDeuda.toLocaleString("es-MX")
          }
          icon={Users}
          iconBg="bg-primary/10"
        />
        <StatCard
          title="Total deuda pendiente"
          value={cargando ? "—" : formatMonto(totales.totalDeudaPendiente)}
          icon={DollarSign}
          iconBg="bg-destructive/10"
        />
      </div>

      {/* Buscador */}
      <div className="relative w-full sm:w-96">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por nombre, cédula o teléfono..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Estado de carga / error / vacío / tabla */}
      {cargando ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          Cargando fiadores...
        </div>
      ) : error ? (
        <div className="py-16 text-center text-sm text-destructive">
          {error}
        </div>
      ) : fiadorsFiltrados.length === 0 ? (
        <div className="py-16 text-center text-sm text-muted-foreground">
          {searchTerm
            ? "No se encontraron fiadores con ese criterio de búsqueda."
            : "No hay clientes con deuda pendiente."}
        </div>
      ) : (
        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Cliente</TableHead>
                <TableHead className="font-semibold">Teléfono</TableHead>
                <TableHead className="font-semibold text-right">Saldo pendiente</TableHead>
                <TableHead className="font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {fiadorsFiltrados.map((fiador) => (
                <TableRow key={fiador.cliente.id} className="hover:bg-muted/30">
                  {/* Nombre con avatar de iniciales */}
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {iniciales(fiador.cliente.nombre)}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium leading-tight">
                          {fiador.cliente.nombre}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Cédula: {fiador.cliente.cedula}
                        </p>
                      </div>
                    </div>
                  </TableCell>

                  {/* Teléfono */}
                  <TableCell className="text-sm text-muted-foreground">
                    {fiador.cliente.telefono}
                  </TableCell>

                  {/* Saldo pendiente */}
                  <TableCell className="text-right font-semibold text-primary">
                    {formatMonto(fiador.saldo)}
                  </TableCell>

                  {/* Acciones */}
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => handleVerDetalle(fiador)}
                        title="Ver historial de deuda"
                      >
                        <Eye className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Ver</span>
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 gap-1.5"
                        onClick={() => handleAbonar(fiador)}
                        title="Registrar abono"
                      >
                        <CreditCard className="w-4 h-4" />
                        <span className="hidden sm:inline text-xs">Abonar</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Dialog: historial de deuda (Req 5.2, 5.3) */}
      <DetalleDeudaDialog
        open={detalleOpen}
        cliente={clienteDetalle}
        saldo={saldoDetalle}
        onClose={() => setDetalleOpen(false)}
      />

      {/* Dialog: registrar abono (Req 5.7–5.11) */}
      <RegistrarAbonoDialog
        open={abonoOpen}
        cliente={clienteAbono}
        saldo={saldoAbono}
        onClose={() => setAbonoOpen(false)}
        onAbonado={handleAbonadoExito}
      />
    </div>
  )
}
