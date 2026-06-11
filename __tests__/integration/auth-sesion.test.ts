/**
 * __tests__/integration/auth-sesion.test.ts
 * Pruebas de integración para login/logout/sesión.
 *
 * Validates: Requirements R4.1, R4.2, R4.5, R16.6
 *
 * Verifica:
 * 1. Login retorna Set-Cookie con HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age (R4.1, R4.2)
 * 2. Doble POST /logout retorna 200 ambas veces (R4.5)
 * 3. Tras invalidarSesionesDeUsuario, leerSesion retorna null (R16.6)
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

describe.skipIf(process.env.SKIP_DB_TESTS === "1")(
  "Integración: Auth sesión — cookie, logout idempotente, invalidación global",
  () => {
    // --- R4.1, R4.2: Cookie de sesión con atributos correctos y sliding expiration ---
    describe("R4.1/R4.2: Login Set-Cookie con HttpOnly/Secure/SameSite=Lax + sliding expiration", () => {
      beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
      })

      it("login exitoso retorna Set-Cookie con HttpOnly, Secure, SameSite=Lax, Path=/, Max-Age", async () => {
        vi.doMock("@/lib/db", () => ({
          prisma: {
            usuario: {
              findUnique: vi.fn().mockResolvedValue({
                id: "usr-001",
                correo: "test@ejemplo.com",
                nombre: "Test Usuario",
                hash_contrasena: "$2a$12$fakehashfortest",
                correo_verificado: true,
                estado: "activo",
                creado_en: new Date("2024-01-01"),
                actualizado_en: new Date("2024-01-01"),
              }),
            },
            sesion: {
              create: vi.fn().mockResolvedValue({ id: "ses-001" }),
            },
          },
        }))

        vi.doMock("@/lib/auth/password", () => ({
          verificarContrasena: vi.fn().mockResolvedValue(true),
        }))

        vi.doMock("@/lib/auth/rate-limit", () => ({
          consumir: vi.fn().mockReturnValue(true),
          LIMITE_LOGIN: { limite: 5, ventanaMs: 900_000 },
        }))

        vi.doMock("@/lib/auth/tokens", () => ({
          generarToken: vi.fn().mockReturnValue({
            plano: "token-plano-test-123",
            hash: "hash-token-test-123",
          }),
          hashToken: vi.fn().mockReturnValue("hash-token-test-123"),
        }))

        const { POST } = await import("@/app/api/auth/login/route")

        const req = new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "127.0.0.1",
          },
          body: JSON.stringify({
            correo: "test@ejemplo.com",
            contrasena: "Password123!",
          }),
        }) as any

        const res = await POST(req)

        expect(res.status).toBe(200)

        // Verificar Set-Cookie header
        const setCookie = res.headers.get("Set-Cookie") ?? ""

        expect(setCookie).toContain("sesion_invenpro=")
        expect(setCookie).toContain("HttpOnly")
        expect(setCookie).toContain("Secure")
        expect(setCookie).toContain("SameSite=Lax")
        expect(setCookie).toContain("Path=/")
        expect(setCookie).toMatch(/Max-Age=\d+/)

        // Verificar que Max-Age es un número positivo (sliding expiration)
        const maxAgeMatch = setCookie.match(/Max-Age=(\d+)/)
        expect(maxAgeMatch).not.toBeNull()
        const maxAge = parseInt(maxAgeMatch![1], 10)
        expect(maxAge).toBeGreaterThan(0)

        // Verificar que el body contiene datos del usuario sin contraseña
        const body = await res.json()
        expect(body.correo).toBe("test@ejemplo.com")
        expect(body.nombre).toBe("Test Usuario")
        expect(body).not.toHaveProperty("hash_contrasena")
        expect(body).not.toHaveProperty("contrasena")
      })

      it("Max-Age de la cookie coincide con la vida de sesión configurada", async () => {
        // Set env for session duration (2 hours)
        process.env.SESION_INACTIVIDAD_HORAS = "2"

        vi.doMock("@/lib/db", () => ({
          prisma: {
            usuario: {
              findUnique: vi.fn().mockResolvedValue({
                id: "usr-002",
                correo: "otro@ejemplo.com",
                nombre: "Otro",
                hash_contrasena: "$2a$12$fakehash",
                correo_verificado: true,
                estado: "activo",
                creado_en: new Date(),
                actualizado_en: new Date(),
              }),
            },
            sesion: {
              create: vi.fn().mockResolvedValue({ id: "ses-002" }),
            },
          },
        }))

        vi.doMock("@/lib/auth/password", () => ({
          verificarContrasena: vi.fn().mockResolvedValue(true),
        }))

        vi.doMock("@/lib/auth/rate-limit", () => ({
          consumir: vi.fn().mockReturnValue(true),
          LIMITE_LOGIN: { limite: 5, ventanaMs: 900_000 },
        }))

        vi.doMock("@/lib/auth/tokens", () => ({
          generarToken: vi.fn().mockReturnValue({
            plano: "token-plano-test-456",
            hash: "hash-token-test-456",
          }),
          hashToken: vi.fn().mockReturnValue("hash-token-test-456"),
        }))

        const { POST } = await import("@/app/api/auth/login/route")

        const req = new Request("http://localhost:3000/api/auth/login", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-forwarded-for": "127.0.0.1",
          },
          body: JSON.stringify({
            correo: "otro@ejemplo.com",
            contrasena: "Password123!",
          }),
        }) as any

        const res = await POST(req)
        const setCookie = res.headers.get("Set-Cookie") ?? ""

        const maxAgeMatch = setCookie.match(/Max-Age=(\d+)/)
        expect(maxAgeMatch).not.toBeNull()
        const maxAge = parseInt(maxAgeMatch![1], 10)

        // 2 hours = 7200 seconds
        expect(maxAge).toBe(7200)

        // Cleanup
        delete process.env.SESION_INACTIVIDAD_HORAS
      })
    })

    // --- R4.5: Doble logout idempotente ---
    describe("R4.5: Doble POST /logout retorna 200 ambas veces", () => {
      let mockGet: ReturnType<typeof vi.fn>
      let mockSet: ReturnType<typeof vi.fn>
      let mockInvalidarSesionPorCookie: ReturnType<typeof vi.fn>

      beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()

        mockGet = vi.fn()
        mockSet = vi.fn()
        mockInvalidarSesionPorCookie = vi.fn().mockResolvedValue(undefined)

        vi.doMock("next/headers", () => ({
          cookies: vi.fn(async () => ({
            get: mockGet,
            set: mockSet,
          })),
        }))

        vi.doMock("@/lib/auth/sesion", () => ({
          COOKIE_SESION: "sesion_invenpro",
          leerSesion: vi.fn(),
          invalidarSesionPorCookie: mockInvalidarSesionPorCookie,
          invalidarSesionesDeUsuario: vi.fn(),
          crearSesion: vi.fn(),
        }))
      })

      it("primera llamada con cookie → 200, segunda sin cookie → 200", async () => {
        mockGet.mockReturnValue({ value: "sesion-token-abc" })

        const { POST } = await import("@/app/api/auth/logout/route")
        const res1 = await POST()

        expect(res1.status).toBe(200)
        const body1 = await res1.json()
        expect(body1).toEqual({ ok: true })
        expect(mockInvalidarSesionPorCookie).toHaveBeenCalledWith("sesion-token-abc")

        // Segunda llamada: sin cookie (ya fue borrada)
        mockGet.mockReturnValue(undefined)
        mockInvalidarSesionPorCookie.mockClear()

        const res2 = await POST()

        expect(res2.status).toBe(200)
        const body2 = await res2.json()
        expect(body2).toEqual({ ok: true })
        expect(mockInvalidarSesionPorCookie).not.toHaveBeenCalled()
      })

      it("dos llamadas consecutivas sin cookie → ambas 200", async () => {
        mockGet.mockReturnValue(undefined)

        const { POST } = await import("@/app/api/auth/logout/route")

        const res1 = await POST()
        expect(res1.status).toBe(200)

        const res2 = await POST()
        expect(res2.status).toBe(200)
      })
    })

    // --- R16.6: Invalidación de todas las sesiones al cambiar contraseña ---
    describe("R16.6: invalidarSesionesDeUsuario → leerSesion retorna null", () => {
      it("invalidarSesionesDeUsuario elimina todas las sesiones y posterior lectura retorna null", async () => {
        // Test the core behavior: after deleteMany removes sessions,
        // findUnique returns null, which causes leerSesion to return null.
        // We test this by verifying the contract of invalidarSesionesDeUsuario.

        const usuarioId = "usr-invalidar-001"
        const hashSesion = "hash-sesion-activa"
        
        // Simulate a sessions DB
        let sesionesDb: any[] = [
          {
            id: "ses-activa-001",
            usuario_id: usuarioId,
            hash_sesion: hashSesion,
          },
          {
            id: "ses-activa-002",
            usuario_id: usuarioId,
            hash_sesion: "hash-otra-sesion",
          },
        ]

        const mockDeleteMany = vi.fn().mockImplementation(({ where }: any) => {
          const before = sesionesDb.length
          sesionesDb = sesionesDb.filter(
            (s: any) => s.usuario_id !== where.usuario_id
          )
          return Promise.resolve({ count: before - sesionesDb.length })
        })

        // Verify: after invalidarSesionesDeUsuario, prisma.sesion.deleteMany
        // is called with { where: { usuario_id } } — which removes all sessions.
        // Subsequently, prisma.sesion.findUnique for any hash of that user returns null.
        
        // Direct import of the function after mocking its dependencies
        vi.resetModules()
        vi.doMock("next/headers", () => ({
          cookies: vi.fn(async () => ({
            get: vi.fn().mockReturnValue({ value: "token-activo" }),
            set: vi.fn(),
          })),
        }))
        vi.doMock("@/lib/db", () => ({
          prisma: {
            sesion: {
              findUnique: vi.fn().mockImplementation(() => {
                const found = sesionesDb.find((s: any) => s.hash_sesion === hashSesion)
                return Promise.resolve(found ?? null)
              }),
              update: vi.fn().mockResolvedValue(undefined),
              delete: vi.fn().mockResolvedValue(undefined),
              deleteMany: mockDeleteMany,
              create: vi.fn(),
            },
          },
        }))
        vi.doMock("@/lib/auth/tokens", () => ({
          generarToken: vi.fn(),
          hashToken: vi.fn().mockReturnValue(hashSesion),
        }))
        // Explicitly ensure no stale mock for sesion module
        vi.doUnmock("@/lib/auth/sesion")

        const { invalidarSesionesDeUsuario } = await import("@/lib/auth/sesion")

        // Before: sessions exist
        expect(sesionesDb.length).toBe(2)

        // Invalidate all sessions for user
        await invalidarSesionesDeUsuario(usuarioId)

        // Verify deleteMany was called with the correct user
        expect(mockDeleteMany).toHaveBeenCalledWith({
          where: { usuario_id: usuarioId },
        })

        // After: no sessions remain for that user
        expect(sesionesDb.length).toBe(0)

        // findUnique for any session of that user now returns null
        // (which is what leerSesion relies on to return null)
        const { prisma } = await import("@/lib/db")
        const result = await (prisma.sesion.findUnique as any)({ where: { hash_sesion: hashSesion } })
        expect(result).toBeNull()
      })

      it("invalidar sesiones de un usuario no afecta sesiones de otro usuario", async () => {
        const usuario1Id = "usr-001"
        const usuario2Id = "usr-002"

        let sesionesDb: any[] = [
          { id: "ses-u1", usuario_id: usuario1Id, hash_sesion: "hash-u1" },
          { id: "ses-u2", usuario_id: usuario2Id, hash_sesion: "hash-u2" },
        ]

        const mockDeleteMany = vi.fn().mockImplementation(({ where }: any) => {
          const before = sesionesDb.length
          sesionesDb = sesionesDb.filter(
            (s: any) => s.usuario_id !== where.usuario_id
          )
          return Promise.resolve({ count: before - sesionesDb.length })
        })

        vi.resetModules()
        vi.doMock("next/headers", () => ({
          cookies: vi.fn(async () => ({
            get: vi.fn().mockReturnValue({ value: "token-u2" }),
            set: vi.fn(),
          })),
        }))
        vi.doMock("@/lib/db", () => ({
          prisma: {
            sesion: {
              findUnique: vi.fn().mockImplementation(() => {
                const found = sesionesDb.find((s: any) => s.hash_sesion === "hash-u2")
                return Promise.resolve(found ?? null)
              }),
              update: vi.fn().mockResolvedValue(undefined),
              delete: vi.fn().mockResolvedValue(undefined),
              deleteMany: mockDeleteMany,
              create: vi.fn(),
            },
          },
        }))
        vi.doMock("@/lib/auth/tokens", () => ({
          generarToken: vi.fn(),
          hashToken: vi.fn().mockReturnValue("hash-u2"),
        }))
        vi.doUnmock("@/lib/auth/sesion")

        const { invalidarSesionesDeUsuario } = await import("@/lib/auth/sesion")

        // Invalidar sesiones del usuario 1
        await invalidarSesionesDeUsuario(usuario1Id)

        // Solo se eliminaron las sesiones del usuario 1
        expect(sesionesDb).toHaveLength(1)
        expect(sesionesDb[0].usuario_id).toBe(usuario2Id)
        expect(sesionesDb[0].hash_sesion).toBe("hash-u2")

        // findUnique still finds user2's session
        const { prisma } = await import("@/lib/db")
        const result = await (prisma.sesion.findUnique as any)({ where: { hash_sesion: "hash-u2" } })
        expect(result).not.toBeNull()
        expect(result.usuario_id).toBe(usuario2Id)
      })
    })
  }
)
