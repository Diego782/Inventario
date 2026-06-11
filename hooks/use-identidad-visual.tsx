"use client"

/**
 * hooks/use-identidad-visual.tsx
 *
 * `IdentidadVisualProvider` — única autoridad que inyecta las variables CSS de
 * color (`--primary`, `--sidebar-accent`, `--ring`, `--chart-*`) en
 * `document.documentElement`. Su fuente de verdad es la API (`/api/configuracion`),
 * nunca `localStorage` (R9.1).
 *
 * Comportamiento (derivado de `use-sesion` + `use-organizacion-activa`):
 * - Estado inicial siempre `MarcaDego` (`COLOR_TEMA_DEGO`, `logo=null`).
 * - Sin `usuario` o sin `organizacion` → aplica `COLOR_TEMA_DEGO` y no lee
 *   `localStorage` (R5.2, R5.4, R7.3).
 * - `organizacion` cambia a un id no nulo → reset a Marca Dego, dispara
 *   `GET /api/configuracion` con `AbortController` y timeout de 5 s; al resolver
 *   inyecta el color (R7.1, R7.2); ante error/timeout mantiene Marca Dego y emite
 *   toast "No se pudo cargar la identidad visual" (R7.5).
 * - `organizacion.logo` ausente → logo Marca Dego por defecto (`null`) (R7.6).
 * - Logout (`usuario` pasa a `null`) → restaura Marca Dego y descarta color/logo
 *   en memoria (R5.6, R7.3).
 * - `actualizarColor(color)` → `PUT /api/configuracion`; solo tras persistencia
 *   exitosa inyecta las variables CSS (R6.7).
 *
 * Migración localStorage → BD (R9.2–R9.6): si existe `Organizacion_Activa` sin
 * `Color_Tema` persistido y `leerColorHeredado` devuelve `valido`, se ofrece
 * migrar vía toast `sonner` (acción "Aplicar") dentro de los 2 s posteriores a
 * la inicialización. Al aceptar se persiste con `PUT`; si la persistencia tiene
 * éxito se limpian las claves heredadas; ante fallo de persistencia se conservan
 * las claves y se avisa; si la limpieza falla tras persistir, el color persistido
 * se conserva como verdad y no se vuelve a ofrecer (marca en memoria por
 * `organizacion_id`).
 *
 * Validates: Requirements R5.1, R5.2, R5.4, R5.6, R6.7, R7.1, R7.2, R7.3, R7.5,
 * R7.6, R9.2, R9.3, R9.4, R9.5, R9.6
 */

import * as React from "react"
import { useTheme } from "next-themes"
import { toast } from "sonner"

import { useSesion } from "@/hooks/use-sesion"
import { useOrganizacionActiva } from "@/hooks/use-organizacion-activa"
import { aplicarColorTema } from "@/lib/tema/aplicar-color"
import {
  leerColorHeredado,
  limpiarClavesHeredadas,
} from "@/lib/tema/migracion-color"
import {
  COLOR_TEMA_DEGO,
  type ColorTema,
  type ConfiguracionMap,
} from "@/lib/schemas/configuracion"

export type IdentidadVisual = {
  color: ColorTema
  logo: string | null
  logoAspecto: string | null
}

export type IdentidadVisualState = {
  /** Color/logo aplicados actualmente. */
  identidad: IdentidadVisual
  /** `true` mientras se carga la identidad de una org recién seleccionada. */
  cargando: boolean
  error: string | null
  /** Persiste un nuevo Color_Tema en la BD y lo aplica (R6.4, R6.7). */
  actualizarColor: (color: ColorTema) => Promise<void>
}

/** Mensaje de error en español ante fallo/timeout de carga (R7.5). */
const MENSAJE_ERROR_CARGA = "No se pudo cargar la identidad visual"

/** Timeout máximo para la carga de identidad visual (R7.1, R7.4). */
const TIMEOUT_CARGA_MS = 5000

