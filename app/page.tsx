"use client"

/**
 * app/page.tsx
 *
 * Shell principal de InvenPro. Envuelve el contenido con las compuertas de
 * autenticación y organización. La sección inicial se calcula como la primera
 * sección con permiso (seccion, ver) en lugar de "Dashboard" fijo (R12.6).
 *
 * Validates: Requirements R5.6, R5.7, R7.5, R12.6
 */

import { useState, useEffect, useRef } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { SesionProvider } from "@/hooks/use-sesion"
import { OrganizacionActivaProvider, useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { IdentidadVisualProvider } from "@/hooks/use-identidad-visual"
import { PermisosProvider, usePermisos } from "@/hooks/use-permisos"
import { AuthGate } from "@/components/auth/auth-gate"
import { InvitacionGate } from "@/components/auth/invitacion-gate"
import { OrganizacionGate } from "@/components/organizaciones/organizacion-gate"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { DashboardSection } from "@/components/sections/dashboard-section"
import { InventarioSection } from "@/components/sections/inventario-section"
import { VentasSection } from "@/components/sections/ventas-section"
import { FiadoresSection } from "@/components/sections/fiadores-section"
import { HorariosSection } from "@/components/sections/horarios-section"
import { ConfiguracionSection } from "@/components/sections/configuracion-section"
import { UsuariosSection } from "@/components/sections/usuarios-section"
import { ClientesSection } from "@/components/sections/clientes-section"
import { LABEL_A_SECCION } from "@/lib/auth/secciones"

// Orden de secciones para calcular la sección inicial por permiso
const ORDEN_SECCIONES = [
  "Dashboard",
  "Inventario",
  "Ventas",
  "Clientes",
  "Fiadores",
  "Empleados",
  "Horarios",
  "Configuracion",
] as const

/**
 * AppShell — shell autenticado con organización activa.
 * Calcula la sección inicial como la primera sección con permiso (seccion, ver).
 * R12.6: la sección inicial es la primera con permiso (seccion, ver), no "Dashboard" fijo.
 */
function AppShell() {
  const { puede, cargando: cargandoPermisos } = usePermisos()
  const [activeSection, setActiveSection] = useState("Dashboard")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  // Ref para saber si ya se aplicó la sección inicial por permisos
  const seccionInicialAplicada = useRef(false)

  // Una vez que los permisos cargan, ajustar la sección inicial a la primera
  // sección con permiso (seccion, ver) — R12.6
  useEffect(() => {
    if (cargandoPermisos || seccionInicialAplicada.current) return
    for (const label of ORDEN_SECCIONES) {
      const seccion = LABEL_A_SECCION[label]
      if (seccion && puede(seccion, "ver")) {
        setActiveSection(label)
        seccionInicialAplicada.current = true
        return
      }
    }
    // Si no hay ningún permiso ver, mantener Dashboard como fallback
    seccionInicialAplicada.current = true
  }, [cargandoPermisos, puede])

  const renderSection = () => {
    switch (activeSection) {
      case "Dashboard":
        return <DashboardSection />
      case "Inventario":
        return <InventarioSection />
      case "Ventas":
        return <VentasSection />
      case "Clientes":
        return <ClientesSection />
      case "Fiadores":
        return <FiadoresSection />
      case "Empleados":
        return <UsuariosSection />
      case "Horarios":
        return <HorariosSection />
      case "Configuracion":
        return <ConfiguracionSection />
      default:
        return <DashboardSection />
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 lg:relative lg:z-0
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
      `}>
        <Sidebar
          activeSection={activeSection}
          onSectionChange={(section) => {
            setActiveSection(section)
            setMobileMenuOpen(false)
          }}
        />
      </div>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-h-screen overflow-hidden">
        <Header
          title={activeSection}
          onMenuClick={() => setMobileMenuOpen(true)}
        />
        <div className="flex-1 overflow-auto p-6">
          {renderSection()}
        </div>
      </main>
    </div>
  )
}

/**
 * AppShellConPermisos — envuelve AppShell con PermisosProvider,
 * pasando el id de la organización activa para sincronizar los permisos.
 */
function AppShellConPermisos() {
  const { organizacion } = useOrganizacionActiva()

  return (
    <PermisosProvider organizacionId={organizacion?.id}>
      <AppShell />
    </PermisosProvider>
  )
}

export default function HomePage() {
  return (
    <ThemeProvider>
      <SesionProvider>
        <OrganizacionActivaProvider>
          <IdentidadVisualProvider>
            <AuthGate>
              <InvitacionGate>
                <OrganizacionGate>
                  <AppShellConPermisos />
                </OrganizacionGate>
              </InvitacionGate>
            </AuthGate>
          </IdentidadVisualProvider>
        </OrganizacionActivaProvider>
      </SesionProvider>
    </ThemeProvider>
  )
}
