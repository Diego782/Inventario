"use client"

/**
 * components/ventas/ventas-table.tsx
 * Tabla de ventas con búsqueda debounced, paginación y acciones.
 * Cubre R20.1, R20.2, R20.3, R20.4, R20.5, R22.1, R23.4
 */

import { useState, useEffect, useCallback } from "react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Eye, Printer } from "lucide-react"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import { fetchJson, buildUrl } from "@/lib/api/cliente"
import type { VentaDTO } from "@/lib/api/serializadores"

// ---- Tipos ----

interface VentasTableProps {
  searchTerm: string
  refreshKey?: number
  onAccion: (tipo: "detalle" | "reimprimir", ventaId: string) => void
}

interface ListadoVentas {
  items: VentaDTO[]
  total: number
  take: number
  skip: number
}

const PAGE_SIZE = 20

// ---- Helpers de color ----

function badgeEstado(estado: string) {
  switch (estado.toLowerCase()) {
    case "completada":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
    case "pendiente":
      return "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-400 dark:border-yellow-800"
    case "cancelada":
      return "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

function badgeMetodoPago(metodo: string) {
  switch (metodo.toLowerCase()) {
    case "efectivo":
      return "bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800"
    case "tarjeta":
      return "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-800"
    case "transferencia":
      return "bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-400 dark:border-purple-800"
    case "fiado":
      return "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400 dark:border-orange-800"
    default:
      return "bg-muted text-muted-foreground border-border"
  }
}

function formatFecha(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("es-MX", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
  } catch {
    return iso
  }
}

function formatTotal(total: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
    minimumFractionDigits: 2,
  }).format(total)
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase()
}

// ---- Componente ----

export function VentasTable({ searchTerm, refreshKey, onAccion }: VentasTableProps) {
  const debouncedSearch = useDebouncedValue(searchTerm, 300)
  const [pagina, setPagina] = useState(0)
  const [datos, setDatos] = useState<ListadoVentas | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Resetear página cuando cambia la búsqueda
  useEffect(() => {
    setPagina(0)
  }, [debouncedSearch])

  const cargarVentas = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const url = buildUrl("/api/ventas", {
        q: debouncedSearch || undefined,
        take: PAGE_SIZE,
        skip: pagina * PAGE_SIZE,
      })
      const resultado = await fetchJson<ListadoVentas>(url)
      setDatos(resultado)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar ventas")
    } finally {
      setCargando(false)
    }
  }, [debouncedSearch, pagina, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarVentas()
  }, [cargarVentas])

  const totalPaginas = datos ? Math.ceil(datos.total / PAGE_SIZE) : 0
  const inicio = pagina * PAGE_SIZE + 1
  const fin = datos ? Math.min((pagina + 1) * PAGE_SIZE, datos.total) : 0

  // ---- Render: cargando ----
  if (cargando && !datos) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <span className="text-sm">Cargando ventas…</span>
        </div>
      </div>
    )
  }

  // ---- Render: error ----
  if (error) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
          <span className="text-sm text-destructive">{error}</span>
          <Button variant="outline" size="sm" onClick={cargarVentas}>
            Reintentar
          </Button>
        </div>
      </div>
    )
  }

  const ventas = datos?.items ?? []

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">Folio</TableHead>
            <TableHead className="font-semibold">Fecha</TableHead>
            <TableHead className="font-semibold text-center">Ítems</TableHead>
            <TableHead className="font-semibold">Total</TableHead>
            <TableHead className="font-semibold">Método de Pago</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {cargando ? (
            // Skeleton rows mientras recarga con datos previos
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}>
                    <div className="h-4 bg-muted animate-pulse rounded" />
                  </TableCell>
                ))}
              </TableRow>
            ))
          ) : ventas.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                {debouncedSearch
                  ? `No se encontraron ventas para "${debouncedSearch}"`
                  : "No hay ventas registradas"}
              </TableCell>
            </TableRow>
          ) : (
            ventas.map((venta) => (
              <TableRow key={venta.id} className="hover:bg-muted/30">
                <TableCell className="font-mono text-sm font-semibold">
                  {venta.folio}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatFecha(venta.creado_en)}
                </TableCell>
                <TableCell className="text-center">
                  {venta.items?.length ?? "—"}
                </TableCell>
                <TableCell className="font-semibold">
                  {formatTotal(venta.total)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={badgeMetodoPago(venta.metodo_pago)}
                  >
                    {capitalizar(venta.metodo_pago)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge
                    variant="outline"
                    className={badgeEstado(venta.estado)}
                  >
                    {capitalizar(venta.estado)}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Ver detalle de ${venta.folio}`}
                      onClick={() => onAccion("detalle", venta.id)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Reimprimir ${venta.folio}`}
                      onClick={() => onAccion("reimprimir", venta.id)}
                    >
                      <Printer className="w-4 h-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      {/* Paginación */}
      <div className="flex items-center justify-between px-4 py-3 border-t border-border">
        <p className="text-sm text-muted-foreground">
          {datos && datos.total > 0
            ? `Mostrando ${inicio}–${fin} de ${datos.total} ventas`
            : "Sin resultados"}
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pagina === 0 || cargando}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            Anterior
          </Button>
          {Array.from({ length: Math.min(totalPaginas, 5) }).map((_, i) => {
            // Mostrar páginas alrededor de la actual
            const offset = Math.max(0, Math.min(pagina - 2, totalPaginas - 5))
            const pageNum = i + offset
            return (
              <Button
                key={pageNum}
                variant="outline"
                size="sm"
                disabled={cargando}
                className={
                  pageNum === pagina
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : ""
                }
                onClick={() => setPagina(pageNum)}
              >
                {pageNum + 1}
              </Button>
            )
          })}
          <Button
            variant="outline"
            size="sm"
            disabled={pagina >= totalPaginas - 1 || cargando}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            Siguiente
          </Button>
        </div>
      </div>
    </div>
  )
}
