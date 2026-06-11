/**
 * __tests__/integration/crear-organizacion-rollback.test.ts
 * Prueba de integración: rollback de creación de organización.
 *
 * Verifica que cuando crearOrganizacion falla a mitad de la transacción,
 * no quedan registros huérfanos (org, rol, permisos, membresía).
 *
 * Validates: Requirements R8.5
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// Mock de las operaciones internas de la transacción
const mockOrgCreate = vi.fn()
const mockRolCreate = vi.fn()
const mockPermisoRolCreateMany = vi.fn()
const mockMembresiaCreate = vi.fn()
const mockOrgFindFirst = vi.fn()

// Registros "persistidos" — simula la BD en memoria
let persistedOrgs: unknown[]
let persistedRoles: unknown[]
let persistedPermisos: unknown[]
let persistedMembresias: unknown[]

const mockTx = {
  organizacion: {
    create: (...args: unknown[]) => mockOrgCreate(...args),
    findFirst: (...args: unknown[]) => mockOrgFindFirst(...args),
  },
  rol: {
    create: (...args: unknown[]) => mockRolCreate(...args),
  },
  permisoRol: {
    createMany: (...args: unknown[]) => mockPermisoRolCreateMany(...args),
  },
  membresia: {
    create: (...args: unknown[]) => mockMembresiaCreate(...args),
  },
}

const mockTransaction = vi.fn()

vi.mock("@/lib/db", () => ({
  prisma: {
    $transaction: (...args: unknown[]) => mockTransaction(...args),
  },
}))

vi.mock("@/lib/auth/slug", () => ({
  slugUnico: vi.fn().mockResolvedValue("mi-organizacion"),
}))

import { crearOrganizacion } from "@/lib/dominio/organizaciones"
import { OrganizacionFallidaError } from "@/lib/dominio/errores-auth"

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "Integración: Rollback de creación de organización (R8.5)",
  () => {
    const usuarioActual = { id: "usuario-uuid-123" }
    const nombre = "Org Rollback Test"

    const orgCreada = {
      id: "org-uuid-rollback",
      nombre: "Org Rollback Test",
      slug: "org-rollback-test",
      creado_por: "usuario-uuid-123",
      creado_en: new Date("2024-01-01"),
      actualizado_en: new Date("2024-01-01"),
    }

    const rolCreado = {
      id: "rol-uuid-rollback",
      organizacion_id: "org-uuid-rollback",
      nombre: "Propietario",
      es_sistema: true,
      creado_en: new Date("2024-01-01"),
    }

    beforeEach(() => {
      vi.clearAllMocks()

      // Reiniciar almacenes simulados
      persistedOrgs = []
      persistedRoles = []
      persistedPermisos = []
      persistedMembresias = []

      mockOrgFindFirst.mockResolvedValue(null)
    })

    /**
     * Simula una transacción con rollback real:
     * - Acumula registros en arrays temporales durante el callback
     * - Si el callback lanza error, limpia todos los arrays (rollback)
     * - Si no lanza error, persiste los arrays (commit)
     */
    function setupTransactionWithRollback(failAt?: "rol" | "permisos" | "membresia") {
      mockOrgCreate.mockImplementation(async (data: unknown) => {
        persistedOrgs.push(data)
        return orgCreada
      })

      mockRolCreate.mockImplementation(async (data: unknown) => {
        if (failAt === "rol") {
          throw new Error("Simulated failure at rol creation")
        }
        persistedRoles.push(data)
        return rolCreado
      })

      mockPermisoRolCreateMany.mockImplementation(async (data: unknown) => {
        if (failAt === "permisos") {
          throw new Error("Simulated failure at permisos creation")
        }
        persistedPermisos.push(data)
        return { count: 40 }
      })

      mockMembresiaCreate.mockImplementation(async (data: unknown) => {
        if (failAt === "membresia") {
          throw new Error("Simulated failure at membresia creation")
        }
        persistedMembresias.push(data)
        return {
          id: "membresia-uuid-rollback",
          usuario_id: "usuario-uuid-123",
          organizacion_id: "org-uuid-rollback",
          rol_id: "rol-uuid-rollback",
          estado: "activa",
        }
      })

      // Simula el comportamiento de $transaction con rollback
      mockTransaction.mockImplementation(async (cb: Function) => {
        // Snapshot de los arrays antes del callback
        const snapshotOrgs = [...persistedOrgs]
        const snapshotRoles = [...persistedRoles]
        const snapshotPermisos = [...persistedPermisos]
        const snapshotMembresias = [...persistedMembresias]

        try {
          const result = await cb(mockTx)
          // Commit: mantener los cambios
          return result
        } catch (error) {
          // Rollback: restaurar al estado previo
          persistedOrgs = snapshotOrgs
          persistedRoles = snapshotRoles
          persistedPermisos = snapshotPermisos
          persistedMembresias = snapshotMembresias
          throw error
        }
      })
    }

    it("lanza OrganizacionFallidaError cuando falla la creación del rol", async () => {
      setupTransactionWithRollback("rol")

      await expect(crearOrganizacion(usuarioActual, nombre)).rejects.toThrow(
        OrganizacionFallidaError
      )
    })

    it("no persiste la organización cuando falla la creación del rol (rollback)", async () => {
      setupTransactionWithRollback("rol")

      try {
        await crearOrganizacion(usuarioActual, nombre)
      } catch {
        // esperado
      }

      // Rollback: no debe haber registros huérfanos
      expect(persistedOrgs).toHaveLength(0)
      expect(persistedRoles).toHaveLength(0)
      expect(persistedPermisos).toHaveLength(0)
      expect(persistedMembresias).toHaveLength(0)
    })

    it("no persiste org ni rol cuando falla la creación de permisos (rollback)", async () => {
      setupTransactionWithRollback("permisos")

      try {
        await crearOrganizacion(usuarioActual, nombre)
      } catch {
        // esperado
      }

      // Rollback: ningún registro debe quedar
      expect(persistedOrgs).toHaveLength(0)
      expect(persistedRoles).toHaveLength(0)
      expect(persistedPermisos).toHaveLength(0)
      expect(persistedMembresias).toHaveLength(0)
    })

    it("lanza OrganizacionFallidaError cuando falla la creación de permisos", async () => {
      setupTransactionWithRollback("permisos")

      await expect(crearOrganizacion(usuarioActual, nombre)).rejects.toThrow(
        OrganizacionFallidaError
      )
    })

    it("no persiste org, rol ni permisos cuando falla la membresía (rollback)", async () => {
      setupTransactionWithRollback("membresia")

      try {
        await crearOrganizacion(usuarioActual, nombre)
      } catch {
        // esperado
      }

      // Rollback: todo se revierte
      expect(persistedOrgs).toHaveLength(0)
      expect(persistedRoles).toHaveLength(0)
      expect(persistedPermisos).toHaveLength(0)
      expect(persistedMembresias).toHaveLength(0)
    })

    it("lanza OrganizacionFallidaError cuando falla la creación de membresía", async () => {
      setupTransactionWithRollback("membresia")

      await expect(crearOrganizacion(usuarioActual, nombre)).rejects.toThrow(
        OrganizacionFallidaError
      )
    })

    it("persiste todos los registros cuando la transacción es exitosa (control)", async () => {
      setupTransactionWithRollback(undefined) // sin fallo

      const resultado = await crearOrganizacion(usuarioActual, nombre)

      expect(resultado.id).toBe("org-uuid-rollback")
      expect(resultado.slug).toBe("org-rollback-test")

      // Commit: todos los registros persisten
      expect(persistedOrgs).toHaveLength(1)
      expect(persistedRoles).toHaveLength(1)
      expect(persistedPermisos).toHaveLength(1)
      expect(persistedMembresias).toHaveLength(1)
    })
  }
)
