"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  LayoutDashboard,
  Package,
  ShoppingCart,
  Users,
  UserCheck,
  Clock,
  Settings,
  ChevronLeft,
  ChevronRight,
  LogOut,
  IdCard,
} from "lucide-react"
import { usePermisos } from "@/hooks/use-permisos"
import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { LABEL_A_SECCION } from "@/lib/auth/secciones"
import { LogoOrganizacion } from "@/components/configuracion/logo-organizacion"
import { MARCA } from "@/lib/marca"

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Package, label: "Inventario" },
  { icon: ShoppingCart, label: "Ventas" },
  { icon: IdCard, label: "Clientes" },
  // BETA: Módulo Fiadores oculto — se habilitará en próxima versión
  // { icon: UserCheck, label: "Fiadores" },
  { icon: Users, label: "Empleados" },
  { icon: Clock, label: "Horarios" },
  { icon: Settings, label: "Configuracion" },
]

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)
  const { puede } = usePermisos()
  const { usuario, logout } = useSesion()
  const { organizacion, organizaciones } = useOrganizacionActiva()

  // Filtrar items por permiso (seccion, "ver")
  const itemsVisibles = menuItems.filter((item) => {
    const seccion = LABEL_A_SECCION[item.label]
    if (!seccion) return true // si no hay mapeo, mostrar por defecto
    return puede(seccion, "ver")
  })

  // Obtener el rol del usuario en la organización activa
  const rolActual = organizacion
    ? organizaciones.find((o) => o.id === organizacion.id)?.rol ?? null
    : null

  // Iniciales para el avatar
  const iniciales = usuario?.nombre
    ? usuario.nombre
        .split(" ")
        .slice(0, 2)
        .map((p) => p[0]?.toUpperCase() ?? "")
        .join("")
    : "?"

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 h-screen sticky top-0",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-6 border-b border-sidebar-border">
        {organizacion?.logo ? (
          <LogoOrganizacion
            logo={organizacion.logo}
            nombre={organizacion.nombre}
            aspecto={organizacion.logo_aspecto ?? "1:1"}
            tamanoBase={40}
            soloLogo
          />
        ) : (
          <div className="flex items-center justify-center w-10 h-10 bg-sidebar-primary rounded-lg shrink-0 shadow-sm">
            <Package className="w-6 h-6 text-sidebar-primary-foreground" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0">
            <h1 className="text-xl font-bold truncate">
              {organizacion?.nombre ?? (MARCA.nombre || MARCA.fallback)}
            </h1>
            <p className="text-xs text-sidebar-foreground/60 truncate">Sistema de Gestion</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1.5">
        {itemsVisibles.map((item) => {
          const isActive = activeSection === item.label
          return (
            <button
              key={item.label}
              onClick={() => onSectionChange(item.label)}
              className={cn(
                "group relative flex items-center w-full gap-3 px-4 py-3 rounded-xl transition-all duration-200 ease-out",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-md shadow-sidebar-accent/30 scale-[1.02]"
                  : "text-sidebar-foreground/75 hover:bg-[var(--sidebar-hover)] hover:text-sidebar-foreground hover:translate-x-1"
              )}
            >
              {/* Indicador lateral del item activo */}
              <span
                className={cn(
                  "absolute left-0 top-1/2 -translate-y-1/2 w-1 rounded-r-full bg-primary transition-all duration-300",
                  isActive ? "h-6 opacity-100" : "h-0 opacity-0"
                )}
              />
              <item.icon
                className={cn(
                  "w-5 h-5 flex-shrink-0 transition-transform duration-200",
                  isActive ? "scale-110" : "group-hover:scale-110"
                )}
              />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full gap-2 px-4 py-2 rounded-xl text-sidebar-foreground/75 hover:bg-[var(--sidebar-hover)] hover:text-sidebar-foreground transition-all duration-200"
        >
          {collapsed ? (
            <ChevronRight className="w-5 h-5" />
          ) : (
            <>
              <ChevronLeft className="w-5 h-5" />
              <span className="font-medium">Colapsar</span>
            </>
          )}
        </button>

        {!collapsed && (
          <div className="flex items-center gap-3 mt-4 p-3 rounded-xl bg-[var(--sidebar-hover)] transition-all duration-200">
            <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0 shadow-sm ring-2 ring-primary/20">
              <span className="text-sm font-bold text-primary-foreground">
                {iniciales}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm truncate text-sidebar-foreground">
                {usuario?.nombre ?? "—"}
              </p>
              <p className="text-xs text-sidebar-foreground/60 truncate">
                {rolActual ?? "—"}
              </p>
            </div>
            <button
              onClick={logout}
              className="p-2 rounded-lg text-sidebar-foreground/70 hover:bg-primary hover:text-primary-foreground transition-all duration-200 flex-shrink-0"
              title="Cerrar sesión"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
