// Feature: usuarios-y-accesos, Property 14: Idempotencia de invitación pendiente
/**
 * Property 14: Idempotencia de invitación pendiente
 * **Validates: Requirements 9.6**
 *
 * Enviar una segunda invitación al mismo correo+org con estado pendiente regenera el token
 * y resetea expira_en sin crear un registro duplicado; el conteo de invitaciones pendientes
 * para ese par (correo, org) permanece en 1.
 *
 * También verifica que si el correo ya posee membresía activa, la operación se rechaza
 * con MiembroExistenteError sin crear invitación (R9.5).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import * as fc from "fast-check"

// --- In-memory state ---
let invitacionesDB: Map<string, {
  id: string
  organizacion_id: string
  correo: string
  rol_id: string
  estado: string
  token_hash: string
  expira_en: Date
  invitado_por: string
  creado_en: Date
}>

let membresiaExistente: boolean
let tokenCounter: number

vi.mock("@/lib/db", () => ({
  prisma: {
    rol: {
      findFirst: vi.fn(),
    },
    membresia: {
      findFirst: vi.fn(),
    },
    organizacion: {
      findUniqueOrThrow: vi.fn(),
    },
    invitacion: {
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}))

vi.mock("@/lib/auth/tokens", () => ({
  generarToken: vi.fn(),
}))

vi.mock("@/lib/correo/enviar", () => ({
  enviarCorreo: vi.fn().mockResolvedValue({ entregado: true, modo: "consola" }),
  construirEnlace: vi.fn().mockReturnValue("https://app.test/?token=x&accion=invitacion"),
}))

vi.mock("@/lib/correo/plantillas", () => ({
  plantillaInvitacion: vi.fn().mockReturnValue({
    asunto: "Invitación a la organización",
    html: "<p>Invitación</p>",
    texto: "Invitación",
  }),
}))

import { prisma } from "@/lib/db"
import { generarToken } from "@/lib/auth/tokens"
import { invitar } from "@/lib/dominio/invitaciones"
import { MiembroExistenteError } from "@/lib/dominio/errores-auth"

describe("Property 14: Idempotencia de invitación pendiente", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    invitacionesDB = new Map()
    membresiaExistente = false
    tokenCounter = 0
    process.env.INVITACION_TOKEN_HORAS = "72"

    // Setup rol mock — always valid
    vi.mocked(prisma.rol.findFirst).mockImplementation(async ({ where }: any) => {
      return { id: where.id, nombre: "Editor", organizacion_id: where.organizacion_id }
    })

    // Setup organizacion mock
    vi.mocked(prisma.organizacion.findUniqueOrThrow).mockResolvedValue({
      nombre: "Mi Organización",
    } as any)

    // Setup membresia mock — controlled by membresiaExistente flag
    vi.mocked(prisma.membresia.findFirst).mockImplementation(async () => {
      return membresiaExistente ? { id: "mem-1" } : null
    })

    // Setup invitacion.findFirst — looks up in-memory DB
    vi.mocked(prisma.invitacion.findFirst).mockImplementation(async ({ where }: any) => {
      for (const inv of invitacionesDB.values()) {
        if (
          inv.organizacion_id === where.organizacion_id &&
          inv.correo === where.correo &&
          inv.estado === where.estado
        ) {
          return inv as any
        }
      }
      return null
    })

    // Setup invitacion.create — inserts into in-memory DB
    vi.mocked(prisma.invitacion.create).mockImplementation(async ({ data }: any) => {
      const id = `inv-${Date.now()}-${Math.random()}`
      const record = {
        id,
        organizacion_id: data.organizacion_id,
        correo: data.correo,
        rol_id: data.rol_id,
        estado: data.estado,
        token_hash: data.token_hash,
        expira_en: data.expira_en,
        invitado_por: data.invitado_por,
        creado_en: new Date(),
      }
      invitacionesDB.set(id, record)
      return record as any
    })

    // Setup invitacion.update — updates in-memory DB
    vi.mocked(prisma.invitacion.update).mockImplementation(async ({ where, data }: any) => {
      const existing = invitacionesDB.get(where.id)
      if (!existing) throw new Error(`Invitación ${where.id} no encontrada`)
      const updated = { ...existing, ...data }
      invitacionesDB.set(where.id, updated)
      return updated as any
    })

    // Setup generarToken — returns unique tokens
    vi.mocked(generarToken).mockImplementation(() => {
      tokenCounter++
      return {
        plano: `token-plano-${tokenCounter}`,
        hash: `hash-${tokenCounter}`,
      }
    })
  })

  it("P14 — Segunda invitación al mismo (correo, org) regenera token sin crear duplicado; conteo pendiente permanece en 1", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          correo: fc.emailAddress(),
          orgId: fc.uuid(),
          rolId: fc.uuid(),
          userId: fc.uuid(),
        }),
        async ({ correo, orgId, rolId, userId }) => {
          // Reset in-memory state for each run
          invitacionesDB.clear()
          tokenCounter = 0
          membresiaExistente = false

          // --- Primera llamada: debe crear 1 invitación pendiente ---
          const resultado1 = await invitar(orgId, correo, rolId, userId)

          expect(resultado1.estado).toBe("pendiente")
          expect(resultado1.organizacion_id).toBe(orgId)

          // Contar invitaciones pendientes para (correo, org) después de la primera llamada
          const correoNorm = correo.toLowerCase().trim()
          const pendientesTrasPrimera = [...invitacionesDB.values()].filter(
            (inv) =>
              inv.correo === correoNorm &&
              inv.organizacion_id === orgId &&
              inv.estado === "pendiente"
          )
          expect(pendientesTrasPrimera).toHaveLength(1)

          const tokenHashPrimero = pendientesTrasPrimera[0].token_hash
          const expiraEnPrimera = pendientesTrasPrimera[0].expira_en

          // Pequeña pausa para asegurar que expira_en cambia
          await new Promise((r) => setTimeout(r, 5))

          // --- Segunda llamada: debe regenerar token, NO crear nuevo registro ---
          const resultado2 = await invitar(orgId, correo, rolId, userId)

          expect(resultado2.estado).toBe("pendiente")
          expect(resultado2.id).toBe(resultado1.id) // mismo registro

          // Contar invitaciones pendientes después de la segunda llamada
          const pendientesTrasSeguinda = [...invitacionesDB.values()].filter(
            (inv) =>
              inv.correo === correoNorm &&
              inv.organizacion_id === orgId &&
              inv.estado === "pendiente"
          )

          // La propiedad clave: siempre exactamente 1 invitación pendiente
          expect(pendientesTrasSeguinda).toHaveLength(1)

          // El token debe haber cambiado (regenerado)
          const tokenHashSegundo = pendientesTrasSeguinda[0].token_hash
          expect(tokenHashSegundo).not.toBe(tokenHashPrimero)

          // expira_en debe haberse reseteado (nuevo valor)
          const expiraEnSegunda = pendientesTrasSeguinda[0].expira_en
          expect(expiraEnSegunda.getTime()).toBeGreaterThanOrEqual(expiraEnPrimera.getTime())

          // No se crearon registros adicionales en total
          const totalInvitaciones = [...invitacionesDB.values()].filter(
            (inv) =>
              inv.correo === correoNorm &&
              inv.organizacion_id === orgId
          )
          expect(totalInvitaciones).toHaveLength(1)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P14 — Si el correo ya tiene membresía activa, se rechaza con MiembroExistenteError sin crear invitación", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          correo: fc.emailAddress(),
          orgId: fc.uuid(),
          rolId: fc.uuid(),
          userId: fc.uuid(),
        }),
        async ({ correo, orgId, rolId, userId }) => {
          // Reset in-memory state for each run
          invitacionesDB.clear()
          tokenCounter = 0
          membresiaExistente = true // simula miembro activo

          await expect(invitar(orgId, correo, rolId, userId)).rejects.toThrow(
            MiembroExistenteError
          )

          // No se creó ninguna invitación
          expect(invitacionesDB.size).toBe(0)
        }
      ),
      { numRuns: 100 }
    )
  })
})
