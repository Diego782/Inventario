"use client"

/**
 * components/configuracion/organizacion-card.tsx
 * Tarjeta de identidad de la organización en Configuración.
 * Permite cambiar el nombre, subir/recortar el logo y elegir su proporción.
 * Muestra una vista previa de cómo se verá el logo + nombre en el sidebar.
 */

import { useRef, useState } from "react"
import { toast } from "sonner"
import { Building2, ImagePlus, Loader2, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { usePermisos } from "@/hooks/use-permisos"
import { toastDeError } from "@/lib/mensajes-error"
import { ASPECTOS_LOGO, type AspectoLogo } from "@/lib/schemas/organizaciones"
import { RecortarLogoDialog } from "@/components/configuracion/recortar-logo-dialog"
import { LogoOrganizacion } from "@/components/configuracion/logo-organizacion"

const ETIQUETAS_ASPECTO: Record<AspectoLogo, string> = {
  "1:1": "Cuadrado",
  "4:3": "Horizontal",
  "16:9": "Panorámico",
  "3:1": "Banner",
}

const MAX_ARCHIVO_BYTES = 5 * 1024 * 1024 // 5 MB de archivo de entrada

export function OrganizacionCard() {
  const { organizacion, actualizar } = useOrganizacionActiva()
  const { puede } = usePermisos()
  const puedeEditar = puede("configuracion", "administrar")

  const inputFileRef = useRef<HTMLInputElement>(null)

  const [nombre, setNombre] = useState("")
  const [aspecto, setAspecto] = useState<AspectoLogo>("1:1")
  const [logoBorrador, setLogoBorrador] = useState<string | null | undefined>(undefined)
  const [imagenParaRecortar, setImagenParaRecortar] = useState<string | null>(null)
  const [recortando, setRecortando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [inicializado, setInicializado] = useState(false)

  // Inicializar el formulario cuando carga la organización
  if (organizacion && !inicializado) {
    setNombre(organizacion.nombre)
    setAspecto((organizacion.logo_aspecto as AspectoLogo) ?? "1:1")
    setInicializado(true)
  }

  if (!organizacion) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Building2 className="w-5 h-5" />
          <span className="text-sm">Selecciona una organización para configurar su identidad.</span>
        </div>
      </div>
    )
  }

  // Logo efectivo a mostrar: borrador si se tocó, si no el actual
  const logoEfectivo = logoBorrador !== undefined ? logoBorrador : organizacion.logo

  function onElegirArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = "" // permite re-seleccionar el mismo archivo
    if (!file) return
    if (!file.type.startsWith("image/")) {
      toast.error("El archivo debe ser una imagen.")
      return
    }
    if (file.size > MAX_ARCHIVO_BYTES) {
      toast.error("La imagen es demasiado grande (máx. 5 MB).")
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      setImagenParaRecortar(reader.result as string)
      setRecortando(true)
    }
    reader.onerror = () => toast.error("No se pudo leer la imagen.")
    reader.readAsDataURL(file)
  }

  function onRecorteConfirmado(dataUrl: string) {
    setLogoBorrador(dataUrl)
    setRecortando(false)
    setImagenParaRecortar(null)
  }

  function reabrirRecorte() {
    // Reabrir el editor con el logo efectivo para reencuadrar
    if (logoEfectivo) {
      setImagenParaRecortar(logoEfectivo)
      setRecortando(true)
    }
  }

  function quitarLogo() {
    setLogoBorrador(null)
  }

  // Si cambia la proporción y ya hay una imagen origen, reabrir para reencuadrar
  function cambiarAspecto(nuevo: AspectoLogo) {
    setAspecto(nuevo)
  }

  const hayCambios =
    nombre.trim() !== organizacion.nombre ||
    (aspecto ?? "1:1") !== (organizacion.logo_aspecto ?? "1:1") ||
    logoBorrador !== undefined

  async function guardar() {
    if (!nombre.trim()) {
      toast.error("El nombre no puede estar vacío.")
      return
    }
    setGuardando(true)
    try {
      const cambios: { nombre?: string; logo?: string | null; logo_aspecto?: string | null } = {}
      if (nombre.trim() !== organizacion!.nombre) cambios.nombre = nombre.trim()
      if ((aspecto ?? "1:1") !== (organizacion!.logo_aspecto ?? "1:1")) cambios.logo_aspecto = aspecto
      if (logoBorrador !== undefined) cambios.logo = logoBorrador

      await actualizar(cambios)
      setLogoBorrador(undefined)
      toast.success("Organización actualizada")
    } catch (e) {
      toast.error(e instanceof Error ? e.message : toastDeError("RED"))
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-lg bg-primary/10">
          <Building2 className="w-6 h-6 text-primary" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-foreground">Mi Organización</h2>
          <p className="text-muted-foreground text-sm">
            Personaliza el nombre y el logo que aparecen en la aplicación.
          </p>
        </div>
      </div>

      <Separator />

      <div className="grid gap-6 md:grid-cols-2">
        {/* Columna izquierda: edición */}
        <div className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="org-nombre">Nombre de la organización</Label>
            <Input
              id="org-nombre"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              maxLength={160}
              disabled={!puedeEditar || guardando}
              placeholder="Nombre del negocio"
            />
          </div>

          <div className="space-y-2">
            <Label>Proporción del logo</Label>
            <div className="grid grid-cols-2 gap-2">
              {ASPECTOS_LOGO.map((a) => (
                <button
                  key={a}
                  type="button"
                  disabled={!puedeEditar}
                  onClick={() => cambiarAspecto(a)}
                  className={cn(
                    "flex items-center justify-between rounded-lg border px-3 py-2 text-sm transition-colors",
                    aspecto === a
                      ? "border-primary bg-primary/5 text-foreground"
                      : "border-border hover:border-muted-foreground/40 text-muted-foreground",
                    !puedeEditar && "opacity-60 cursor-not-allowed"
                  )}
                >
                  <span className="font-medium">{a}</span>
                  <span className="text-xs">{ETIQUETAS_ASPECTO[a]}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label>Logo</Label>
            <input
              ref={inputFileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={onElegirArchivo}
            />
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => inputFileRef.current?.click()}
                disabled={!puedeEditar || guardando}
              >
                <ImagePlus className="w-4 h-4 mr-2" />
                {logoEfectivo ? "Cambiar imagen" : "Subir imagen"}
              </Button>
              {logoEfectivo && (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={reabrirRecorte}
                    disabled={!puedeEditar || guardando}
                  >
                    Reencuadrar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={quitarLogo}
                    disabled={!puedeEditar || guardando}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Quitar
                  </Button>
                </>
              )}
            </div>
            <p className="text-xs text-muted-foreground">
              Formatos de imagen hasta 5 MB. Podrás mover y hacer zoom para elegir el encuadre.
            </p>
          </div>
        </div>

        {/* Columna derecha: vista previa */}
        <div className="space-y-3">
          <Label>Vista previa</Label>

          {/* Previsualización del recorte con la proporción elegida */}
          <div className="rounded-lg border border-border bg-muted/30 p-4 flex items-center justify-center">
            <LogoOrganizacion
              logo={logoEfectivo}
              nombre={nombre || organizacion.nombre}
              aspecto={aspecto}
              tamanoBase={120}
              soloLogo
            />
          </div>

          {/* Cómo se verá en el sidebar */}
          <div className="rounded-lg border border-border bg-sidebar p-3">
            <p className="text-[11px] uppercase tracking-wide text-sidebar-foreground/60 mb-2">
              Cómo se verá en el menú
            </p>
            <div className="flex items-center gap-3">
              <LogoOrganizacion
                logo={logoEfectivo}
                nombre={nombre || organizacion.nombre}
                aspecto={aspecto}
                tamanoBase={40}
                soloLogo
              />
              <div className="min-w-0">
                <p className="text-sidebar-foreground font-bold truncate">
                  {nombre || organizacion.nombre}
                </p>
                <p className="text-xs text-sidebar-foreground/70 truncate">Sistema de Gestión</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {puedeEditar && (
        <div className="flex justify-end">
          <Button onClick={guardar} disabled={!hayCambios || guardando}>
            {guardando && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Guardar cambios
          </Button>
        </div>
      )}

      <RecortarLogoDialog
        open={recortando}
        imagenSrc={imagenParaRecortar}
        aspecto={aspecto}
        onClose={() => {
          setRecortando(false)
          setImagenParaRecortar(null)
        }}
        onConfirmar={onRecorteConfirmado}
      />
    </div>
  )
}
