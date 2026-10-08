"use client"

import { useState } from "react"
import { Building2, Check, ChevronDown, Menu } from "lucide-react"
import { toast } from "sonner"
// import { Input } from "@/components/ui/input" // BETA: oculto junto al buscador
import { Button } from "@/components/ui/button"
import { CampanaNotificaciones } from "@/components/notificaciones/campana-notificaciones"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"

interface HeaderProps {
  title: string
  onMenuClick?: () => void
}

export function Header({ title, onMenuClick }: HeaderProps) {
  const { organizacion, organizaciones, seleccionar } = useOrganizacionActiva()
  const [cambiando, setCambiando] = useState(false)

  async function cambiarOrganizacion(id: string) {
    if (cambiando || id === organizacion?.id) return
    setCambiando(true)
    try {
      await seleccionar(id)
      // Reinicia las vistas y sus datos para que ninguna conserve la organización anterior.
      window.location.reload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "No se pudo cambiar de organización")
      setCambiando(false)
    }
  }

  return (
    <header className="flex items-center justify-between px-6 py-4 bg-card border-b border-border">
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          className="lg:hidden"
          onClick={onMenuClick}
        >
          <Menu className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-sm text-muted-foreground">
            {new Date().toLocaleDateString("es-ES", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* BETA: Buscador global oculto — sin funcionalidad implementada, se habilitará en próxima versión
        <div className="relative hidden md:block">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            className="pl-10 w-64 bg-muted border-none"
          />
        </div>
        */}
        
        {organizacion && organizaciones.length > 1 && <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={cambiando}
              aria-label={`Cambiar organización. Actual: ${organizacion.nombre}`} className="min-w-0 gap-2">
              <Building2 className="size-4 shrink-0" />
              <span className="max-w-20 truncate sm:max-w-40">{cambiando ? "Cambiando..." : organizacion.nombre}</span>
              <ChevronDown className="size-4 shrink-0" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-60">
            <DropdownMenuLabel>Organizaciones</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {organizaciones.map((opcion) => <DropdownMenuItem key={opcion.id}
              disabled={cambiando || opcion.id === organizacion.id}
              onSelect={() => void cambiarOrganizacion(opcion.id)}>
              <span className="min-w-0 flex-1 truncate">{opcion.nombre}</span>
              {opcion.id === organizacion.id && <Check className="size-4" />}
            </DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>}
        <CampanaNotificaciones />
      </div>
    </header>
  )
}
