"use client"

/**
 * components/inventario/inventario-table.tsx
 * Tabla principal del catálogo de productos.
 * Consume GET /api/productos con búsqueda debounced y paginación básica.
 * Requisitos: R6.1, R6.2, R6.3, R6.4, R7.4, R8.1, R8.2, R22.1, R22.2, R23.4
 */

import { useState, useEffect, useCallback } from "react"
import { Package, MoreHorizontal, Pencil, Trash2, ArrowUpDown, History, Tag } from "lucide-react"
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { useDebouncedValue } from "@/hooks/use-debounced-value"
import type { ProductoDTO, EstadoStock } from "@/lib/api/serializadores"
import type { FiltrosInventario } from "@/components/inventario/filtros-inventario"

// ---- Tipos ----

type ListadoResponse = {
  items: ProductoDTO[]
  total: number
  take: number
  skip: number
}

type AccionTipo = "editar" | "eliminar" | "ajustar-stock" | "historial" | "imprimir-etiqueta"

interface InventarioTableProps {
  searchTerm: string
  filtros?: FiltrosInventario
  refreshKey?: number
  onAccion: (tipo: AccionTipo, producto: ProductoDTO) => void
}

// ---- Helpers de estilo ----

const ESTADO_CLASES: Record<EstadoStock, string> = {
  "En Stock": "bg-green-100 text-green-700 hover:bg-green-100",
  "Bajo Stock": "bg-yellow-100 text-yellow-700 hover:bg-yellow-100",
  "Crítico": "bg-red-100 text-red-600 hover:bg-red-100",
}

function BadgeEstado({ estado }: { estado: EstadoStock }) {
  return (
    <Badge
      variant="outline"
      className={`border-0 font-medium ${ESTADO_CLASES[estado] ?? "bg-muted text-muted-foreground"}`}
    >
      {estado}
    </Badge>
  )
}

// ---- Skeleton de carga ----

function FilaSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 7 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ---- Componente principal ----

const PAGE_SIZE = 20

export function InventarioTable({ searchTerm, filtros, refreshKey = 0, onAccion }: InventarioTableProps) {
  const debouncedSearch = useDebouncedValue(searchTerm, 300)
  const [pagina, setPagina] = useState(0)
  const [datos, setDatos] = useState<ListadoResponse | null>(null)
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Serializar filtros para usarlos como dependencia estable del efecto
  const filtrosKey = JSON.stringify(filtros ?? {})

  // Resetear a página 0 cuando cambia la búsqueda o los filtros
  useEffect(() => {
    setPagina(0)
  }, [debouncedSearch, filtrosKey])

  const cargarDatos = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (debouncedSearch) params.set("q", debouncedSearch)
      // Añadir filtros avanzados
      if (filtros) {
        for (const [clave, valor] of Object.entries(filtros)) {
          if (valor !== undefined && valor !== "") {
            params.set(clave, String(valor))
          }
        }
      }
      params.set("take", String(PAGE_SIZE))
      params.set("skip", String(pagina * PAGE_SIZE))

      const res = await fetch(`/api/productos?${params.toString()}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body?.error?.mensaje ?? `Error ${res.status}`)
      }
      const json: ListadoResponse = await res.json()
      setDatos(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar productos")
    } finally {
      setCargando(false)
    }
  }, [debouncedSearch, filtrosKey, pagina, refreshKey]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    cargarDatos()
  }, [cargarDatos])

  const totalPaginas = datos ? Math.ceil(datos.total / PAGE_SIZE) : 0
  const inicio = pagina * PAGE_SIZE + 1
  const fin = datos ? Math.min(inicio + datos.items.length - 1, datos.total) : 0

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/50">
            <TableHead className="font-semibold">SKU</TableHead>
            <TableHead className="font-semibold">Producto</TableHead>
            <TableHead className="font-semibold">Categoría</TableHead>
            <TableHead className="font-semibold text-center">Stock</TableHead>
            <TableHead className="font-semibold">Precio Venta</TableHead>
            <TableHead className="font-semibold">Estado</TableHead>
            <TableHead className="font-semibold text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {/* Estado de carga */}
          {cargando && Array.from({ length: 5 }).map((_, i) => <FilaSkeleton key={i} />)}

          {/* Estado de error */}
          {!cargando && error && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-destructive">
                {error}
              </TableCell>
            </TableRow>
          )}

          {/* Estado vacío */}
          {!cargando && !error && datos?.items.length === 0 && (
            <TableRow>
              <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                No se encontraron productos
              </TableCell>
            </TableRow>
          )}

          {/* Filas de datos */}
          {!cargando && !error && datos?.items.map((producto) => (
            <TableRow key={producto.id} className="hover:bg-muted/30">
              <TableCell className="font-mono text-sm">{producto.sku}</TableCell>
              <TableCell>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center shrink-0">
                    <Package className="w-5 h-5 text-muted-foreground" />
                  </div>
                  <div>
                    <span className="font-medium">{producto.nombre}</span>
                    {producto.variantes && producto.variantes.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {producto.variantes.map((v) => `${v.talla}: ${v.stock_actual}`).join(" · ")}
                      </p>
                    )}
                    {!producto.variantes?.length && producto.talla && (
                      <p className="text-xs text-muted-foreground">Talla: {producto.talla}</p>
                    )}
                  </div>
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {producto.categoria_id ?? "—"}
              </TableCell>
              <TableCell className="text-center">
                <span className="font-semibold">{producto.stock_actual}</span>
                <span className="text-muted-foreground">/{producto.stock_minimo}</span>
              </TableCell>
              <TableCell className="font-semibold">
                {new Intl.NumberFormat("es-MX", {
                  style: "currency",
                  currency: "MXN",
                }).format(producto.precio_venta)}
              </TableCell>
              <TableCell>
                <BadgeEstado estado={producto.estado_stock} />
              </TableCell>
              <TableCell className="text-right">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label={`Acciones para ${producto.nombre}`}
                    >
                      <MoreHorizontal className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => onAccion("editar", producto)}
                      aria-label={`Editar ${producto.nombre}`}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      Editar
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onAccion("ajustar-stock", producto)}
                      aria-label={`Ajustar stock de ${producto.nombre}`}
                    >
                      <ArrowUpDown className="w-4 h-4 mr-2" />
                      Ajustar stock
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onAccion("historial", producto)}
                      aria-label={`Ver historial de ${producto.nombre}`}
                    >
                      <History className="w-4 h-4 mr-2" />
                      Ver historial
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      onClick={() => onAccion("imprimir-etiqueta", producto)}
                      aria-label={`Imprimir etiqueta de ${producto.nombre}`}
                    >
                      <Tag className="w-4 h-4 mr-2" />
                      Imprimir etiqueta
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => onAccion("eliminar", producto)}
                      aria-label={`Eliminar ${producto.nombre}`}
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
            ? `Mostrando ${inicio}–${fin} de ${datos.total} productos`
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
  )
}
