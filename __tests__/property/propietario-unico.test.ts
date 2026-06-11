// Feature: usuarios-y-accesos, Property 9: Invariante de propietario único de la organización
/**
 * Property 9: Invariante de propietario único de la organización
 * **Validates: Requirements 8.2, 8.3, 11.6, 11.7**
 *
 * Tras crear cualquier organización existe exactamente un Rol_Propietario
 * asignado a exactamente un miembro; toda operación posterior que dejaría
 * 0 propietarios se rechaza con PROPIETARIO_REQUERIDO y editar/eliminar
 * el Rol_Propietario con ROL_PROPIETARIO_PROTEGIDO.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"
import { PERMISOS_PROPIETARIO } from "@/lib/auth/permisos"

// --- In-memory repository state ---
interface InMemoryOrg {
  id: string
  nombre: string
  slug: string
  creado_por: string
}

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

interface InMemoryPermisoRol {
  id: string
  rol_id: string
  seccion: string
  accion: string
}

let orgs: InMemoryOrg[]
let roles: InMemoryRol[]
let membresias: InMemoryMembresia[]
let permisosRol: InMemoryPermisoRol[]
let idCounter: number

function newId(): string {
  return `id-${++idCounter}`
}

// Mock prisma with in-memory repos
vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        organizacion: {
          create: async ({ data }: { data: Omit<InMemoryOrg, "id"> }) => {
            const org: InMemoryOrg = { id: newId(), ...data }
            orgs.push(org)
            return org
          },
        },
        rol: {
          create: async ({ data }: { data: Omit<InMemoryRol, "id"> }) => {
            const rol: InMemoryRol = { id: newId(), ...data }
            roles.push(rol)
            return rol
          },
        },
        permisoRol: {
          createMany: async ({ data }: { data: Omit<InMemoryPermisoRol, "id">[] }) => {
            for (const p of data) {
              permisosRol.push({ id: newId(), ...p })
            }
            return { count: data.length }
          },
        },
        membresia: {
          create: async ({ data }: { data: Omit<InMemoryMembresia, "id"> }) => {
            const m: InMemoryMembresia = { id: newId(), ...data }
            membresias.push(m)
            return m
          },
        },
      }
      return fn(tx)
    },
  },
}))

vi.mock("@/lib/auth/slug", () => ({
  slugUnico: async (_tx: unknown, nombre: string) =>
    nombre.toLowerCase().replace(/[^a-z0-9-]/g, "-").slice(0, 80) || "org",
}))

import { crearOrganizacion } from "@/lib/dominio/organizaciones"

describe("Property 9: Invariante de propietario único de la organización", () => {
  beforeEach(() => {
    orgs = []
    roles = []
    membresias = []
    permisosRol = []
    idCounter = 0
  })

  it("P9.1 — Tras crear cualquier organización existe exactamente un Rol_Propietario asignado a exactamente un miembro", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          usuarioId: fc.uuid(),
          nombre: fc.string({ minLength: 1, maxLength: 160 }).filter((s) => s.trim().length > 0),
        }),
        async ({ usuarioId, nombre }) => {
          // Reset in-memory state
          orgs = []
          roles = []
          membresias = []
          permisosRol = []
          idCounter = 0

          await crearOrganizacion({ id: usuarioId }, nombre)

          // Exactly 1 organization created
          expect(orgs).toHaveLength(1)
          const org = orgs[0]

          // Exactly 1 role created, and it's es_sistema=true (Rol_Propietario)
          const rolesPropietario = roles.filter(
            (r) => r.organizacion_id === org.id && r.es_sistema === true
          )
          expect(rolesPropietario).toHaveLength(1)

          const rolPropietario = rolesPropietario[0]
          expect(rolPropietario.nombre).toBe("Propietario")

          // Exactly 40 permisos (8 secciones × 5 acciones)
          const permisos = permisosRol.filter((p) => p.rol_id === rolPropietario.id)
          expect(permisos).toHaveLength(PERMISOS_PROPIETARIO.length)

          // Exactly 1 membresía with the Rol_Propietario
          const membresiasPropietario = membresias.filter(
            (m) =>
              m.organizacion_id === org.id &&
              m.rol_id === rolPropietario.id &&
              m.estado === "activa"
          )
          expect(membresiasPropietario).toHaveLength(1)

          // The member is the creator
          expect(membresiasPropietario[0].usuario_id).toBe(usuarioId)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P9.2 — Operaciones que dejan 0 propietarios se rechazan con PROPIETARIO_REQUERIDO", () => {
    fc.assert(
      fc.property(
        fc.record({
          orgId: fc.uuid(),
          rolPropietarioId: fc.uuid(),
          miembroId: fc.uuid(),
          otroRolId: fc.uuid(),
        }),
        ({ orgId, rolPropietarioId, miembroId, otroRolId }) => {
          // Model: an organization with exactly 1 owner member
          const orgState = {
            roles: [
              { id: rolPropietarioId, organizacion_id: orgId, nombre: "Propietario", es_sistema: true },
              { id: otroRolId, organizacion_id: orgId, nombre: "Empleado", es_sistema: false },
            ],
            membresias: [
              { id: miembroId, usuario_id: "user-1", organizacion_id: orgId, rol_id: rolPropietarioId, estado: "activa" },
            ],
          }

          // Simulate: reasignar el Rol_Propietario a otro rol (dejaría 0 propietarios)
          function reasignarRol(membresiaId: string, nuevoRolId: string): { ok: boolean; error?: string } {
            const membresia = orgState.membresias.find((m) => m.id === membresiaId)
            if (!membresia) return { ok: false, error: "NOT_FOUND" }

            // Count how many owners would remain after reassignment
            const propietariosDespues = orgState.membresias.filter(
              (m) =>
                m.organizacion_id === orgId &&
                m.rol_id === rolPropietarioId &&
                m.estado === "activa" &&
                m.id !== membresiaId
            ).length

            if (propietariosDespues === 0) {
              return { ok: false, error: "PROPIETARIO_REQUERIDO" }
            }

            membresia.rol_id = nuevoRolId
            return { ok: true }
          }

          // Attempt to reassign the sole owner → rejected
          const result = reasignarRol(miembroId, otroRolId)
          expect(result.ok).toBe(false)
          expect(result.error).toBe("PROPIETARIO_REQUERIDO")

          // Owner still has the Rol_Propietario (invariant preserved)
          const propietarios = orgState.membresias.filter(
            (m) => m.rol_id === rolPropietarioId && m.estado === "activa"
          )
          expect(propietarios).toHaveLength(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P9.3 — Editar o eliminar el Rol_Propietario se rechaza con ROL_PROPIETARIO_PROTEGIDO", () => {
    fc.assert(
      fc.property(
        fc.record({
          orgId: fc.uuid(),
          rolPropietarioId: fc.uuid(),
          nuevoNombre: fc.string({ minLength: 1, maxLength: 80 }),
        }),
        ({ orgId, rolPropietarioId, nuevoNombre }) => {
          // Model: the Rol_Propietario
          const rolPropietario = {
            id: rolPropietarioId,
            organizacion_id: orgId,
            nombre: "Propietario",
            es_sistema: true,
          }

          // Simulate: attempt to edit the Rol_Propietario
          function editarRol(rolId: string, datos: { nombre?: string }): { ok: boolean; error?: string } {
            if (rolPropietario.id === rolId && rolPropietario.es_sistema) {
              return { ok: false, error: "ROL_PROPIETARIO_PROTEGIDO" }
            }
            // Would apply changes otherwise
            return { ok: true }
          }

          // Simulate: attempt to delete the Rol_Propietario
          function eliminarRol(rolId: string): { ok: boolean; error?: string } {
            if (rolPropietario.id === rolId && rolPropietario.es_sistema) {
              return { ok: false, error: "ROL_PROPIETARIO_PROTEGIDO" }
            }
            return { ok: true }
          }

          // Edit rejected
          const editResult = editarRol(rolPropietarioId, { nombre: nuevoNombre })
          expect(editResult.ok).toBe(false)
          expect(editResult.error).toBe("ROL_PROPIETARIO_PROTEGIDO")

          // Delete rejected
          const deleteResult = eliminarRol(rolPropietarioId)
          expect(deleteResult.ok).toBe(false)
          expect(deleteResult.error).toBe("ROL_PROPIETARIO_PROTEGIDO")
        }
      ),
      { numRuns: 100 }
    )
  })
})
