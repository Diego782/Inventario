// __tests__/integration/notificaciones-endpoints.test.ts
//
// Pruebas de integración de los Route Handlers de notificaciones contra MySQL real.
// Invoca directamente las funciones exportadas por los handlers (GET/PATCH/POST),
// pasando un `NextRequest`/`Request` real, siguiendo la convención del resto de
// pruebas del proyecto (p. ej. auth-sesion / configuracion-color-acceso).
//
// Cubre:
//   - GET /api/notificaciones            : orden desc por (creado_en, id), tope 100,
//                                          filtro `solo_no_leidas` (R8.1, R8.3, R8.4).
//   - GET /api/notificaciones/conteo     : conteo de no leídas (R8.5).
//   - PATCH /api/notificaciones/{id}     : marca leída, idempotente y 404 (R8.6, R8.7, R8.8).
//   - POST /api/notificaciones/marcar-todas-leidas : pone en 0 las no leídas (R8.9).
//
// Para que las aserciones de orden/tope/conteo sean deterministas frente a datos
// preexistentes, las notificaciones sembradas usan un `tipo` único por corrida y las
// listas devueltas por el listado se FILTRAN a ese conjunto. El conteo y el
// marcar-todas-leidas se verifican mediante deltas (antes/después) ya que operan
// globalmente sobre `leida = false`.
//
// Validates: Requirements R8.1, R8.3, R8.6, R8.7, R8.8, R8.9
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { NextRequest } from "next/server"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Marca única de esta corrida para aislar las filas sembradas de cualquier dato
// preexistente en la base.
const TIPO = `test_endpoints_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`

const BASE = "http://localhost:3000"

