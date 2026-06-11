"use client"

/**
 * components/sections/horarios-section.tsx
 * Sección de Horarios conectada al backend real.
 * Consume GET /api/organizaciones/{id}/horarios y
 * GET /api/organizaciones/{id}/miembros para mostrar nombres.
 *
 * Validates: Requirements R14.6
 */

import { useState, useEffect, useCallback } from "react"
import { Plus, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { usePermisos } from "@/hooks/use-permisos"
import { AsignarHorarioDialog } from "@/components/horarios/asignar-horario-dialog"
import type { HorarioMiembroDTO, MiembroDTO } from "@/lib/api/serializadores-auth"

// ── Constantes ──────────────────────────────────────────────────────────────

const DIAS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

const TIPO_CONFIG: Record<
  string,
  { label: string; variant: "default" | "secondary" | "outline" | "destructive" }
> = {
  normal:      { label: "Normal",      variant: "default" },
  vacaciones:  { label: "Vacaciones",  variant: "secondary" },
  incapacidad: { label: "Incapacidad", variant: "destructive" },
  descanso:    { label: "Descanso",    variant: "outline" },
}

// ── Componente ───────────────────────────────────────────────────────────────

export function HorariosSection() {
  const { organizacion } = useOrganizacionActiva()
  const { puede } = usePermisos()

  const [horarios, setHorarios] = useState<HorarioMiembroDTO[]>([])
  const [miembros, setMiembros] = useState<MiembroDTO[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dialogoAbierto, setDialogoAbierto] = useState(false)

  // Mapa membresia_id → nombre del miembro para lookup rápido
  const nombrePorMembresia = Object.fromEntries(
    miembros.map((m) => [m.id, m.usuario.nombre])
  )

  const cargar = useCallback(async () => {
    if (!organizacion) return

    setCargando(true)
    setError(null)

    try {
      const [horariosRes, miembrosRes] = await Promise.all([
        fetch(`/api/organizaciones/${organizacion.id}/horarios`, {
          credentials: "include",
        }),
        fetch(`/api/organizaciones/${organizacion.id}/miembros`, {
          credentials: "include",
        }),
      ])

      if (!horariosRes.ok) {
        throw new Error("No se pudieron cargar los horarios")
      }

      const horariosData: HorarioMiembroDTO[] = await horariosRes.json()
      setHorarios(horariosData)

      if (miembrosRes.ok) {
        const miembrosData: MiembroDTO[] = await miembrosRes.json()
        setMiembros(miembrosData)
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "No se pudieron cargar los horarios"
      )
    } finally {
      setCargando(false)
    }
  }, [organizacion])

  useEffect(() => {
    cargar()
  }, [cargar])

  // ── Render: sin organización ─────────────────────────────────────────────
  if (!organizacion) {
    return (
      <div className="flex items-center justify-center h-40 text-muted-foreground">
        Selecciona una organización para ver los horarios.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Encabezado */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">Horarios</h2>
          <p className="text-sm text-muted-foreground">
            Turnos asignados a los miembros de la organización
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={cargar}
            disabled={cargando}
            aria-label="Recargar horarios"
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </Button>
          {puede("horarios", "crear") && (
            <Button
              size="sm"
              onClick={() => setDialogoAbierto(true)}
              disabled={cargando}
            >
              <Plus className="w-4 h-4 mr-2" />
              Asignar Horario
            </Button>
          )}
        </div>
      </div>

      {/* Leyenda de tipos */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary/10 border border-primary/30" />
          <span className="text-sm text-muted-foreground">Normal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted border border-border" />
          <span className="text-sm text-muted-foreground">Vacaciones</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-destructive/10 border border-destructive/30" />
          <span className="text-sm text-muted-foreground">Incapacidad</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-border border border-border" />
          <span className="text-sm text-muted-foreground">Descanso</span>
        </div>
      </div>

      {/* Estado de error */}
      {error && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 flex items-center justify-between">
          <p className="text-sm text-destructive">{error}</p>
          <Button variant="outline" size="sm" onClick={cargar}>
            Reintentar
          </Button>
        </div>
      )}

      {/* Tabla de horarios */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold text-foreground">Miembro</TableHead>
              <TableHead className="font-semibold text-foreground">Día</TableHead>
              <TableHead className="font-semibold text-foreground">Tipo</TableHead>
              <TableHead className="font-semibold text-foreground">Hora inicio</TableHead>
              <TableHead className="font-semibold text-foreground">Hora fin</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {cargando ? (
              // Skeleton mientras carga
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-4 w-14" /></TableCell>
                </TableRow>
              ))
            ) : horarios.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={5}
                  className="text-center py-10 text-muted-foreground"
                >
                  No hay horarios asignados.
                  {puede("horarios", "crear") && (
                    <span>
                      {" "}
                      <button
                        className="underline text-primary hover:text-primary/80"
                        onClick={() => setDialogoAbierto(true)}
                      >
                        Asigna el primero
                      </button>
                      .
                    </span>
                  )}
                </TableCell>
              </TableRow>
            ) : (
              horarios.map((h) => {
                const tipoConfig = TIPO_CONFIG[h.tipo] ?? {
                  label: h.tipo,
                  variant: "outline" as const,
                }
                const nombreMiembro =
                  nombrePorMembresia[h.membresia_id] ?? h.membresia_id

                return (
                  <TableRow key={h.id}>
                    <TableCell className="font-medium text-foreground">
                      {nombreMiembro}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {DIAS[h.dia] ?? `Día ${h.dia}`}
                    </TableCell>
                    <TableCell>
                      <Badge variant={tipoConfig.variant}>
                        {tipoConfig.label}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.hora_inicio ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {h.hora_fin ?? "—"}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Diálogo de asignación */}
      {puede("horarios", "crear") && (
        <AsignarHorarioDialog
          open={dialogoAbierto}
          onOpenChange={setDialogoAbierto}
          organizacionId={organizacion.id}
          miembros={miembros}
          onCreado={cargar}
        />
      )}
    </div>
  )
}
