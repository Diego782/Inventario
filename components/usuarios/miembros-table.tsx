"use client"

/**
 * components/usuarios/miembros-table.tsx
 *
 * Tabla de membresías de la Organizacion_Activa.
 * Columnas: Nombre, Correo, Rol (Badge), Estado (Badge), Acciones.
 * Las acciones "Editar" y "Eliminar" se ocultan si el usuario no tiene (usuarios, administrar).
 * Consume GET /api/organizaciones/{orgId}/miembros.
 *
 * Validates: Requirements R11.8, R14.7
 */

import * as React from "react"
import { MoreHorizontal, Pencil, Trash2 } from "lucide-react"

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
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { Alert, AlertDescription } from "@/components/ui/alert"

import { usePermisos } from "@/hooks/use-permisos"
import { EditarMiembroDialog } from "@/components/usuarios/editar-miembro-dialog"
import type { MiembroDTO } from "@/lib/api/serializadores-auth"
import { toast } from "sonner"

interface MiembrosTableProps {
  orgId: string
}

export function MiembrosTable({ orgId }: MiembrosTableProps) {
  const { puede } = usePermisos()
  const puedeAdministrar = puede("usuarios", "administrar")

  const [miembros, setMiembros] = React.useState<MiembroDTO[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Estado del diálogo de edición
  const [dialogoEditarAbierto, setDialogoEditarAbierto] = React.useState(false)
  const [miembroSeleccionado, setMiembroSeleccionado] = React.useState<MiembroDTO | null>(null)

  // Estado del diálogo de confirmación de eliminación
  const [dialogoEliminarAbierto, setDialogoEliminarAbierto] = React.useState(false)
  const [miembroAEliminar, setMiembroAEliminar] = React.useState<MiembroDTO | null>(null)
  const [eliminando, setEliminando] = React.useState(false)

  const cargarMiembros = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizaciones/${orgId}/miembros`, {
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error("No se pudieron cargar los miembros")
      }
      const data: MiembroDTO[] = await res.json()
      setMiembros(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Ocurrió un error al cargar los miembros"
      )
    } finally {
      setCargando(false)
    }
  }, [orgId])

  React.useEffect(() => {
    cargarMiembros()
  }, [cargarMiembros])

  function handleEditar(miembro: MiembroDTO) {
    setMiembroSeleccionado(miembro)
    setDialogoEditarAbierto(true)
  }

  function handleConfirmarEliminar(miembro: MiembroDTO) {
    setMiembroAEliminar(miembro)
    setDialogoEliminarAbierto(true)
  }

  async function handleEliminar() {
    if (!miembroAEliminar) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/membresias/${miembroAEliminar.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo
        if (codigo === "ROL_PROPIETARIO_PROTEGIDO") {
          toast.error("No se puede eliminar al propietario de la organización")
        } else {
          toast.error(data?.error?.mensaje ?? "No se pudo eliminar el miembro")
        }
        return
      }

      toast.success(`${miembroAEliminar.usuario.nombre} eliminado de la organización`)
      setDialogoEliminarAbierto(false)
      setMiembroAEliminar(null)
      cargarMiembros()
    } catch {
      toast.error("No se pudo conectar con el servidor")
    } finally {
      setEliminando(false)
    }
  }

  if (cargando) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    )
  }

  if (miembros.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        No hay miembros en esta organización.
      </p>
    )
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Correo</TableHead>
              <TableHead>Rol</TableHead>
              <TableHead>Estado</TableHead>
              {puedeAdministrar && (
                <TableHead className="w-[80px] text-right">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {miembros.map((miembro) => (
              <TableRow key={miembro.id}>
                <TableCell className="font-medium">
                  {miembro.usuario.nombre}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {miembro.usuario.correo}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary">{miembro.rol}</Badge>
                </TableCell>
                <TableCell>
                  <EstadoBadge estado={miembro.estado} />
                </TableCell>
                {puedeAdministrar && (
                  <TableCell className="text-right">
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="Abrir menú de acciones"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => handleEditar(miembro)}
                          className="gap-2"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </DropdownMenuItem>
                        {!miembro.es_propietario && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              onClick={() => handleConfirmarEliminar(miembro)}
                              className="gap-2 text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                              Eliminar
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo editar */}
      {miembroSeleccionado && (
        <EditarMiembroDialog
          open={dialogoEditarAbierto}
          onOpenChange={setDialogoEditarAbierto}
          miembro={miembroSeleccionado}
          orgId={orgId}
          onEditado={cargarMiembros}
        />
      )}

      {/* Diálogo confirmar eliminación */}
      <AlertDialog
        open={dialogoEliminarAbierto}
        onOpenChange={setDialogoEliminarAbierto}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar miembro?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará a{" "}
              <span className="font-medium">
                {miembroAEliminar?.usuario.nombre}
              </span>{" "}
              ({miembroAEliminar?.usuario.correo}) de la organización. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEliminar}
              disabled={eliminando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {eliminando ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---- Helpers ----

function EstadoBadge({ estado }: { estado: string }) {
  if (estado === "activa") {
    return (
      <Badge
        variant="outline"
        className="border-green-600 text-green-700 dark:border-green-500 dark:text-green-400"
      >
        Activa
      </Badge>
    )
  }
  return (
    <Badge
      variant="outline"
      className="border-yellow-600 text-yellow-700 dark:border-yellow-500 dark:text-yellow-400"
    >
      Suspendida
    </Badge>
  )
}
