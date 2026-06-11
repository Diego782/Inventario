/**
 * lib/auth/params-invitacion.ts
 *
 * Helper compartido para leer y limpiar los parámetros de invitación
 * (`?token=` y `?accion=`) de la URL del navegador.
 *
 * Diseñado para ser reutilizado tanto en el subárbol autenticado
 * (`InvitacionGate`) como en el no autenticado (`AuthScreens`), garantizando
 * una única fuente de verdad para la lectura de estos parámetros.
 *
 * Guarda contra SSR: cuando `typeof window === "undefined"` (rendering en
 * servidor), devuelve `{ token: null, accion: null }` sin acceder a APIs del
 * navegador.
 *
 * Validates: Requirements 2.3
 */

export interface ParamsInvitacion {
  token: string | null
  accion: string | null
}

/**
 * Lee `?token=` y `?accion=` de `window.location.search`.
 *
 * Retorna `{ token: null, accion: null }` en entornos SSR donde `window`
 * no está disponible.
 */
export function leerParamsInvitacion(): ParamsInvitacion {
  if (typeof window === "undefined") {
    return { token: null, accion: null }
  }
  const params = new URLSearchParams(window.location.search)
  return {
    token: params.get("token"),
    accion: params.get("accion"),
  }
}

/**
 * Elimina `?token=` y `?accion=` de la URL actual usando
 * `window.history.replaceState`, sin recargar la página.
 *
 * Debe invocarse tras completar el flujo de invitación (aceptación exitosa
 * o cierre del estado de error) para evitar que recargar o re-navegar
 * vuelva a disparar el flujo (cláusula 2.3).
 *
 * No hace nada en entornos SSR.
 */
export function limpiarParamsInvitacion(): void {
  if (typeof window === "undefined") return
  window.history.replaceState(null, "", window.location.pathname)
}
