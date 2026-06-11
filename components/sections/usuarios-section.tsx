"use client"

/**
 * components/sections/usuarios-section.tsx
 *
 * Sección Empleados — gestión de miembros, roles e invitaciones.
 * La pestaña Miembros muestra cards visuales al estilo empleados.
 * Pestañas Roles e Invitaciones mantienen sus tablas originales.
 * Visible solo con permiso (usuarios, ver).
 *
 * Validates: Requirements R18.5, R12.3
 */

import * as React from "react"
import { useState, useEffect, useCallback } from "react"
import {
  UserPlus,
  Users,
  Search,
  Filter,
  Mail,
  MoreVertical,
  Briefcase,
  AlertCircle,
  RefreshCw,
} from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { usePermisos } from "@/hooks/use-permisos"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { RolesTable } from "@/components/usuarios/roles-table"
import { InvitacionesTable } from "@/components/usuarios/invitaciones-table"
import { InvitarMiembroDialog } from "@/components/usuarios/invitar-miembro-dialog"
import type { MiembroDTO } from "@/lib/api/serializadores-auth"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getInitials(nombre: string) {
  return nombre
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase()
}

function getEstadoVariant(
  estado: string
): "default" | "secondary" | "destructive" | "outline" {
  switch (estado) {
    case "activa":
      return "default"
    case "suspendida":
      return "destructive"
    default:
      return "secondary"
  }
}

function getEstadoLabel(estado: string) {
  switch (estado) {
    case "activa":
      return "Activo"
    case "suspendida":
      return "Suspendido"
    default:
      return estado
  }
}

// ---------------------------------------------------------------------------
// MiembrosGrid — pestaña principal con cards visuales
// ---------------------------------------------------------------------------

