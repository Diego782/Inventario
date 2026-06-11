import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Toaster } from 'sonner'
import { ConfiguracionProvider } from '@/hooks/use-configuracion'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

/**
 * Script anti-flash de la Marca Dego (R5.1, R5.3).
 *
 * Se inyecta de forma síncrona en `<head>` (patrón equivalente al de
 * `next-themes`) y establece las variables CSS de color por defecto derivadas
 * de `COLOR_TEMA_DEGO` ({ hue: 0, saturation: 0, lightness: 0.18 }) ANTES del
 * primer render visible y antes del montaje de React. Así, en el arranque sin
 * sesión nunca se observa transitoriamente el Color_Tema de ninguna
 * Organización: la Pantalla_Login siempre arranca con la paleta negra/neutral.
 *
 * Reproduce la salida en modo claro de `aplicarColorTema`
 * (`lib/tema/aplicar-color.ts`) para `COLOR_TEMA_DEGO`: sidebar blanco con
 * acentos neutros y texto oscuro.
 */
const SCRIPT_ANTI_FLASH_DEGO = `(function(){try{var h=0,s=0,l=0.18;var p="oklch("+l+" "+s+" "+h+")";var tc="oklch(0.99 0 0)";var r=document.documentElement;r.style.setProperty("--primary",p);r.style.setProperty("--primary-foreground",tc);r.style.setProperty("--ring",p);r.style.setProperty("--sidebar","oklch(0.99 0 0)");r.style.setProperty("--sidebar-foreground","oklch(0.22 0 0)");r.style.setProperty("--sidebar-border","oklch(0.92 0 0)");r.style.setProperty("--sidebar-accent",p);r.style.setProperty("--sidebar-accent-foreground",tc);r.style.setProperty("--sidebar-hover","oklch(0.95 "+(s*0.5)+" "+h+")");r.style.setProperty("--sidebar-primary",p);r.style.setProperty("--sidebar-primary-foreground",tc);r.style.setProperty("--sidebar-ring",p);r.style.setProperty("--chart-1",p);r.style.setProperty("--chart-2","oklch("+(l+0.1)+" "+(s*0.8)+" "+h+")");r.style.setProperty("--chart-3","oklch("+(l-0.15)+" "+s+" "+h+")");r.style.setProperty("--chart-4","oklch("+(l+0.15)+" "+(s*0.5)+" "+h+")");r.style.setProperty("--chart-5","oklch("+(l-0.05)+" "+(s*1.1)+" "+h+")");}catch(e){}})();`

export const metadata: Metadata = {
  title: 'Dego - Sistema de Inventario y Ventas',
  description: 'Sistema profesional de inventariado, ventas, fiadores y gestion de empleados',
  generator: 'v0.app',
  icons: {
    icon: [
      {
        url: '/icon-light-32x32.png',
        media: '(prefers-color-scheme: light)',
      },
      {
        url: '/icon-dark-32x32.png',
        media: '(prefers-color-scheme: dark)',
      },
      {
        url: '/icon.svg',
        type: 'image/svg+xml',
      },
    ],
    apple: '/apple-icon.png',
  },
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es" className="bg-background" suppressHydrationWarning>
      <head>
        {/* R5.1, R5.3: fija la paleta Marca Dego antes del primer render */}
        <script dangerouslySetInnerHTML={{ __html: SCRIPT_ANTI_FLASH_DEGO }} />
      </head>
      <body className="font-sans antialiased">
        <ConfiguracionProvider>
          {children}
        </ConfiguracionProvider>
        <Toaster richColors closeButton position="top-right" />
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
