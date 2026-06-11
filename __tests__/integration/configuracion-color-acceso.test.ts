/**
 * __tests__/integration/configuracion-color-acceso.test.ts
 * Pruebas ejemplares de acceso al endpoint de configuración (GET/PUT).
 *
 * Validates: Requirements R8.4, R8.5, R6.4, R6.5
 *
 * Cubre los cuatro casos:
 * 1. GET/PUT sin sesión → 401 NO_AUTENTICADO (R8.4)
 * 2. GET/PUT con sesión pero sin Organizacion_Activa → 403 SIN_ORGANIZACION_ACTIVA (R8.5)
 * 3. PUT de Color_Tema válido → 200 con el color devuelto coincidente con el enviado (R6.4)
 * 4. PUT de Color_Tema inválido → 422 con detalle por campo (R6.5)
 *
 * Estrategia: se mockea `resolverContexto` de `@/lib/auth/contexto-request`
 * (autoridad del guard 401/403) y `prisma` de `@/lib/db` (capa de datos).
 * Se construyen objetos Request y se invocan los handlers GET/PUT directamente.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { errorAuth } from "@/lib/api/respuestas-auth"

const ORG_ID = "org-001"

function reqPut(body: unknown): any {
  return new Request("http://localhost:3000/api/configuracion", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any
}

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "Integración: acceso al endpoint de configuración (color)",
  () => {
    beforeEach(() => {
      vi.resetModules()
      vi.clearAllMocks()
    })

    // --- R8.4: Sin sesión → 401 ---
    describe("R8.4: solicitud sin sesión válida → 401", () => {
      beforeEach(() => {
        // resolverContexto sin sesión devuelve 401 NO_AUTENTICADO
        vi.doMock("@/lib/auth/contexto-request", () => ({
          resolverContexto: vi.fn().mockResolvedValue({
            error: errorAuth("NO_AUTENTICADO", 401),
          }),
        }))
        // prisma no debe ser tocado; lo mockeamos para detectar accesos indebidos
        vi.doMock("@/lib/db", () => ({
          prisma: {
            configuracion: {
              findMany: vi.fn(),
              upsert: vi.fn(),
            },
          },
        }))
      })

      it("GET sin sesión retorna 401 y no expone configuración", async () => {
        const { GET } = await import("@/app/api/configuracion/route")
        const res = await GET()

        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.error.codigo).toBe("NO_AUTENTICADO")

        const { prisma } = await import("@/lib/db")
        expect(prisma.configuracion.findMany).not.toHaveBeenCalled()
      })

      it("PUT sin sesión retorna 401 y no modifica configuración", async () => {
        const { PUT } = await import("@/app/api/configuracion/route")
        const res = await PUT(reqPut({ color_hue: 200, color_saturation: 0.5, color_lightness: 0.4 }))

        expect(res.status).toBe(401)
        const body = await res.json()
        expect(body.error.codigo).toBe("NO_AUTENTICADO")

        const { prisma } = await import("@/lib/db")
        expect(prisma.configuracion.upsert).not.toHaveBeenCalled()
      })
    })

    // --- R8.5: Sesión sin Organizacion_Activa → 403 ---
    describe("R8.5: sesión válida sin Organizacion_Activa → 403", () => {
      beforeEach(() => {
        // resolverContexto devuelve 409 SIN_ORGANIZACION_ACTIVA; la ruta lo
        // re-mapea localmente a 403 (resolverContextoConfiguracion).
        vi.doMock("@/lib/auth/contexto-request", () => ({
          resolverContexto: vi.fn().mockResolvedValue({
            error: errorAuth("SIN_ORGANIZACION_ACTIVA", 409),
          }),
        }))
        vi.doMock("@/lib/db", () => ({
          prisma: {
            configuracion: {
              findMany: vi.fn(),
              upsert: vi.fn(),
            },
          },
        }))
      })

      it("GET con sesión sin org activa retorna 403", async () => {
        const { GET } = await import("@/app/api/configuracion/route")
        const res = await GET()

        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")

        const { prisma } = await import("@/lib/db")
        expect(prisma.configuracion.findMany).not.toHaveBeenCalled()
      })

      it("PUT con sesión sin org activa retorna 403 y no modifica estado", async () => {
        const { PUT } = await import("@/app/api/configuracion/route")
        const res = await PUT(reqPut({ color_hue: 200, color_saturation: 0.5, color_lightness: 0.4 }))

        expect(res.status).toBe(403)
        const body = await res.json()
        expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")

        const { prisma } = await import("@/lib/db")
        expect(prisma.configuracion.upsert).not.toHaveBeenCalled()
      })
    })

    // --- R6.4: PUT de color válido → 200 con el color devuelto ---
    describe("R6.4: PUT de Color_Tema válido → 200 con el color persistido", () => {
      let upsertMock: ReturnType<typeof vi.fn>

      beforeEach(() => {
        vi.doMock("@/lib/auth/contexto-request", () => ({
          resolverContexto: vi.fn().mockResolvedValue({
            ctx: {
              usuarioActual: { id: "usr-001", correo: "a@b.co", nombre: "Test" },
              organizacionActiva: { id: ORG_ID, nombre: "Org", slug: "org" },
              rol: "propietario",
              permisos: [],
              sesionId: "ses-001",
            },
          }),
        }))

        // Capa de datos en memoria: upsert almacena, findMany devuelve el estado.
        const store: Record<string, string> = {}
        upsertMock = vi.fn().mockImplementation(({ where, create, update }: any) => {
          const clave = where.organizacion_id_clave.clave
          store[clave] = update.valor ?? create.valor
          return Promise.resolve({ ...create, valor: store[clave] })
        })

        vi.doMock("@/lib/db", () => ({
          prisma: {
            configuracion: {
              findMany: vi.fn().mockImplementation(({ where }: any) => {
                if (where.organizacion_id !== ORG_ID) return Promise.resolve([])
                return Promise.resolve(
                  Object.entries(store).map(([clave, valor]) => ({
                    organizacion_id: ORG_ID,
                    clave,
                    valor,
                  }))
                )
              }),
              upsert: upsertMock,
            },
          },
        }))
      })

      it("devuelve 200 y el Color_Tema enviado coincide con el persistido", async () => {
        const { PUT } = await import("@/app/api/configuracion/route")
        const payload = { color_hue: 200, color_saturation: 0.5, color_lightness: 0.4 }
        const res = await PUT(reqPut(payload))

        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.color_hue).toBe(200)
        expect(body.color_saturation).toBe(0.5)
        expect(body.color_lightness).toBe(0.4)

        // Se persistieron las tres claves de color vía upsert
        expect(upsertMock).toHaveBeenCalledTimes(3)
      })
    })

    // --- R6.5: PUT de color inválido → 422 con detalle por campo ---
    describe("R6.5: PUT de Color_Tema inválido → 422 con detalle por campo", () => {
      let upsertMock: ReturnType<typeof vi.fn>

      beforeEach(() => {
        vi.doMock("@/lib/auth/contexto-request", () => ({
          resolverContexto: vi.fn().mockResolvedValue({
            ctx: {
              usuarioActual: { id: "usr-001", correo: "a@b.co", nombre: "Test" },
              organizacionActiva: { id: ORG_ID, nombre: "Org", slug: "org" },
              rol: "propietario",
              permisos: [],
              sesionId: "ses-001",
            },
          }),
        }))

        upsertMock = vi.fn()
        vi.doMock("@/lib/db", () => ({
          prisma: {
            configuracion: {
              findMany: vi.fn().mockResolvedValue([]),
              upsert: upsertMock,
            },
          },
        }))
      })

      it("color_hue fuera de rango → 422 con detalle del campo y sin mutar estado", async () => {
        const { PUT } = await import("@/app/api/configuracion/route")
        // color_hue máximo es 360; 400 es inválido
        const res = await PUT(reqPut({ color_hue: 400 }))

        expect(res.status).toBe(422)
        const body = await res.json()
        expect(body.error.codigo).toBe("VALIDACION")
        expect(Array.isArray(body.error.detalles.errores)).toBe(true)

        const campos = body.error.detalles.errores.map((e: any) => e.campo)
        expect(campos).toContain("color_hue")
        // cada detalle identifica campo y motivo
        for (const detalle of body.error.detalles.errores) {
          expect(typeof detalle.campo).toBe("string")
          expect(typeof detalle.mensaje).toBe("string")
          expect(detalle.mensaje.length).toBeGreaterThan(0)
        }

        // Estado sin cambios: no se invocó ningún upsert
        expect(upsertMock).not.toHaveBeenCalled()
      })
    })
  }
)
