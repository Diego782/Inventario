// Feature: usuarios-y-accesos, Property 11: Coherencia rol-organización
/**
 * Property 11: Coherencia rol-organización
 * **Validates: Requirements 11.4, 11.9, 12.4**
 *
 * Ningún rol puede asignarse a una membresía de una organización distinta a la
 * que pertenece el rol; toda operación que viole esta restricción se rechaza con
 * RolFueraDeOrganizacionError (código ROL_FUERA_DE_ORGANIZACION).
 *
 * Cuando el rol y la membresía pertenecen a la misma organización, la operación
 * tiene éxito y retorna el MiembroDTO actualizado.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// --- In-memory state ---
interface InMemoryRol {
  id: string
  organizacion_id: string
  nombre: string
  es_sistema: boolean
}

interface InMemoryMembresia {
  id: string
  usuario_id: string
  organizacion_id: string
  rol_id: string
  estado: string
}

interface InMemoryUsuario {
  id: string
  nombre: string
  correo: string
}

let rolesDB: Map<string, InMemoryRol>
let membresiasDB: Map<string, InMemoryMembresia>
let usuariosDB: Map<string, InMemoryUsuario>

vi.mock("@/lib/db", () => ({
  prisma: {
    membresia: {
      findFirst: vi.fn(),
      count: vi.fn(),
      update: vi.fn(),
    },
    rol: {
      findFirst: vi.fn(),
    },
  },
}))

import { prisma } from "@/lib/db"
import { asignarRol } from "@/lib/dominio/membresias"
import { RolFueraDeOrganizacionError } from "@/lib/dominio/errores-auth"

describe("Property 11: Coherencia rol-organización", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    rolesDB = new Map()
    membresiasDB = new Map()
    usuariosDB = new Map()

    // prisma.membresia.findFirst — busca en la DB en memoria
    vi.mocked(prisma.membresia.findFirst).mockImplementation(async ({ where }: any) => {
      for (const mem of membresiasDB.values()) {
        if (mem.id === where.id && mem.organizacion_id === where.organizacion_id) {
          const usuarioBase = usuariosDB.get(mem.usuario_id) ?? {
            id: mem.usuario_id,
            nombre: "Usuario",
            correo: "usuario@test.com",
          }
          const usuario = {
            ...usuarioBase,
            correo_verificado: true,
            estado: "activo",
            hash_contrasena: "hash",
            creado_en: new Date(),
            actualizado_en: new Date(),
          }
          const rol = rolesDB.get(mem.rol_id) ?? {
            id: mem.rol_id,
            organizacion_id: mem.organizacion_id,
            nombre: "Rol",
            es_sistema: false,
            creado_en: new Date(),
          }
          return { ...mem, creado_en: new Date(), usuario, rol } as any
        }
      }
      return null
    })

    // prisma.rol.findFirst — busca en la DB en memoria
    vi.mocked(prisma.rol.findFirst).mockImplementation(async ({ where }: any) => {
      for (const rol of rolesDB.values()) {
        if (rol.id === where.id && rol.organizacion_id === where.organizacion_id) {
          return rol as any
        }
      }
      return null
    })

    // prisma.membresia.count — cuenta membresías con propietario activo
    vi.mocked(prisma.membresia.count).mockImplementation(async ({ where }: any) => {
      let count = 0
      for (const mem of membresiasDB.values()) {
        if (mem.organizacion_id !== where.organizacion_id) continue
        if (where.estado && mem.estado !== where.estado) continue
        if (where.rol?.es_sistema) {
          const rol = rolesDB.get(mem.rol_id)
          if (!rol?.es_sistema) continue
        }
        count++
      }
      return count
    })

    // prisma.membresia.update — actualiza en la DB en memoria
    vi.mocked(prisma.membresia.update).mockImplementation(async ({ where, data }: any) => {
      const mem = membresiasDB.get(where.id)
      if (!mem) throw new Error(`Membresía ${where.id} no encontrada`)
      const updated = { ...mem, ...data }
      membresiasDB.set(where.id, updated)
      const usuarioBase = usuariosDB.get(updated.usuario_id) ?? {
        id: updated.usuario_id,
        nombre: "Usuario",
        correo: "usuario@test.com",
      }
      const usuario = {
        ...usuarioBase,
        correo_verificado: true,
        estado: "activo",
        hash_contrasena: "hash",
        creado_en: new Date(),
        actualizado_en: new Date(),
      }
      const rol = rolesDB.get(updated.rol_id) ?? {
        id: updated.rol_id,
        organizacion_id: updated.organizacion_id,
        nombre: "Rol",
        es_sistema: false,
        creado_en: new Date(),
      }
      return { ...updated, creado_en: new Date(), usuario, rol } as any
    })
  })

  it("P11.1 — Asignar un rol de org2 a una membresía de org1 (org1 ≠ org2) siempre lanza RolFueraDeOrganizacionError", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .record({
            orgId1: fc.uuid(),
            orgId2: fc.uuid(),
            rolId: fc.uuid(),
            membresiaId: fc.uuid(),
            usuarioId: fc.uuid(),
            rolActualId: fc.uuid(),
          })
          .filter(({ orgId1, orgId2 }) => orgId1 !== orgId2),
        async ({ orgId1, orgId2, rolId, membresiaId, usuarioId, rolActualId }) => {
          // Reset in-memory state for each run
          rolesDB.clear()
          membresiasDB.clear()
          usuariosDB.clear()

          // El rol pertenece a org2
          rolesDB.set(rolId, {
            id: rolId,
            organizacion_id: orgId2,
            nombre: "Rol de org2",
            es_sistema: false,
          })

          // El rol actual de la membresía pertenece a org1 (no es sistema)
          rolesDB.set(rolActualId, {
            id: rolActualId,
            organizacion_id: orgId1,
            nombre: "Rol actual",
            es_sistema: false,
          })

          // El usuario existe
          usuariosDB.set(usuarioId, {
            id: usuarioId,
            nombre: "Usuario Test",
            correo: "test@test.com",
          })

          // La membresía pertenece a org1
          membresiasDB.set(membresiaId, {
            id: membresiaId,
            usuario_id: usuarioId,
            organizacion_id: orgId1,
            rol_id: rolActualId,
            estado: "activa",
          })

          // Intentar asignar el rol de org2 a la membresía de org1 → debe fallar
          await expect(
            asignarRol(membresiaId, rolId, orgId1)
          ).rejects.toThrow(RolFueraDeOrganizacionError)

          // La membresía no debe haber cambiado
          const membresiaFinal = membresiasDB.get(membresiaId)
          expect(membresiaFinal?.rol_id).toBe(rolActualId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P11.2 — Asignar un rol de org1 a una membresía de org1 siempre tiene éxito", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          orgId: fc.uuid(),
          nuevoRolId: fc.uuid(),
          membresiaId: fc.uuid(),
          usuarioId: fc.uuid(),
          rolActualId: fc.uuid(),
        }),
        async ({ orgId, nuevoRolId, membresiaId, usuarioId, rolActualId }) => {
          // Reset in-memory state for each run
          rolesDB.clear()
          membresiasDB.clear()
          usuariosDB.clear()

          // El nuevo rol pertenece a la misma org (no es sistema)
          rolesDB.set(nuevoRolId, {
            id: nuevoRolId,
            organizacion_id: orgId,
            nombre: "Nuevo Rol",
            es_sistema: false,
          })

          // El rol actual de la membresía también pertenece a la misma org (no es sistema)
          rolesDB.set(rolActualId, {
            id: rolActualId,
            organizacion_id: orgId,
            nombre: "Rol actual",
            es_sistema: false,
          })

          // El usuario existe
          usuariosDB.set(usuarioId, {
            id: usuarioId,
            nombre: "Usuario Test",
            correo: "test@test.com",
          })

          // La membresía pertenece a la misma org
          membresiasDB.set(membresiaId, {
            id: membresiaId,
            usuario_id: usuarioId,
            organizacion_id: orgId,
            rol_id: rolActualId,
            estado: "activa",
          })

          // Asignar el nuevo rol de la misma org → debe tener éxito
          const resultado = await asignarRol(membresiaId, nuevoRolId, orgId)

          // El resultado debe ser un MiembroDTO válido
          expect(resultado).toBeDefined()
          expect(resultado.id).toBe(membresiaId)
          // El nombre del rol en el DTO debe ser el del nuevo rol
          expect(resultado.rol).toBe("Nuevo Rol")

          // La membresía debe haberse actualizado en la DB
          const membresiaFinal = membresiasDB.get(membresiaId)
          expect(membresiaFinal?.rol_id).toBe(nuevoRolId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P11.3 — La restricción se mantiene para cualquier combinación de IDs: rol de org distinta siempre rechazado", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc
          .tuple(fc.uuid(), fc.uuid())
          .filter(([a, b]) => a !== b)
          .chain(([orgId1, orgId2]) =>
            fc.record({
              orgId1: fc.constant(orgId1),
              orgId2: fc.constant(orgId2),
              rolId: fc.uuid(),
              membresiaId: fc.uuid(),
              usuarioId: fc.uuid(),
              rolActualId: fc.uuid(),
            })
          ),
        async ({ orgId1, orgId2, rolId, membresiaId, usuarioId, rolActualId }) => {
          // Reset in-memory state for each run
          rolesDB.clear()
          membresiasDB.clear()
          usuariosDB.clear()

          // El rol pertenece a org2 (organización diferente)
          rolesDB.set(rolId, {
            id: rolId,
            organizacion_id: orgId2,
            nombre: "Rol externo",
            es_sistema: false,
          })

          // El rol actual pertenece a org1
          rolesDB.set(rolActualId, {
            id: rolActualId,
            organizacion_id: orgId1,
            nombre: "Rol interno",
            es_sistema: false,
          })

          usuariosDB.set(usuarioId, {
            id: usuarioId,
            nombre: "Usuario",
            correo: "u@test.com",
          })

          membresiasDB.set(membresiaId, {
            id: membresiaId,
            usuario_id: usuarioId,
            organizacion_id: orgId1,
            rol_id: rolActualId,
            estado: "activa",
          })

          // La operación debe rechazarse con RolFueraDeOrganizacionError
          await expect(
            asignarRol(membresiaId, rolId, orgId1)
          ).rejects.toThrow(RolFueraDeOrganizacionError)

          // El estado de la membresía no debe haber cambiado
          const membresiaFinal = membresiasDB.get(membresiaId)
          expect(membresiaFinal?.rol_id).toBe(rolActualId)
          expect(membresiaFinal?.organizacion_id).toBe(orgId1)
        }
      ),
      { numRuns: 100 }
    )
  })
})
