"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Switch } from "@/components/ui/switch"
import { useTheme, presetColors } from "@/components/theme-provider"
import {
  Store,
  User,
  Bell,
  Shield,
  Database,
  Printer,
  CreditCard,
  FileText,
  ChevronRight,
  Sun,
  Moon,
  Palette,
  Check,
} from "lucide-react"
import { actualizarConfiguracionSchema } from "@/lib/schemas/configuracion"
import { useConfiguracion } from "@/hooks/use-configuracion"
import { toastDeError } from "@/lib/mensajes-error"
import type { z } from "zod"

type ConfigInput = z.infer<typeof actualizarConfiguracionSchema>

const settingsSections = [
  {
    title: "Negocio",
    description: "Informacion general de la empresa",
    icon: Store,
    items: ["Nombre del negocio", "Direccion", "Telefono", "Logotipo"]
  },
  {
    title: "Usuarios",
    description: "Gestion de cuentas y permisos",
    icon: User,
    items: ["Administradores", "Vendedores", "Roles y permisos"]
  },
  {
    title: "Notificaciones",
    description: "Alertas y comunicaciones",
    icon: Bell,
    items: ["Alertas de stock", "Notificaciones de ventas", "Recordatorios"]
  },
  {
    title: "Seguridad",
    description: "Configuracion de seguridad",
    icon: Shield,
    items: ["Cambiar contrasena", "Autenticacion", "Sesiones activas"]
  },
  {
    title: "Base de Datos",
    description: "Respaldos y mantenimiento",
    icon: Database,
    items: ["Crear respaldo", "Restaurar datos", "Limpiar registros"]
  },
  {
    title: "Impresion",
    description: "Configuracion de impresoras",
    icon: Printer,
    items: ["Tickets de venta", "Reportes", "Etiquetas de productos"]
  },
  {
    title: "Metodos de Pago",
    description: "Formas de pago aceptadas",
    icon: CreditCard,
    items: ["Efectivo", "Tarjetas", "Transferencias", "Fiado"]
  },
  {
    title: "Documentos",
    description: "Plantillas y formatos",
    icon: FileText,
    items: ["Facturas", "Cotizaciones", "Contratos de fiador"]
  },
]

interface ColorValue {
  hue: number
  saturation: number
  lightness: number
  name: string
}

function ColorCircle({ color, isSelected, onClick }: { color: ColorValue; isSelected: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group relative flex flex-col items-center gap-2"
      title={color.name}
    >
      <div
        className={`w-12 h-12 rounded-full transition-all duration-200 flex items-center justify-center shadow-sm ${
          isSelected ? "ring-2 ring-offset-2 ring-foreground scale-110" : "hover:scale-105"
        }`}
        style={{ backgroundColor: `oklch(${color.lightness} ${color.saturation} ${color.hue})` }}
      >
        {isSelected && <Check className="w-5 h-5 text-white drop-shadow-sm" />}
      </div>
      <span className="text-xs text-muted-foreground">{color.name}</span>
    </button>
  )
}

