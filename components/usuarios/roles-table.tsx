"use client"

/**
 * components/usuarios/roles-table.tsx
 *
 * Lista los Roles de la organización activa.
 * Marca el Rol_Propietario (es_sistema=true) como protegido con un Badge.
 * Las acciones crear/editar/eliminar se ocultan si el usuario no tiene
 * el permiso (usuarios, administrar).
 *
 * Validates: Requirements R11.3, R11.6
 */

import * as React from "react"
import { Plus, Pencil, Trash2, ShieldCheck, Shield } from "lucide-react"
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
import { Skeleton } from "@/components/ui/skeleton"
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
import { usePermisos } from "@/hooks/use-permisos"
import { RolFormDialog } from "@/components/usuarios/rol-form-dialog"
import type { RolDTO } from "@/lib/api/serializadores-auth"
import { toast } from "sonner"

// ---- Props ----

interface RolesTableProps {
  orgId: string
}

// ---- Skeleton de carga ----

function FilaSkeleton() {
  return (
    <TableRow>
      {Array.from({ length: 4 }).map((_, i) => (
        <TableCell key={i}>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      ))}
    </TableRow>
  )
}

// ---- Componente principal ----

export function RolesTable({ orgId }: RolesTableProps) {
  const { puede } = usePermisos()
  const puedeAdministrar = puede("usuarios", "administrar")

  const [roles, setRoles] = React.useState<RolDTO[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  // Estado del diálogo de formulario
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [rolEditandoId, setRolEditandoId] = React.useState<string | undefined>(undefined)

  // Estado del diálogo de confirmación de eliminación
  const [eliminarDialogOpen, setEliminarDialogOpen] = React.useState(false)
  const [rolEliminando, setRolEliminando] = React.useState<RolDTO | null>(null)
  const [eliminando, setEliminando] = React.useState(false)

  const cargarRoles = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizaciones/${orgId}/roles`)
      if (!res.ok) {
        throw new Error("No se pudieron cargar los roles")
      }
      const data: RolDTO[] = await res.json()
      setRoles(data)
    } catch (err) {
      const mensaje =
        err instanceof Error ? err.message : "Error al cargar los roles"
      setError(mensaje)
    } finally {
      setCargando(false)
    }
  }, [orgId])

  React.useEffect(() => {
    cargarRoles()
  }, [cargarRoles])

  function handleCrear() {
    setRolEditandoId(undefined)
    setDialogOpen(true)
  }

  function handleEditar(rol: RolDTO) {
    setRolEditandoId(rol.id)
    setDialogOpen(true)
  }

  function handleEliminarClick(rol: RolDTO) {
    setRolEliminando(rol)
    setEliminarDialogOpen(true)
  }

  async function handleEliminarConfirmar() {
    if (!rolEliminando) return
    setEliminando(true)
    try {
      const res = await fetch(`/api/roles/${rolEliminando.id}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo
        if (codigo === "ROL_PROPIETARIO_PROTEGIDO") {
          toast.error("El Rol Propietario no puede eliminarse")
        } else if (codigo === "PROPIETARIO_REQUERIDO") {
          toast.error("No se puede eliminar: la organización quedaría sin propietario")
        } else {
          toast.error(data?.error?.mensaje ?? "No se pudo eliminar el rol")
        }
        return
      }
      toast.success(`Rol "${rolEliminando.nombre}" eliminado`)
      setEliminarDialogOpen(false)
      setRolEliminando(null)
      await cargarRoles()
    } catch {
      toast.error("Error de conexión al eliminar el rol")
    } finally {
      setEliminando(false)
    }
  }

  function handleGuardado() {
    cargarRoles()
  }

  // ---- Render ----

  return (
    <div className="space-y-4">
      {/* Barra superior */}
      {puedeAdministrar && (
        <div className="flex justify-end">
          <Button size="sm" onClick={handleCrear}>
            <Plus className="h-4 w-4 mr-2" aria-hidden="true" />
            Nuevo rol
          </Button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}{" "}
          <button
            className="underline underline-offset-2 hover:no-underline"
            onClick={cargarRoles}
          >
            Reintentar
          </button>
        </div>
      )}

      {/* Tabla */}
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Permisos</TableHead>
              {puedeAdministrar && (
                <TableHead className="text-right">Acciones</TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargando ? (
              Array.from({ length: 3 }).map((_, i) => <FilaSkeleton key={i} />)
            ) : roles.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={puedeAdministrar ? 4 : 3}
                  className="h-24 text-center text-muted-foreground"
                >
                  No hay roles definidos
                </TableCell>
              </TableRow>
            ) : (
              roles.map((rol) => (
                <TableRow key={rol.id}>
                  {/* Nombre */}
                  <TableCell className="font-medium">
                    <div className="flex items-center gap-2">
                      {rol.es_sistema ? (
                        <ShieldCheck
                          className="h-4 w-4 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <Shield
                          className="h-4 w-4 text-muted-foreground shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      {rol.nombre}
                    </div>
                  </TableCell>

                  {/* Tipo */}
                  <TableCell>
                    {rol.es_sistema ? (
                      <Badge
                        variant="secondary"
                        className="bg-primary/10 text-primary border-0"
                      >
                        Sistema
                      </Badge>
                    ) : (
                      <Badge variant="outline">Personalizado</Badge>
                    )}
                  </TableCell>

                  {/* Permisos count */}
                  <TableCell className="text-muted-foreground text-sm">
                    {rol.permisos.length}{" "}
                    {rol.permisos.length === 1 ? "permiso" : "permisos"}
                  </TableCell>

                  {/* Acciones */}
                  {puedeAdministrar && (
                    <TableCell className="text-right">
                      {rol.es_sistema ? (
                        <span className="text-xs text-muted-foreground italic">
                          Protegido
                        </span>
                      ) : (
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Editar rol ${rol.nombre}`}
                            onClick={() => handleEditar(rol)}
                          >
                            <Pencil className="h-4 w-4" aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={`Eliminar rol ${rol.nombre}`}
                            className="text-destructive hover:text-destructive"
                            onClick={() => handleEliminarClick(rol)}
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de formulario (crear / editar) */}
      <RolFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        orgId={orgId}
        rolId={rolEditandoId}
        onGuardado={handleGuardado}
      />

      {/* Diálogo de confirmación de eliminación */}
      <AlertDialog
        open={eliminarDialogOpen}
        onOpenChange={setEliminarDialogOpen}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción eliminará el rol{" "}
              <strong>{rolEliminando?.nombre}</strong> de forma permanente. Los
              miembros con este rol perderán sus permisos asociados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={eliminando}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleEliminarConfirmar}
              disabled={eliminando}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {eliminando ? "Eliminando…" : "Eliminar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
