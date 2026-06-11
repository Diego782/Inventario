"use client"

/**
 * components/usuarios/invitaciones-table.tsx
 *
 * Lista las invitaciones de la organización activa.
 * Muestra columnas: Correo, Rol, Estado (Badge con color por estado),
 * Expira, Acciones (botón Revocar para invitaciones pendientes si tiene permiso).
 *
 * Fetches GET /api/organizaciones/{orgId}/invitaciones
 * Revoca con DELETE /api/invitaciones/{id}
 *
 * Validates: Requirements R9.7, R9.10
 */

import * as React from "react"
import { format, parseISO } from "date-fns"
import { es } from "date-fns/locale"
import { Ban, RefreshCw } from "lucide-react"
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
import { usePermisos } from "@/hooks/use-permisos"
import type { InvitacionDTO } from "@/lib/api/serializadores-auth"
import { toast } from "sonner"

// ---- Tipos ----

type EstadoInvitacion = "pendiente" | "aceptada" | "expirada" | "revocada"

interface InvitacionesTableProps {
  orgId: string
  /** Clave externa para forzar recarga (p.ej. tras invitar) */
  refreshKey?: number
}

// ---- Helpers de estilo ----

const ESTADO_CLASES: Record<EstadoInvitacion, string> = {
  pendiente: "bg-yellow-100 text-yellow-700 hover:bg-yellow-100 border-0",
  aceptada: "bg-green-100 text-green-700 hover:bg-green-100 border-0",
  expirada: "bg-muted text-muted-foreground hover:bg-muted border-0",
  revocada: "bg-red-100 text-red-700 hover:bg-red-100 border-0",
}

const ESTADO_ETIQUETA: Record<EstadoInvitacion, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  expirada: "Expirada",
  revocada: "Revocada",
}

function BadgeEstado({ estado }: { estado: string }) {
  const clave = estado as EstadoInvitacion
  return (
    <Badge
      variant="outline"
      className={`font-medium ${ESTADO_CLASES[clave] ?? "bg-muted text-muted-foreground border-0"}`}
    >
      {ESTADO_ETIQUETA[clave] ?? estado}
    </Badge>
  )
}

// ---- Skeleton de carga ----

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

export function InvitacionesTable({ orgId, refreshKey }: InvitacionesTableProps) {
  const { puede } = usePermisos()
  const puedeAdministrar = puede("usuarios", "administrar")

  const [invitaciones, setInvitaciones] = React.useState<InvitacionDTO[]>([])
  const [cargando, setCargando] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [revocando, setRevocando] = React.useState<string | null>(null)

  const cargar = React.useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizaciones/${orgId}/invitaciones`, {
        credentials: "include",
      })
      if (!res.ok) {
        throw new Error("No se pudieron cargar las invitaciones")
      }
      const data: InvitacionDTO[] = await res.json()
      setInvitaciones(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar las invitaciones"
      )
    } finally {
      setCargando(false)
    }
  }, [orgId])

  React.useEffect(() => {
    cargar()
  }, [cargar, refreshKey])

  async function revocar(invitacion: InvitacionDTO) {
    setRevocando(invitacion.id)
    try {
      const res = await fetch(`/api/invitaciones/${invitacion.id}`, {
        method: "DELETE",
        credentials: "include",
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const codigo = data?.error?.codigo
        if (codigo === "INVITACION_NO_PENDIENTE") {
          toast.error("La invitación ya no está pendiente")
        } else {
          toast.error(
            data?.error?.mensaje ?? "No se pudo revocar la invitación"
          )
        }
        return
      }

      toast.success(`Invitación a ${invitacion.correo} revocada`)
      // Actualizar estado local sin recargar
      setInvitaciones((prev) =>
        prev.map((inv) =>
          inv.id === invitacion.id ? { ...inv, estado: "revocada" } : inv
        )
      )
    } catch {
      toast.error("No se pudo conectar con el servidor")
    } finally {
      setRevocando(null)
    }
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button variant="outline" size="sm" onClick={cargar}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Reintentar
        </Button>
      </div>
    )
  }

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Correo</TableHead>
            <TableHead>Rol</TableHead>
            <TableHead>Estado</TableHead>
            <TableHead>Expira</TableHead>
            {puedeAdministrar && (
              <TableHead className="w-[100px] text-right">Acciones</TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {cargando ? (
            Array.from({ length: 3 }).map((_, i) => <FilaSkeleton key={i} />)
          ) : invitaciones.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={puedeAdministrar ? 5 : 4}
                className="py-8 text-center text-sm text-muted-foreground"
              >
                No hay invitaciones registradas
              </TableCell>
            </TableRow>
          ) : (
            invitaciones.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.correo}</TableCell>
                <TableCell>{inv.rol}</TableCell>
                <TableCell>
                  <BadgeEstado estado={inv.estado} />
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {format(parseISO(inv.expira_en), "d MMM yyyy, HH:mm", {
                    locale: es,
                  })}
                </TableCell>
                {puedeAdministrar && (
                  <TableCell className="text-right">
                    {inv.estado === "pendiente" && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-destructive hover:text-destructive"
                        disabled={revocando === inv.id}
                        onClick={() => revocar(inv)}
                        aria-label={`Revocar invitación a ${inv.correo}`}
                      >
                        <Ban className="mr-1 h-4 w-4" />
                        {revocando === inv.id ? "Revocando…" : "Revocar"}
                      </Button>
                    )}
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}