/** Plazo máximo para ofrecer la migración tras la inicialización (R9.2). */
const PLAZO_OFERTA_MIGRACION_MS = 2000

/** Mensaje de error si la persistencia de la migración falla (R9.5). */
const MENSAJE_ERROR_MIGRACION =
  "No se pudo completar la migración del color. Inténtalo de nuevo."

/**
 * Devuelve accesores seguros a `localStorage` (guardados para SSR). Si
 * `window.localStorage` no está disponible, devuelve `null` para que el llamador
 * omita la migración sin lanzar excepciones.
 */
function obtenerAccesoresLocalStorage(): {
  getItem: (clave: string) => string | null
  removeItem: (clave: string) => void
} | null {
  if (typeof window === "undefined") return null
  try {
    const almacen = window.localStorage
    if (!almacen) return null
    return {
      getItem: (clave) => almacen.getItem(clave),
      removeItem: (clave) => almacen.removeItem(clave),
    }
  } catch {
    // El acceso a localStorage puede lanzar (p. ej. cookies bloqueadas).
    return null
  }
}

/**
 * Determina si un `ColorTema` corresponde al valor por defecto de la Marca Dego.
 *
 * El endpoint `GET /api/configuracion` no distingue entre "ausente" y
 * "explícitamente Dego": ambas situaciones devuelven `COLOR_TEMA_DEGO` por la
 * regla de defaults (R6.6). Para la orquestación de la migración tratamos un
 * color igual a `COLOR_TEMA_DEGO` como "organización sin Color_Tema persistido".
 * Es una aproximación documentada: si una organización persistiera exactamente
 * el color por defecto, se la consideraría sin color persistido a efectos de
 * ofrecer una única migración heredada.
 */
function esColorDego(color: ColorTema): boolean {
  return (
    color.color_hue === COLOR_TEMA_DEGO.color_hue &&
    color.color_saturation === COLOR_TEMA_DEGO.color_saturation &&
    color.color_lightness === COLOR_TEMA_DEGO.color_lightness
  )
}

/** Identidad visual por defecto de la Marca Dego. */
const IDENTIDAD_DEGO: IdentidadVisual = {
  color: COLOR_TEMA_DEGO,
  logo: null,
  logoAspecto: null,
}

const IdentidadVisualContext =
  React.createContext<IdentidadVisualState | null>(null)

/**
 * Extrae un `ColorTema` desde la respuesta de `/api/configuracion`
 * (`ConfiguracionMap`). Si alguna clave no es numérica, se sustituye por el
 * valor por defecto de la Marca Dego (R6.6).
 */
function extraerColorTema(config: Partial<ConfiguracionMap>): ColorTema {
  const tomar = (valor: unknown, porDefecto: number) =>
    typeof valor === "number" && Number.isFinite(valor) ? valor : porDefecto

  return {
    color_hue: tomar(config.color_hue, COLOR_TEMA_DEGO.color_hue),
    color_saturation: tomar(
      config.color_saturation,
      COLOR_TEMA_DEGO.color_saturation
    ),
    color_lightness: tomar(
      config.color_lightness,
      COLOR_TEMA_DEGO.color_lightness
    ),
  }
}

