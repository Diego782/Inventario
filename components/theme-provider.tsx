"use client"

import { createContext, useContext, useEffect, useState, ReactNode } from "react"

type Theme = "light" | "dark"

interface ThemeColors {
  hue: number
  saturation: number
  lightness: number
  name: string
}

interface ThemeContextType {
  theme: Theme
  setTheme: (theme: Theme) => void
  primaryColor: ThemeColors
  setPrimaryColor: (color: ThemeColors) => void
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined)

// Colores pastel predefinidos (saturacion baja ~0.12, luminosidad alta ~0.65)
export const presetColors: ThemeColors[] = [
  { hue: 25, saturation: 0.12, lightness: 0.58, name: "Coral" },
  { hue: 250, saturation: 0.12, lightness: 0.65, name: "Lavanda" },
  { hue: 145, saturation: 0.1, lightness: 0.6, name: "Menta" },
  { hue: 35, saturation: 0.12, lightness: 0.65, name: "Melocoton" },
  { hue: 280, saturation: 0.1, lightness: 0.65, name: "Lila" },
  { hue: 330, saturation: 0.1, lightness: 0.68, name: "Rosa" },
  { hue: 180, saturation: 0.1, lightness: 0.6, name: "Aqua" },
  { hue: 60, saturation: 0.1, lightness: 0.7, name: "Vainilla" },
]

function updateCSSVariables(color: ThemeColors, isDark: boolean) {
  const root = document.documentElement
  const { hue, saturation, lightness } = color
  const s = saturation
  
  if (isDark) {
    // Dark mode
    root.style.setProperty("--primary", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--primary-foreground", `oklch(0.15 0 0)`)
    root.style.setProperty("--accent", `oklch(0.25 ${s * 0.3} ${hue})`)
    root.style.setProperty("--accent-foreground", `oklch(${lightness} ${s * 0.8} ${hue})`)
    root.style.setProperty("--ring", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--chart-1", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--chart-2", `oklch(${lightness + 0.05} ${s * 0.8} ${hue})`)
    root.style.setProperty("--chart-3", `oklch(${lightness - 0.1} ${s} ${hue})`)
    root.style.setProperty("--chart-4", `oklch(${lightness + 0.1} ${s * 0.5} ${hue})`)
    root.style.setProperty("--chart-5", `oklch(${lightness - 0.05} ${s * 1.1} ${hue})`)
    // Sidebar
    root.style.setProperty("--sidebar", `oklch(0.22 0 0)`)
    root.style.setProperty("--sidebar-foreground", `oklch(0.95 0 0)`)
    root.style.setProperty("--sidebar-primary", `oklch(0.95 0 0)`)
    root.style.setProperty("--sidebar-primary-foreground", `oklch(${lightness} ${s} ${hue})`)
    // Elemento activo con color personalizado
    root.style.setProperty("--sidebar-accent", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--sidebar-accent-foreground", `oklch(0.15 0 0)`)
    root.style.setProperty("--sidebar-border", `oklch(0.35 0 0)`)
    // Hover muy suave
    root.style.setProperty("--sidebar-hover", `oklch(${lightness} ${s * 0.3} ${hue} / 0.15)`)
  } else {
    // Light mode
    root.style.setProperty("--primary", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--primary-foreground", `oklch(1 0 0)`)
    root.style.setProperty("--accent", `oklch(0.96 ${s * 0.15} ${hue})`)
    root.style.setProperty("--accent-foreground", `oklch(${lightness - 0.1} ${s} ${hue})`)
    root.style.setProperty("--ring", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--chart-1", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--chart-2", `oklch(${lightness + 0.1} ${s * 0.8} ${hue})`)
    root.style.setProperty("--chart-3", `oklch(${lightness - 0.15} ${s} ${hue})`)
    root.style.setProperty("--chart-4", `oklch(${lightness + 0.15} ${s * 0.5} ${hue})`)
    root.style.setProperty("--chart-5", `oklch(${lightness - 0.05} ${s * 1.1} ${hue})`)
    // Sidebar
    root.style.setProperty("--sidebar", `oklch(0.93 0 0)`)
    root.style.setProperty("--sidebar-foreground", `oklch(0.15 0 0)`)
    root.style.setProperty("--sidebar-primary", `oklch(0.15 0 0)`)
    root.style.setProperty("--sidebar-primary-foreground", `oklch(${lightness} ${s} ${hue})`)
    // Elemento activo con color personalizado
    root.style.setProperty("--sidebar-accent", `oklch(${lightness} ${s} ${hue})`)
    root.style.setProperty("--sidebar-accent-foreground", `oklch(1 0 0)`)
    root.style.setProperty("--sidebar-border", `oklch(0.85 0 0)`)
    // Hover muy suave
    root.style.setProperty("--sidebar-hover", `oklch(${lightness} ${s * 0.25} ${hue} / 0.12)`)
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>("light")
  const [primaryColor, setPrimaryColor] = useState<ThemeColors>(presetColors[0])
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    const savedTheme = localStorage.getItem("invenpro-theme") as Theme | null
    const savedColor = localStorage.getItem("invenpro-color")
    
    if (savedTheme) {
      setTheme(savedTheme)
    }
    
    if (savedColor) {
      try {
        setPrimaryColor(JSON.parse(savedColor))
      } catch {
        // Use default color
      }
    }
    
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return
    
    const root = document.documentElement
    
    if (theme === "dark") {
      root.classList.add("dark")
    } else {
      root.classList.remove("dark")
    }
    
    updateCSSVariables(primaryColor, theme === "dark")
    
    localStorage.setItem("invenpro-theme", theme)
    localStorage.setItem("invenpro-color", JSON.stringify(primaryColor))
  }, [theme, primaryColor, mounted])

  if (!mounted) {
    return null
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme, primaryColor, setPrimaryColor }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider")
  }
  return context
}
