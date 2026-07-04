/**
 * lib/dominio/sincronizar-permisos.ts
 *
 * Sincroniza los permisos de todos los Roles Propietario (es_sistema=true)
 * con el conjunto actual de PERMISOS_PROPIETARIO.
 *
 * Se invoca desde instrumentation.ts al arrancar el servidor.
 * Es idempotente: solo inserta los permisos que faltan, nunca borra los
 * existentes. Así, si se añade una nueva sección a SECCIONES (como "clientes"),
 * todos los propietarios existentes la reciben automáticamente en el
 * siguiente reinicio del servidor, sin migraciones de datos adicionales.
 */
import { prisma } from "@/lib/db"
import { PERMISOS_PROPIETARIO } from "@/lib/auth/permisos"

export async function sincronizarPermisosPropietario(): Promise<void> {
  if (!prisma) return

  // Buscar todos los roles Propietario del sistema
  const rolesPropietario = await prisma.rol.findMany({
    where: { es_sistema: true, nombre: "Propietario" },
    select: { id: true, organizacion_id: true },
  })

  if (rolesPropietario.length === 0) return

  let totalInsertados = 0

  for (const rol of rolesPropietario) {
    // Obtener permisos actuales de este rol
    const permisosExistentes = await prisma.permisoRol.findMany({
      where: { rol_id: rol.id },
      select: { seccion: true, accion: true },
    })

    const existenteSet = new Set(
      permisosExistentes.map((p) => `${p.seccion}:${p.accion}`)
    )

    // Calcular cuáles faltan
    const faltantes = PERMISOS_PROPIETARIO.filter(
      (p) => !existenteSet.has(`${p.seccion}:${p.accion}`)
    )

    if (faltantes.length === 0) continue

    // Insertar solo los que faltan
    await prisma.permisoRol.createMany({
      data: faltantes.map((p) => ({
        rol_id: rol.id,
        seccion: p.seccion,
        accion: p.accion,
      })),
      skipDuplicates: true,
    })

    totalInsertados += faltantes.length
    console.log(
      `[sync-permisos] Rol ${rol.id} (org ${rol.organizacion_id}): +${faltantes.length} permisos insertados`
    )
  }

  if (totalInsertados > 0) {
    console.log(
      `[sync-permisos] Sincronización completa: ${totalInsertados} permisos añadidos a ${rolesPropietario.length} rol(es) Propietario`
    )
  }
}
