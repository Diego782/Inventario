/**
 * instrumentation.ts
 * Se ejecuta UNA vez al arrancar el servidor Next.js (Node.js runtime).
 * Sincroniza los permisos de los Roles Propietario (es_sistema=true) para
 * que siempre tengan el conjunto completo de PERMISOS_PROPIETARIO, aunque
 * se hayan añadido nuevas secciones al código después de crear la organización.
 *
 * De esta forma, al añadir una nueva sección a SECCIONES, los propietarios
 * existentes obtienen sus permisos automáticamente al reiniciar la app, sin
 * necesidad de migraciones de datos ni pasos manuales.
 */

export async function register() {
  // Solo en el runtime de Node.js (no en el edge runtime)
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  try {
    const { sincronizarPermisosPropietario } = await import(
      "@/lib/dominio/sincronizar-permisos"
    )
    await sincronizarPermisosPropietario()
  } catch (e) {
    // No bloqueamos el arranque si la BD no está disponible todavía
    console.error("[instrumentation] Error al sincronizar permisos:", e)
  }
}