export function IdentidadVisualProvider({
  children,
}: {
  children: React.ReactNode
}): React.JSX.Element {
  const { usuario } = useSesion()
  const { organizacion } = useOrganizacionActiva()
  const { resolvedTheme } = useTheme()

  const [identidad, setIdentidad] =
    React.useState<IdentidadVisual>(IDENTIDAD_DEGO)
  const [cargando, setCargando] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const isDark = resolvedTheme === "dark"

  // Espejo del modo claro/oscuro vigente, legible desde callbacks asíncronos
  // (oferta/aplicación de la migración) sin capturar un valor obsoleto.
  const isDarkRef = React.useRef(isDark)
  isDarkRef.current = isDark

  // Mantiene el color actualmente aplicado para poder re-inyectarlo cuando
  // cambie el modo claro/oscuro sin volver a consultar la API.
  const colorAplicadoRef = React.useRef<ColorTema>(COLOR_TEMA_DEGO)

  // Marca en memoria de las organizaciones a las que ya se ofreció (o para las
  // que ya se completó) la migración heredada, para no volver a ofrecerla en
  // esta sesión del navegador (R9.6).
  const organizacionesOfrecidasRef = React.useRef<Set<string>>(new Set())

  /** Inyecta un Color_Tema en `document.documentElement` (única autoridad). */
  const aplicar = React.useCallback(
    (color: ColorTema, dark: boolean) => {
      colorAplicadoRef.current = color
      if (typeof document !== "undefined") {
        aplicarColorTema(document.documentElement, color, dark)
      }
    },
    []
  )

  // ---------------------------------------------------------------------------
  // Carga / limpieza de identidad visual ligada a sesión + organización activa.
  // ---------------------------------------------------------------------------
  const organizacionId = organizacion?.id ?? null

  React.useEffect(() => {
    // Sin sesión o sin organización activa → Marca Dego, sin leer localStorage
    // (R5.2, R5.4, R7.3). El logout cae también en esta rama (usuario = null).
    if (!usuario || !organizacionId) {
      setIdentidad(IDENTIDAD_DEGO)
      setError(null)
      setCargando(false)
      aplicar(COLOR_TEMA_DEGO, isDark)
      return
    }

    // Organización activa establecida/cambiada: reset inmediato a Marca Dego
    // (R7.2) y carga del color persistido con AbortController + timeout 5 s.
    const logoOrg = organizacion?.logo ?? null
    const logoAspectoOrg = organizacion?.logo_aspecto ?? null

    setCargando(true)
    setError(null)
    setIdentidad({
      color: COLOR_TEMA_DEGO,
      logo: logoOrg, // R7.6: ausente => null => logo Marca Dego
      logoAspecto: logoAspectoOrg,
    })
    aplicar(COLOR_TEMA_DEGO, isDark)

    const controlador = new AbortController()
    let cancelado = false
    const temporizador = setTimeout(() => controlador.abort(), TIMEOUT_CARGA_MS)

    const cargar = async () => {
      try {
        const res = await fetch("/api/configuracion", {
          credentials: "include",
          signal: controlador.signal,
        })
        if (!res.ok) {
          throw new Error("Respuesta no satisfactoria")
        }
        const config = (await res.json()) as Partial<ConfiguracionMap>
        if (cancelado) return
        const color = extraerColorTema(config)
        setIdentidad({
          color,
          logo: logoOrg,
          logoAspecto: logoAspectoOrg,
        })
        setError(null)
        aplicar(color, isDark)

        // ---------------------------------------------------------------------------
        // Orquestación de migración localStorage → BD (R9.2–R9.6)
        // ---------------------------------------------------------------------------
        // Si la org no tiene color persistido (esColorDego) y aún no se ofreció
        // la migración, detectar color heredado válido y ofrecerlo vía toast.
        if (
          esColorDego(color) &&
          !organizacionesOfrecidasRef.current.has(organizacionId)
        ) {
          const accesores = obtenerAccesoresLocalStorage()
          if (!accesores) return // SSR o localStorage bloqueado

          const resultado = leerColorHeredado(accesores.getItem)

          // R9.3: si el valor heredado es inválido o ausente, no ofrecer.
          if (resultado.tipo !== "valido") return

          // Marcar esta org como ofrecida para no repetir la oferta (R9.6).
          organizacionesOfrecidasRef.current.add(organizacionId)

          // Ofrecer la migración con un plazo de 2 s (R9.2).
          const temporizadorOferta = setTimeout(() => {
            toast("Color heredado detectado", {
              description:
                "Se detectó un color personalizado guardado localmente. ¿Deseas aplicarlo a esta organización?",
              action: {
                label: "Aplicar",
                onClick: async () => {
                  try {
                    // Persistir el color heredado (R9.4).
                    const resPut = await fetch("/api/configuracion", {
                      method: "PUT",
                      credentials: "include",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(resultado.color),
                    })

                    if (!resPut.ok) {
                      // R9.5: la persistencia falla → conservar claves + toast error.
                      throw new Error("Persistencia fallida")
                    }

                    const configActualizada =
                      (await resPut.json()) as Partial<ConfiguracionMap>
                    const colorPersistido = extraerColorTema(configActualizada)

                    // Aplicar el color persistido.
                    setIdentidad((prev) => ({ ...prev, color: colorPersistido }))
                    aplicar(colorPersistido, isDarkRef.current)

                    // Limpiar las claves heredadas (R9.4).
                    const limpiado = limpiarClavesHeredadas(
                      accesores.removeItem,
                      accesores.getItem
                    )

                    if (limpiado) {
                      toast.success("Color aplicado correctamente")
                    } else {
                      // R9.6: limpieza falla tras persistir → conservar color
                      // persistido como verdad; no volver a ofrecer.
                      toast.success(
                        "Color aplicado. No se pudieron limpiar las claves heredadas."
                      )
                    }
                  } catch {
                    // R9.5: persistencia falla → conservar claves + toast error.
                    toast.error(MENSAJE_ERROR_MIGRACION)
                    // Desmarcar esta org para permitir reintentar la migración.
                    organizacionesOfrecidasRef.current.delete(organizacionId)
                  }
                },
              },
              duration: 10000, // 10 s para que el usuario tenga tiempo de ver/actuar.
            })
          }, PLAZO_OFERTA_MIGRACION_MS)

          // Limpieza del temporizador de oferta si se cancela el efecto.
          return () => clearTimeout(temporizadorOferta)
        }
      } catch {
        if (cancelado) return
        // Error o timeout: conservar Marca Dego y avisar (R7.5).
        setError(MENSAJE_ERROR_CARGA)
        aplicar(COLOR_TEMA_DEGO, isDark)
        toast.error(MENSAJE_ERROR_CARGA)
      } finally {
        if (!cancelado) setCargando(false)
      }
    }

    void cargar()

    return () => {
      cancelado = true
      clearTimeout(temporizador)
      controlador.abort()
    }
    // `organizacion?.logo` y `logo_aspecto` se capturan por id; recargamos solo
    // ante cambios de sesión u organización activa.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario, organizacionId, aplicar])

  // Re-aplica el color vigente cuando cambia el modo claro/oscuro, ya que
  // algunas variables (--chart-*) dependen de `isDark`.
  React.useEffect(() => {
    aplicar(colorAplicadoRef.current, isDark)
  }, [isDark, aplicar])

  // ---------------------------------------------------------------------------
  // Actualización de color: persiste primero, inyecta solo si el PUT tiene éxito.
  // ---------------------------------------------------------------------------
  const actualizarColor = React.useCallback(
    async (color: ColorTema) => {
      const res = await fetch("/api/configuracion", {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(color),
      })
      if (!res.ok) {
        // R6.7: no inyectar las variables si la persistencia falla.
        throw new Error("No se pudo actualizar el color")
      }
      const config = (await res.json()) as Partial<ConfiguracionMap>
      const persistido = extraerColorTema(config)
      setIdentidad((prev) => ({ ...prev, color: persistido }))
      aplicar(persistido, isDark)
    },
    [aplicar, isDark]
  )

  const value = React.useMemo<IdentidadVisualState>(
    () => ({ identidad, cargando, error, actualizarColor }),
    [identidad, cargando, error, actualizarColor]
  )

  return (
    <IdentidadVisualContext.Provider value={value}>
      {children}
    </IdentidadVisualContext.Provider>
  )
}

export function useIdentidadVisual(): IdentidadVisualState {
  const ctx = React.useContext(IdentidadVisualContext)
  if (!ctx) {
    throw new Error(
      "useIdentidadVisual debe usarse dentro de <IdentidadVisualProvider>"
    )
  }
  return ctx
}
