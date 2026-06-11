// Feature: usuarios-y-accesos, Property 6: Idempotencia de aceptación de invitación
/**
 * Property 6: Idempotencia de la aceptación de invitación
 * **Validates: Requirements 10.2, 10.3**
 *
 * Para toda invitación pendiente cuyo correo coincide con el invitado, aceptarla
 * una o más veces produce como máximo una Membresia activa para el par
 * (usuario, organización) y deja la Invitacion en `estado = aceptada`.
 *
 * - Primera aceptación válida crea exactamente 1 membresía activa.
 * - Segunda llamada con el mismo token retorna { ok: true } sin crear membresía duplicada.
 * - El conteo de membresías activas para (userId, orgId) es siempre 1.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// --- In-memory state ---
type InvitacionRecord = {
  id: string
  organizacion_id: string
  correo: string
  rol_id: string
  estado: string
  token_hash: string
  expira_en: Date
  invitado_por: string
  creado_en: Date
  rol: { id: string; nombre: string }
}

type MembresiaRecord = {
  id: string
  usuario_id: string
  organizacion_id: string
  rol_id: string
  estado: string
  creado_en: Date
}

let invitacionesDB: Map<string, InvitacionRecord>
let membresiasDB: Map<string, MembresiaRecord>

vi.mock("@/lib/db", () => ({
  prisma: {
    invitacion: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    membresia: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}))

vi.mock("@/lib/auth/tokens", () => ({
  hashToken: vi.fn((token: string) => `hashed_${token}`),
}))

import { prisma } from "@/lib/db"
import { aceptarInvitacion } from "@/lib/dominio/invitaciones"

describe("Property 6: Idempotencia de aceptación de invitación", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invitacionesDB = new Map()
    membresiasDB = new Map()

    // prisma.invitacion.findUnique — busca en la DB en memoria por token_hash
    vi.mocked(prisma.invitacion.findUnique).mockImplementation(async ({ where, include }: any) => {
      for (const inv of invitacionesDB.values()) {
        if (inv.token_hash === where.token_hash) {
          return include?.rol ? { ...inv } : { ...inv, rol: undefined }
        }
      }
      return null
    })

    // prisma.invitacion.update — actualiza estado en la DB en memoria
    vi.mocked(prisma.invitacion.update).mockImplementation(async ({ where, data }: any) => {
      const inv = invitacionesDB.get(where.id)
      if (!inv) throw new Error(`Invitación ${where.id} no encontrada`)
      const updated = { ...inv, ...data }
      invitacionesDB.set(where.id, updated)
      return updated as any
    })

    // prisma.membresia.findUnique — busca por clave compuesta (usuario_id, organizacion_id)
    vi.mocked(prisma.membresia.findUnique).mockImplementation(async ({ where }: any) => {
      const key = where.usuario_id_organizacion_id
      if (!key) return null
      for (const mem of membresiasDB.values()) {
        if (mem.usuario_id === key.usuario_id && mem.organizacion_id === key.organizacion_id) {
          return mem as any
        }
      }
      return null
    })

    // prisma.membresia.create — inserta en la DB en memoria
    vi.mocked(prisma.membresia.create).mockImplementation(async ({ data }: any) => {
      const id = `mem-${Date.now()}-${Math.random()}`
      const record: MembresiaRecord = {
        id,
        usuario_id: data.usuario_id,
        organizacion_id: data.organizacion_id,
        rol_id: data.rol_id,
        estado: data.estado,
        creado_en: new Date(),
      }
      membresiasDB.set(id, record)
      return record as any
    })

    // prisma.$transaction — ejecuta el callback con un proxy que usa los mismos mocks
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: any) => {
      const tx = {
        membresia: {
          findUnique: vi.mocked(prisma.membresia.findUnique),
          create: vi.mocked(prisma.membresia.create),
        },
        invitacion: {
          update: vi.mocked(prisma.invitacion.update),
        },
      }
      return fn(tx)
    })
  })

  it("P6 — Primera aceptación crea exactamente 1 membresía activa; segunda llamada con el mismo token no crea duplicado", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tokenPlano: fc.string({ minLength: 16, maxLength: 64 }),
          userId: fc.uuid(),
          correo: fc.emailAddress(),
          orgId: fc.uuid(),
          rolId: fc.uuid(),
        }),
        async ({ tokenPlano, userId, correo, orgId, rolId }) => {
          // Reset in-memory state for each property run
          invitacionesDB.clear()
          membresiasDB.clear()

          const correoNorm = correo.toLowerCase().trim()
          const tokenHash = `hashed_${tokenPlano}`

          // Seed: invitación pendiente válida (no expirada, correo coincide)
          const invId = `inv-${Date.now()}-${Math.random()}`
          invitacionesDB.set(invId, {
            id: invId,
            organizacion_id: orgId,
            correo: correoNorm,
            rol_id: rolId,
            estado: "pendiente",
            token_hash: tokenHash,
            expira_en: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72h en el futuro
            invitado_por: "admin-id",
            creado_en: new Date(),
            rol: { id: rolId, nombre: "Editor" },
          })

          const usuarioActual = { id: userId, correo: correoNorm }

          // --- Primera aceptación: debe crear 1 membresía activa ---
          const resultado1 = await aceptarInvitacion(tokenPlano, usuarioActual)

          expect(resultado1).toEqual({ ok: true })

          // Verificar que se creó exactamente 1 membresía para (userId, orgId)
          const membresiasParaUsuarioOrg = [...membresiasDB.values()].filter(
            (m) => m.usuario_id === userId && m.organizacion_id === orgId
          )
          expect(membresiasParaUsuarioOrg).toHaveLength(1)
          expect(membresiasParaUsuarioOrg[0].estado).toBe("activa")

          // Verificar que la invitación quedó en estado "aceptada"
          const invActualizada = invitacionesDB.get(invId)
          expect(invActualizada?.estado).toBe("aceptada")

          // --- Segunda aceptación con el mismo token: idempotente ---
          const resultado2 = await aceptarInvitacion(tokenPlano, usuarioActual)

          expect(resultado2).toEqual({ ok: true })

          // El conteo de membresías para (userId, orgId) sigue siendo exactamente 1
          const membresiasTrasDosLlamadas = [...membresiasDB.values()].filter(
            (m) => m.usuario_id === userId && m.organizacion_id === orgId
          )
          expect(membresiasTrasDosLlamadas).toHaveLength(1)

          // El total de membresías en la DB no creció
          expect(membresiasDB.size).toBe(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P6 — Múltiples aceptaciones del mismo token nunca producen más de 1 membresía activa para (userId, orgId)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          tokenPlano: fc.string({ minLength: 16, maxLength: 64 }),
          userId: fc.uuid(),
          correo: fc.emailAddress(),
          orgId: fc.uuid(),
          rolId: fc.uuid(),
          repeticiones: fc.integer({ min: 2, max: 5 }),
        }),
        async ({ tokenPlano, userId, correo, orgId, rolId, repeticiones }) => {
          // Reset in-memory state for each property run
          invitacionesDB.clear()
          membresiasDB.clear()

          const correoNorm = correo.toLowerCase().trim()
          const tokenHash = `hashed_${tokenPlano}`

          // Seed: invitación pendiente válida
          const invId = `inv-${Date.now()}-${Math.random()}`
          invitacionesDB.set(invId, {
            id: invId,
            organizacion_id: orgId,
            correo: correoNorm,
            rol_id: rolId,
            estado: "pendiente",
            token_hash: tokenHash,
            expira_en: new Date(Date.now() + 72 * 60 * 60 * 1000),
            invitado_por: "admin-id",
            creado_en: new Date(),
            rol: { id: rolId, nombre: "Editor" },
          })

          const usuarioActual = { id: userId, correo: correoNorm }

          // Llamar aceptarInvitacion múltiples veces con el mismo token
          for (let i = 0; i < repeticiones; i++) {
            const resultado = await aceptarInvitacion(tokenPlano, usuarioActual)
            expect(resultado).toEqual({ ok: true })
          }

          // Invariante: siempre exactamente 1 membresía activa para (userId, orgId)
          const membresiasFinales = [...membresiasDB.values()].filter(
            (m) => m.usuario_id === userId && m.organizacion_id === orgId
          )
          expect(membresiasFinales).toHaveLength(1)
          expect(membresiasFinales[0].estado).toBe("activa")

          // La invitación debe estar en estado "aceptada"
          const invFinal = invitacionesDB.get(invId)
          expect(invFinal?.estado).toBe("aceptada")
        }
      ),
      { numRuns: 100 }
    )
  })
})