// Construye un NextRequest para los handlers que leen `req.nextUrl` (listado).
function reqGet(path: string): NextRequest {
  return new NextRequest(`${BASE}${path}`)
}

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Integración: endpoints de notificaciones",
  () => {
    let prisma: import("@prisma/client").PrismaClient

    // IDs sembrados (orden de inserción cronológico ascendente por creado_en).
    const seedIds: string[] = []

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p

      // Siembra 5 notificaciones con `creado_en` crecientes; dos de ellas comparten
      // exactamente el mismo `creado_en` para ejercitar el desempate por `id` desc.
      const base = new Date("2025-06-15T12:00:00.000Z")
      const colision = new Date("2025-06-15T12:00:05.000Z")

      // n0..n4: n0 más antigua, n4 más reciente. n2 y n3 colisionan en creado_en.
      const filas = [
        { creado_en: new Date(base.getTime() + 0), leida: false, titulo: "n0" },
        { creado_en: new Date(base.getTime() + 1000), leida: true, titulo: "n1" },
        { creado_en: colision, leida: false, titulo: "n2" },
        { creado_en: colision, leida: false, titulo: "n3" },
        { creado_en: new Date(base.getTime() + 10000), leida: false, titulo: "n4" },
      ]

      for (const f of filas) {
        const creada = await prisma.notificacion.create({
          data: {
            tipo: TIPO,
            titulo: f.titulo,
            mensaje: `mensaje ${f.titulo}`,
            leida: f.leida,
            creado_en: f.creado_en,
            // clave_deduplicacion nula: se permiten múltiples (R6.5).
          },
        })
        seedIds.push(creada.id)
      }
    })

    afterAll(async () => {
      if (!prisma) return
      await prisma.notificacion.deleteMany({ where: { tipo: TIPO } })
    })

    it("GET listado: ordena desc por creado_en con desempate desc por id (R8.1)", async () => {
      const { GET } = await import("@/app/api/notificaciones/route")
      const res = await GET(reqGet("/api/notificaciones"))
      expect(res.status).toBe(200)

      const body: Array<{ id: string; tipo: string }> = await res.json()
      const mios = body.filter((n) => n.tipo === TIPO).map((n) => n.id)

      // n2 y n3 colisionan en creado_en ⇒ entre ellas gana el id mayor (desc).
      const [id2, id3] = [seedIds[2], seedIds[3]]
      const colisionDesc = id2 > id3 ? [id2, id3] : [id3, id2]

      // Orden esperado: n4 (más reciente), luego la colisión por id desc, n1, n0.
      const esperado = [seedIds[4], ...colisionDesc, seedIds[1], seedIds[0]]
      expect(mios).toEqual(esperado)
    })

    it("GET listado: solo_no_leidas=true devuelve únicamente no leídas (R8.3)", async () => {
      const { GET } = await import("@/app/api/notificaciones/route")
      const res = await GET(reqGet("/api/notificaciones?solo_no_leidas=true"))
      expect(res.status).toBe(200)

      const body: Array<{ id: string; tipo: string; leida: boolean }> = await res.json()
      const mios = body.filter((n) => n.tipo === TIPO)

      // Todas las devueltas son no leídas y n1 (leída) queda excluida.
      expect(mios.every((n) => n.leida === false)).toBe(true)
      expect(mios.map((n) => n.id)).not.toContain(seedIds[1])
      // n0, n2, n3, n4 son no leídas ⇒ 4 elementos.
      expect(mios).toHaveLength(4)
    })

    it("GET listado: valor inválido de solo_no_leidas devuelve 422 (R8.2/R8.10)", async () => {
      const { GET } = await import("@/app/api/notificaciones/route")
      const res = await GET(reqGet("/api/notificaciones?solo_no_leidas=quiza"))
      expect(res.status).toBe(422)

      const body = await res.json()
      expect(body.error.codigo).toBe("VALIDACION")
    })

    it("GET listado: aplica el tope de 100 elementos (R8.1)", async () => {
      // Siembra 120 notificaciones no leídas con un tipo propio y verifica que el
      // listado nunca devuelve más de 100 de ellas.
      const tipoTope = `${TIPO}_tope`
      const data = Array.from({ length: 120 }, (_, i) => ({
        tipo: tipoTope,
        titulo: `tope ${i}`,
        mensaje: `m ${i}`,
        leida: false,
        creado_en: new Date(Date.UTC(2025, 0, 1, 0, 0, 0) + i * 1000),
      }))
      await prisma.notificacion.createMany({ data })

      try {
        const { GET } = await import("@/app/api/notificaciones/route")
        const res = await GET(reqGet("/api/notificaciones"))
        const body: Array<{ tipo: string }> = await res.json()
        // El handler limita a 100 en total; los del tipoTope no pueden superar 100.
        const delTope = body.filter((n) => n.tipo === tipoTope)
        expect(body.length).toBeLessThanOrEqual(100)
        expect(delTope.length).toBeLessThanOrEqual(100)
      } finally {
        await prisma.notificacion.deleteMany({ where: { tipo: tipoTope } })
      }
    })

    it("GET conteo: refleja el número de notificaciones no leídas (R8.5)", async () => {
      const { GET } = await import("@/app/api/notificaciones/conteo/route")
      const res = await GET()
      expect(res.status).toBe(200)

      const body: { conteo: number } = await res.json()
      expect(Number.isInteger(body.conteo)).toBe(true)
      // Hay al menos las 4 no leídas sembradas (n0, n2, n3, n4).
      expect(body.conteo).toBeGreaterThanOrEqual(4)
    })

    it("PATCH: marca una no leída como leída y es idempotente (R8.6, R8.7)", async () => {
      const { PATCH } = await import("@/app/api/notificaciones/[id]/route")
      const objetivo = seedIds[0] // n0 está no leída

      const params = { params: Promise.resolve({ id: objetivo }) }
      const res1 = await PATCH(reqGet(`/api/notificaciones/${objetivo}`), params)
      expect(res1.status).toBe(200)
      const body1: { id: string; leida: boolean } = await res1.json()
      expect(body1.id).toBe(objetivo)
      expect(body1.leida).toBe(true)

      // Idempotente: marcar de nuevo una ya leída responde 200 sin cambio observable.
      const res2 = await PATCH(reqGet(`/api/notificaciones/${objetivo}`), {
        params: Promise.resolve({ id: objetivo }),
      })
      expect(res2.status).toBe(200)
      const body2: { leida: boolean } = await res2.json()
      expect(body2.leida).toBe(true)

      const enBd = await prisma.notificacion.findUnique({ where: { id: objetivo } })
      expect(enBd!.leida).toBe(true)
    })

    it("PATCH: id inexistente (uuid válido) devuelve 404 NOTIFICACION_NO_ENCONTRADA (R8.8)", async () => {
      const { PATCH } = await import("@/app/api/notificaciones/[id]/route")
      const idInexistente = "00000000-0000-4000-8000-0000000000ff"

      const res = await PATCH(reqGet(`/api/notificaciones/${idInexistente}`), {
        params: Promise.resolve({ id: idInexistente }),
      })
      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.error.codigo).toBe("NOTIFICACION_NO_ENCONTRADA")
    })

    it("PATCH: id con formato inválido devuelve 422 (R8.10)", async () => {
      const { PATCH } = await import("@/app/api/notificaciones/[id]/route")
      const res = await PATCH(reqGet("/api/notificaciones/no-es-uuid"), {
        params: Promise.resolve({ id: "no-es-uuid" }),
      })
      expect(res.status).toBe(422)
      const body = await res.json()
      expect(body.error.codigo).toBe("VALIDACION")
    })

    it("POST marcar-todas-leidas: deja el conteo de no leídas en 0 (R8.9)", async () => {
      const { POST } = await import("@/app/api/notificaciones/marcar-todas-leidas/route")
      const res = await POST()
      expect(res.status).toBe(200)

      const body: { actualizadas: number } = await res.json()
      expect(Number.isInteger(body.actualizadas)).toBe(true)
      expect(body.actualizadas).toBeGreaterThanOrEqual(0)

      // Tras marcar todas, el conteo global de no leídas es 0.
      const { GET: GETConteo } = await import("@/app/api/notificaciones/conteo/route")
      const resConteo = await GETConteo()
      const conteoBody: { conteo: number } = await resConteo.json()
      expect(conteoBody.conteo).toBe(0)

      // Y todas las sembradas quedan leídas.
      const restantes = await prisma.notificacion.count({
        where: { tipo: TIPO, leida: false },
      })
      expect(restantes).toBe(0)
    })
  },
)
