"use client"

import { useState } from "react"
import Link from "next/link"
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
} from "lucide-react"

const menuItems = [
  { icon: LayoutDashboard, label: "Dashboard", href: "/" },
  { icon: Package, label: "Inventario", href: "/inventario" },
  { icon: ShoppingCart, label: "Ventas", href: "/ventas" },
  { icon: UserCheck, label: "Fiadores", href: "/fiadores" },
  { icon: Users, label: "Empleados", href: "/empleados" },
  { icon: Clock, label: "Horarios", href: "/horarios" },
  { icon: Settings, label: "Configuracion", href: "/configuracion" },
]

interface SidebarProps {
  activeSection: string
  onSectionChange: (section: string) => void
}

export function Sidebar({ activeSection, onSectionChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <aside
      className={cn(
        "flex flex-col bg-sidebar text-sidebar-foreground transition-all duration-300 h-screen sticky top-0",
        collapsed ? "w-20" : "w-64"
      )}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 p-6 border-b border-sidebar-border">
        <div className="flex items-center justify-center w-10 h-10 bg-sidebar-primary rounded-lg">
          <Package className="w-6 h-6 text-sidebar-primary-foreground" />
        </div>
        {!collapsed && (
          <div>
            <h1 className="text-xl font-bold">InvenPro</h1>
            <p className="text-xs text-sidebar-foreground/70">Sistema de Gestion</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {menuItems.map((item) => {
          const isActive = activeSection === item.label
          return (
            <button
              key={item.label}
              onClick={() => onSectionChange(item.label)}
              className={cn(
                "flex items-center w-full gap-3 px-4 py-3 rounded-lg transition-all duration-200",
                isActive
                  ? "bg-sidebar-accent text-sidebar-accent-foreground"
                  : "text-sidebar-foreground/80 hover:bg-[var(--sidebar-hover)] hover:text-sidebar-foreground"
              )}
            >
              <item.icon className="w-5 h-5 flex-shrink-0" />
              {!collapsed && <span className="font-medium">{item.label}</span>}
            </button>
          )
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="flex items-center justify-center w-full gap-2 px-4 py-2 rounded-lg hover:bg-sidebar-accent/50 transition-colors"
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
          <div className="flex items-center gap-3 mt-4 p-3 rounded-lg bg-sidebar-accent/30">
            <div className="w-10 h-10 rounded-full bg-sidebar-primary flex items-center justify-center">
              <span className="text-sm font-bold text-sidebar-primary-foreground">AD</span>
            </div>
            <div className="flex-1">
              <p className="font-medium text-sm">Admin</p>
              <p className="text-xs text-sidebar-foreground/70">Administrador</p>
            </div>
            <button className="p-2 hover:bg-sidebar-accent rounded-lg transition-colors">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </aside>
  )
}