function AdvancedColorPicker({ currentColor, onSelect }: { currentColor: ColorValue; onSelect: (color: ColorValue) => void }) {
  const [hue, setHue] = useState(currentColor.hue)
  const [saturation, setSaturation] = useState(currentColor.saturation)
  const [lightness, setLightness] = useState(currentColor.lightness)

  const previewColor = `oklch(${lightness} ${saturation} ${hue})`

  const colorMatrix = []
  for (let l = 0.8; l >= 0.4; l -= 0.1) {
    const row = []
    for (let s = 0.05; s <= 0.25; s += 0.05) {
      row.push({ l, s })
    }
    colorMatrix.push(row)
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-6">
        <div
          className="w-24 h-24 rounded-2xl shadow-lg border border-border"
          style={{ backgroundColor: previewColor }}
        />
        <div className="flex-1 space-y-1">
          <p className="text-lg font-semibold text-foreground">Color Personalizado</p>
          <p className="text-sm text-muted-foreground">Ajusta el tono, intensidad y brillo</p>
          <div className="flex gap-2 mt-3">
            <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
              Tono: {Math.round(hue)}
            </span>
            <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
              Intensidad: {Math.round(saturation * 100)}%
            </span>
            <span className="text-xs px-2 py-1 rounded bg-muted text-muted-foreground">
              Brillo: {Math.round(lightness * 100)}%
            </span>
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Tono del Color</label>
        <div className="relative">
          <input
            type="range"
            min="0"
            max="360"
            value={hue}
            onChange={(e) => setHue(parseInt(e.target.value))}
            className="w-full h-8 rounded-lg appearance-none cursor-pointer"
            style={{
              background: `linear-gradient(to right, 
                oklch(0.65 0.12 0), 
                oklch(0.65 0.12 30),
                oklch(0.65 0.12 60), 
                oklch(0.65 0.12 90),
                oklch(0.65 0.12 120), 
                oklch(0.65 0.12 150),
                oklch(0.65 0.12 180), 
                oklch(0.65 0.12 210),
                oklch(0.65 0.12 240), 
                oklch(0.65 0.12 270),
                oklch(0.65 0.12 300), 
                oklch(0.65 0.12 330),
                oklch(0.65 0.12 360)
              )`
            }}
          />
          <div
            className="absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: `calc(${(hue / 360) * 100}% - 8px)`,
              backgroundColor: `oklch(0.65 0.12 ${hue})`
            }}
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium text-foreground">Intensidad y Brillo</label>
        <p className="text-xs text-muted-foreground mb-3">Haz clic para seleccionar la combinacion deseada</p>
        <div className="grid gap-1.5 p-3 bg-muted/30 rounded-xl">
          {colorMatrix.map((row, rowIndex) => (
            <div key={rowIndex} className="flex gap-1.5 justify-center">
              {row.map((cell, cellIndex) => {
                const isSelected = Math.abs(saturation - cell.s) < 0.025 && Math.abs(lightness - cell.l) < 0.05
                return (
                  <button
                    key={cellIndex}
                    onClick={() => {
                      setSaturation(cell.s)
                      setLightness(cell.l)
                    }}
                    className={`w-10 h-10 rounded-lg transition-all hover:scale-110 ${
                      isSelected ? "ring-2 ring-foreground ring-offset-2 scale-110" : "hover:ring-1 hover:ring-muted-foreground"
                    }`}
                    style={{ backgroundColor: `oklch(${cell.l} ${cell.s} ${hue})` }}
                    title={`Intensidad: ${Math.round(cell.s * 100)}%, Brillo: ${Math.round(cell.l * 100)}%`}
                  />
                )
              })}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-muted-foreground px-3">
          <span>Suave</span>
          <span>Intenso</span>
        </div>
      </div>

      <Button
        onClick={() => onSelect({ hue, saturation, lightness, name: "Personalizado" })}
        className="w-full"
      >
        Aplicar Este Color
      </Button>
    </div>
  )
}

export function ConfiguracionSection() {
  const { theme, setTheme, primaryColor, setPrimaryColor } = useTheme()
  const { data: config, actualizar } = useConfiguracion()

  const form = useForm<ConfigInput>({
    resolver: zodResolver(actualizarConfiguracionSchema),
    defaultValues: {
      porcentaje_impuesto: config.porcentaje_impuesto,
      etiqueta_ancho_mm: config.etiqueta_ancho_mm,
      etiqueta_alto_mm: config.etiqueta_alto_mm,
      ticket_ancho_mm: config.ticket_ancho_mm,
      imprimir_automaticamente: config.imprimir_automaticamente,
      permitir_sobreventa: config.permitir_sobreventa,
    },
  })

  // Sincronizar el formulario cuando la configuración cargue
  useEffect(() => {
    form.reset({
      porcentaje_impuesto: config.porcentaje_impuesto,
      etiqueta_ancho_mm: config.etiqueta_ancho_mm,
      etiqueta_alto_mm: config.etiqueta_alto_mm,
      ticket_ancho_mm: config.ticket_ancho_mm,
      imprimir_automaticamente: config.imprimir_automaticamente,
      permitir_sobreventa: config.permitir_sobreventa,
    })
  }, [config, form])

  async function onSubmit(values: ConfigInput) {
    try {
      await actualizar(values)
      toast.success("Configuración actualizada")
    } catch {
      toast.error(toastDeError("RED"))
    }
  }

  return (
    <div className="space-y-6">
      {/* Parámetros del Sistema */}
      <div className="space-y-6 max-w-2xl">
        <div>
          <h2 className="text-xl font-semibold">Configuración del Sistema</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Ajusta los parámetros de impuestos, etiquetas y comportamiento del sistema.
          </p>
        </div>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Impuestos */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <h3 className="font-medium">Impuestos</h3>
              <FormField
                control={form.control}
                name="porcentaje_impuesto"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Porcentaje de impuesto (%)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        max="100"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormDescription>
                      Ejemplo: 16 para IVA del 16%. Usa 0 para no aplicar impuesto.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Etiquetas */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <h3 className="font-medium">Etiquetas de Código de Barras</h3>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="etiqueta_ancho_mm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Ancho (mm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="20"
                          max="200"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 50)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="etiqueta_alto_mm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Alto (mm)</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          min="10"
                          max="150"
                          {...field}
                          onChange={(e) => field.onChange(parseInt(e.target.value) || 30)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            {/* Ticket */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <h3 className="font-medium">Ticket de Venta</h3>
              <FormField
                control={form.control}
                name="ticket_ancho_mm"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ancho del ticket (mm)</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="40"
                        max="200"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 80)}
                      />
                    </FormControl>
                    <FormDescription>
                      Típicamente 58mm o 80mm según tu impresora térmica.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="imprimir_automaticamente"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <FormLabel>Imprimir automáticamente</FormLabel>
                      <FormDescription>
                        Imprime el ticket sin requerir clic adicional al finalizar la venta.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            {/* Inventario */}
            <div className="bg-card rounded-lg border border-border p-4 space-y-4">
              <h3 className="font-medium">Inventario</h3>
              <FormField
                control={form.control}
                name="permitir_sobreventa"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border border-border p-3">
                    <div>
                      <FormLabel>Permitir sobreventa</FormLabel>
                      <FormDescription>
                        Permite vender productos aunque el stock sea insuficiente.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <Button type="submit" className="w-full sm:w-auto">
              Guardar cambios
            </Button>
          </form>
        </Form>
      </div>

      {/* Appearance Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 rounded-lg bg-primary/10">
            <Palette className="w-6 h-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">Apariencia</h2>
            <p className="text-muted-foreground">Personaliza el aspecto de tu sistema</p>
          </div>
        </div>

        {/* Theme Toggle */}
        <div className="mb-8">
          <h3 className="text-sm font-semibold text-foreground mb-4">Modo de Pantalla</h3>
          <div className="flex gap-3">
            <button
              onClick={() => setTheme("light")}
              className={`flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === "light"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`p-2 rounded-lg ${theme === "light" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Sun className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className={`font-medium ${theme === "light" ? "text-primary" : "text-foreground"}`}>Claro</p>
                <p className="text-xs text-muted-foreground">Fondo blanco</p>
              </div>
              {theme === "light" && <Check className="w-5 h-5 text-primary ml-auto" />}
            </button>

            <button
              onClick={() => setTheme("dark")}
              className={`flex-1 flex items-center justify-center gap-3 p-4 rounded-xl border-2 transition-all ${
                theme === "dark"
                  ? "border-primary bg-primary/5"
                  : "border-border hover:border-muted-foreground/30"
              }`}
            >
              <div className={`p-2 rounded-lg ${theme === "dark" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
                <Moon className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className={`font-medium ${theme === "dark" ? "text-primary" : "text-foreground"}`}>Oscuro</p>
                <p className="text-xs text-muted-foreground">Fondo negro</p>
              </div>
              {theme === "dark" && <Check className="w-5 h-5 text-primary ml-auto" />}
            </button>
          </div>
        </div>

        {/* Color Picker */}
        <div>
          <h3 className="text-sm font-semibold text-foreground mb-4">Color Principal</h3>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-4 mb-6">
            {presetColors.map((color) => (
              <ColorCircle
                key={color.name}
                color={color}
                isSelected={primaryColor.hue === color.hue && primaryColor.name === color.name}
                onClick={() => setPrimaryColor(color)}
              />
            ))}
          </div>

          <div className="border-t border-border pt-6">
            <AdvancedColorPicker
              currentColor={primaryColor}
              onSelect={(color) => setPrimaryColor(color)}
            />
          </div>
        </div>
      </div>

      {/* Business Info Card */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex items-start gap-6">
          <div className="w-20 h-20 rounded-xl bg-primary flex items-center justify-center">
            <Store className="w-10 h-10 text-primary-foreground" />
          </div>
          <div className="flex-1">
            <h2 className="text-xl font-bold text-foreground">Mi Negocio S.A. de C.V.</h2>
            <p className="text-muted-foreground">Av. Principal #123, Col. Centro</p>
            <p className="text-muted-foreground">Tel: +52 555 123 4567</p>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" size="sm">Editar Informacion</Button>
              <Button variant="outline" size="sm">Cambiar Logo</Button>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {settingsSections.map((section) => (
          <div
            key={section.title}
            className="bg-card rounded-xl border border-border shadow-sm p-6 hover:shadow-md transition-shadow cursor-pointer group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <section.icon className="w-6 h-6 text-primary" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-foreground">{section.title}</h3>
                  <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>
                <p className="text-sm text-muted-foreground mt-1">{section.description}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {section.items.map((item) => (
                    <span
                      key={item}
                      className="text-xs px-2 py-1 rounded-full bg-muted text-muted-foreground"
                    >
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