function MiembrosGrid({ orgId }: { orgId: string }) {
  const [miembros, setMiembros] = useState<MiembroDTO[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState("")

  const cargarMiembros = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/organizaciones/${orgId}/miembros`, {
        credentials: "include",
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(
          data?.error?.mensaje ?? "No se pudieron cargar los miembros"
        )
      }
      const data: MiembroDTO[] = await res.json()
      setMiembros(data)
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "No se pudieron cargar los miembros"
      )
    } finally {
      setCargando(false)
    }
  }, [orgId])

  useEffect(() => {
    cargarMiembros()
  }, [cargarMiembros])

  const miembrosFiltrados = miembros.filter((m) => {
    const term = searchTerm.toLowerCase()
    return (
      m.usuario.nombre.toLowerCase().includes(term) ||
      m.usuario.correo.toLowerCase().includes(term) ||
      m.rol.toLowerCase().includes(term)
    )
  })

  const totalMiembros = miembros.length
  const activos = miembros.filter((m) => m.estado === "activa").length
  const suspendidos = miembros.filter((m) => m.estado === "suspendida").length

  return (
    <div className="space-y-6">
      {/* Buscador y acciones */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar miembro..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filtrar
          </Button>
          {/* BETA: Botón Exportar oculto — sin funcionalidad implementada, se habilitará en próxima versión
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          */}
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Miembros</p>
          {cargando ? (
            <Skeleton className="h-8 w-12 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-foreground">{totalMiembros}</p>
          )}
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Activos</p>
          {cargando ? (
            <Skeleton className="h-8 w-12 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-green-600">{activos}</p>
          )}
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Suspendidos</p>
          {cargando ? (
            <Skeleton className="h-8 w-12 mt-1" />
          ) : (
            <p className="text-2xl font-bold text-destructive">{suspendidos}</p>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <p className="text-sm flex-1">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={cargarMiembros}
            className="shrink-0"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Reintentar
          </Button>
        </div>
      )}

      {/* Skeletons */}
      {cargando && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="bg-card rounded-xl border border-border overflow-hidden"
            >
              <Skeleton className="h-20 w-full" />
              <div className="pt-12 pb-6 px-6 space-y-3">
                <Skeleton className="h-5 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Cards grid */}
      {!cargando && !error && (
        <>
          {miembrosFiltrados.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
              <Briefcase className="w-12 h-12 mb-4 opacity-30" />
              <p className="text-sm">
                {searchTerm
                  ? "No se encontraron miembros con ese criterio"
                  : "No hay miembros en esta organización"}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {miembrosFiltrados.map((miembro) => (
                <div
                  key={miembro.id}
                  className="bg-card rounded-xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
                >
                  {/* Header con gradiente */}
                  <div className="h-20 bg-primary/30 relative">
                    <div className="absolute -bottom-8 left-6">
                      <div className="w-16 h-16 rounded-full bg-card border-4 border-card flex items-center justify-center shadow-lg">
                        <span className="text-xl font-bold text-primary">
                          {getInitials(miembro.usuario.nombre)}
                        </span>
                      </div>
                    </div>
                    <button className="absolute top-3 right-3 p-2 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors">
                      <MoreVertical className="w-4 h-4 text-primary" />
                    </button>
                  </div>

                  {/* Contenido */}
                  <div className="pt-12 pb-6 px-6">
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-foreground">
                          {miembro.usuario.nombre}
                        </h3>
                        <p className="text-sm text-muted-foreground">
                          {miembro.usuario.correo}
                        </p>
                      </div>
                      <Badge variant={getEstadoVariant(miembro.estado)}>
                        {getEstadoLabel(miembro.estado)}
                      </Badge>
                    </div>

                    <div className="space-y-3 text-sm">
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Briefcase className="w-4 h-4 shrink-0" />
                        <Badge variant="outline" className="text-xs font-medium">
                          {miembro.rol}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 text-muted-foreground">
                        <Mail className="w-4 h-4 shrink-0" />
                        <span className="truncate">{miembro.usuario.correo}</span>
                      </div>
                    </div>

                    <div className="mt-4 pt-4 border-t border-border flex gap-2">
                      <Button variant="outline" size="sm" className="flex-1">
                        Ver Perfil
                      </Button>
                      <Button variant="outline" size="sm" className="flex-1">
                        Horarios
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// UsuariosSection — sección principal
// ---------------------------------------------------------------------------

export function UsuariosSection() {
  const { puede } = usePermisos()
  const { organizacion } = useOrganizacionActiva()

  const [invitarOpen, setInvitarOpen] = React.useState(false)
  const [invitacionesKey, setInvitacionesKey] = React.useState(0)

  function handleInvitado() {
    setInvitacionesKey((k) => k + 1)
  }

  if (!organizacion) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-2xl font-semibold tracking-tight">Empleados</h2>
        </div>
        <Card>
          <CardContent className="py-8">
            <p className="text-sm text-muted-foreground text-center">
              Selecciona una organización para gestionar sus empleados.
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  const orgId = organizacion.id
  const puedeAdministrar = puede("usuarios", "administrar")

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Users className="h-6 w-6 text-muted-foreground" />
          <h2 className="text-2xl font-semibold tracking-tight">Empleados</h2>
        </div>

        {puedeAdministrar && (
          <Button onClick={() => setInvitarOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" aria-hidden="true" />
            Invitar miembro
          </Button>
        )}
      </div>

      {/* Pestañas */}
      <Tabs defaultValue="miembros">
        <TabsList>
          <TabsTrigger value="miembros">Miembros</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
          <TabsTrigger value="invitaciones">Invitaciones</TabsTrigger>
        </TabsList>

        <TabsContent value="miembros" className="mt-4">
          <MiembrosGrid orgId={orgId} />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <RolesTable orgId={orgId} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="invitaciones" className="mt-4">
          <Card>
            <CardContent className="pt-6">
              <InvitacionesTable orgId={orgId} refreshKey={invitacionesKey} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {puedeAdministrar && (
        <InvitarMiembroDialog
          open={invitarOpen}
          onOpenChange={setInvitarOpen}
          orgId={orgId}
          onInvitado={handleInvitado}
        />
      )}
    </div>
  )
}
