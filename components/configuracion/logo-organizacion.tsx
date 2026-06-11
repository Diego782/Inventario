"use client"

/**
 * components/configuracion/logo-organizacion.tsx
 * Renderiza el logo de la organización respetando su proporción, con un
 * fallback a la inicial del nombre cuando no hay logo. Reutilizable en el
 * sidebar y en la vista previa de configuración.
 */

import { Package } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AspectoLogo } from "@/lib/schemas/organizaciones"

interface LogoOrganizacionProps {
  logo?: string | null
  nombre: string
  aspecto?: AspectoLogo | string | null
  /** Alto base en px usado para calcular el ancho según la proporción. */
  tamanoBase?: number
  /** Si true, no renderiza el nombre al lado (solo el recuadro del logo). */
  soloLogo?: boolean
  className?: string
}

function dimensiones(aspecto: string, alto: number): { w: number; h: number } {
  const [aw, ah] = aspecto.split(":").map(Number)
  const rw = aw || 1
  const rh = ah || 1
  return { w: Math.round((alto * rw) / rh), h: alto }
}

export function LogoOrganizacion({
  logo,
  nombre,
  aspecto = "1:1",
  tamanoBase = 40,
  soloLogo = false,
  className,
}: LogoOrganizacionProps) {
  const asp = (aspecto as string) || "1:1"
  const { w, h } = dimensiones(asp, tamanoBase)

  const inicial = nombre?.trim()?.[0]?.toUpperCase() ?? "?"

  const caja = (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg bg-sidebar-primary flex items-center justify-center"
      style={{ width: w, height: h }}
    >
      {logo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={logo}
          alt={`Logo de ${nombre}`}
          className="h-full w-full object-cover"
          draggable={false}
        />
      ) : nombre ? (
        <span
          className="font-bold text-sidebar-primary-foreground"
          style={{ fontSize: Math.max(12, Math.round(h * 0.45)) }}
        >
          {inicial}
        </span>
      ) : (
        <Package className="text-sidebar-primary-foreground" style={{ width: h * 0.5, height: h * 0.5 }} />
      )}
    </div>
  )

  if (soloLogo) {
    return <div className={className}>{caja}</div>
  }

  return (
    <div className={cn("flex items-center gap-3", className)}>
      {caja}
      <div className="min-w-0">
        <p className="font-bold truncate">{nombre}</p>
      </div>
    </div>
  )
}
