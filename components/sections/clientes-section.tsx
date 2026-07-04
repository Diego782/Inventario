"use client"

/**
 * components/sections/clientes-section.tsx
 *
 * Sección de Clientes: tabla paginada (50/página), buscador y botón "Nuevo cliente".
 * Consume GET /api/clientes.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9,
 *            4.10, 4.11, 4.12, 4.13, 4.14
 */

import { useState, useEffect, useCallback } from "react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Search, Plus, MoreHorizontal, Pencil, Trash2, Users } from "lucide-react"
import { ClienteFormDialog } from "@/components/clientes/cliente-form-dialog"
import { EliminarClienteDialog } from "@/components/clientes/eliminar-cliente-dialog"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { ClienteDTO } from "@/lib/api/serializadores"

// ---- Tipos ----

type ListadoClientesResponse = {
  items: ClienteDTO[]
  total: number
  take: number
  skip: number
}

type AccionTipo = "crear" | "editar" | "eliminar"

interface EstadoDialog {
  tipo: AccionTipo | null
  cliente?: ClienteDTO
}

// ---- Skeleton de fila ----

function FilaSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 5 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ---- Componente principal ----

const PAGE_SIZE = 50

export function ClientesSection() {
  const [searchTerm, setSearchTerm] = useState("")
  const debouncedSearch = useDebouncedValue(searchTerm, 300)
  const [pagina, setPagina] = useState(0)
  const [datos, setDatos] = useState<ListadoClientesResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)
  const [estadoDialog, setEstadoDialog] = useState<EstadoDialog>({ tipo: null })

  // Resetear página al cambiar búsqueda
  useEffect(() => {
    setPagina(0)
  }, [debouncedSearch])

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("q", debouncedSearch)
      params.set("take", String(PAGE_SIZE))
      params.set("skip", String(pagina * PAGE_SIZE))

      const res = await fetch(`/api/clientes?${params.toString()}`, {
        credentials: "include",
      })

      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.mensaje ?? `Error ${res.status}`)
      }

      const json: ListadoClientesResponse = await res.json()
      setDatos(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar clientes")
    } finally {
      setCargando(false)
    }
  }, [debouncedSearch, pagina, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  function handleCerrarDialog() {
    setEstadoDialog({ tipo: null })
    setRefreshKey((k) => k + 1)
  }

  const totalPaginas = datos ? Math.ceil(datos.total / PAGE_SIZE) : 0
  const inicio = pagina * PAGE_SIZE + 1
  const fin = datos ? Math.min(inicio + datos.items.length - 1, datos.total) : 0

  // Determinar si el cliente seleccionado tiene historial
  // (la API responderá con CLIENTE_CON_HISTORIAL al intentar eliminar;
  //  no consultamos de antemano para no hacer una petición extra)
  const tieneHistorial = false

  return (
    <div className="space-y-6">
      {/* Header de acciones */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre, cédula o teléfono..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
            aria-label="Buscar clientes"
          />
        </div>
        <Button
          size="sm"
          className="bg-primary hover:bg-primary/90 text-primary-foreground shrink-0"
          onClick={() => setEstadoDialog({ tipo: "crear" })}
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo cliente
        </Button>
      </div>

      {/* Tarjeta de resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total clientes</p>
          <p className="text-2xl font-bold text-foreground">
            {datos ? datos.total.toLocaleString("es-MX") : "—"}
          </p>
        </div>
      </div>

      {/* Tabla de clientes */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Cédula</TableHead>
              <TableHead className="font-semibold">Nombre</TableHead>
              <TableHead className="font-semibold">Teléfono</TableHead>
              <TableHead className="font-semibold">Correo</TableHead>
              <TableHead className="font-semibold text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {/* Cargando */}
            {cargando &&
              Array.from({ length: 5 }).map((_, i) => <FilaSkeleton key={i} />)}

            {/* Error */}
            {!cargando && error && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-destructive"
                >
                  {error}
                </TableCell>
              </TableRow>
            )}

            {/* Vacío */}
            {!cargando && !error && datos?.items.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-12 text-muted-foreground"
                >
                  <div className="flex flex-col items-center gap-2">
                    <Users className="w-8 h-8 text-muted-foreground/50" />
                    <span>
                      {searchTerm
                        ? "No se encontraron clientes con esa búsqueda."
                        : "Aún no hay clientes registrados."}
                    </span>
                  </div>
                </TableCell>
              </TableRow>
            )}

            {/* Filas */}
            {!cargando &&
              !error &&
              datos?.items.map((cliente) => (
                <TableRow key={cliente.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-sm">
                    {cliente.cedula}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-primary">
                          {cliente.nombre
                            .split(" ")
                            .slice(0, 2)
                            .map((p) => p[0]?.toUpperCase() ?? "")
                            .join("")}
                        </span>
                      </div>
                      <span className="font-medium">{cliente.nombre}</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cliente.telefono}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {cliente.correo ?? (
                      <span className="text-muted-foreground/50 italic text-xs">
                        Sin correo
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          aria-label={`Acciones para ${cliente.nombre}`}
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() =>
                            setEstadoDialog({ tipo: "editar", cliente })
                          }
                        >
                          <Pencil className="w-4 h-4 mr-2" />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() =>
                            setEstadoDialog({ tipo: "eliminar", cliente })
                          }
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="w-4 h-4 mr-2" />
                          Eliminar
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>

        {/* Paginación */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            {cargando
              ? "Cargando..."
              : datos && datos.total > 0
              ? `Mostrando ${inicio}–${fin} de ${datos.total} clientes`
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
            <Button
              variant="outline"
              size="sm"
              disabled={pagina + 1 >= totalPaginas || cargando}
              onClick={() => setPagina((p) => p + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      </div>

      {/* Dialog crear / editar */}
      <ClienteFormDialog
        open={estadoDialog.tipo === "crear" || estadoDialog.tipo === "editar"}
        modo={estadoDialog.tipo === "crear" ? "crear" : "editar"}
        cliente={estadoDialog.cliente}
        onClose={handleCerrarDialog}
        onGuardado={handleCerrarDialog}
      />

      {/* Dialog eliminar */}
      <EliminarClienteDialog
        open={estadoDialog.tipo === "eliminar"}
        cliente={estadoDialog.cliente ?? null}
        tieneHistorial={tieneHistorial}
        onClose={handleCerrarDialog}
        onEliminado={handleCerrarDialog}
      />
    </div>
  )
}
