"use client"

import { useState } from "react"
import { ThemeProvider } from "@/components/theme-provider"
import { Sidebar } from "@/components/sidebar"
import { Header } from "@/components/header"
import { DashboardSection } from "@/components/sections/dashboard-section"
import { InventarioSection } from "@/components/sections/inventario-section"
import { VentasSection } from "@/components/sections/ventas-section"
import { FiadoresSection } from "@/components/sections/fiadores-section"
import { EmpleadosSection } from "@/components/sections/empleados-section"
import { HorariosSection } from "@/components/sections/horarios-section"
import { ConfiguracionSection } from "@/components/sections/configuracion-section"

export default function HomePage() {
  const [activeSection, setActiveSection] = useState("Dashboard")
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)

  const renderSection = () => {
    switch (activeSection) {
      case "Dashboard":
        return <DashboardSection />
      case "Inventario":
        return <InventarioSection />
      case "Ventas":
        return <VentasSection />
      case "Fiadores":
        return <FiadoresSection />
      case "Empleados":
        return <EmpleadosSection />
      case "Horarios":
        return <HorariosSection />
      case "Configuracion":
        return <ConfiguracionSection />
      default:
        return <DashboardSection />
    }
  }

  return (
    <ThemeProvider>
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
    </ThemeProvider>
  )
}
