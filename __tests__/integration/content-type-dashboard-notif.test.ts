// __tests__/integration/content-type-dashboard-notif.test.ts
//
// Smoke test de Content-Type para los Route Handlers nuevos de
// dashboard-metricas-notificaciones. Verifica que cada endpoint responde con
// `Content-Type: application/json; charset=utf-8`.
//
// Estrategia: la mayoría de los handlers garantizan el Content-Type ya en su
// camino de validación (422), que NO toca la base de datos. Esos casos se
// ejercitan SIEMPRE (sin BD):
//   - GET  /api/dashboard/metricas              : sin `desde`/`hasta` ⇒ 422.
//   - GET  /api/dashboard/rankings              : sin `desde`/`hasta` ⇒ 422.
//   - GET  /api/notificaciones                  : `solo_no_leidas` inválido ⇒ 422.
//   - PATCH /api/notificaciones/{id}            : `id` no-uuid ⇒ 422.
//
// Los handlers sin camino de validación (consultan BD directamente) se
// verifican sólo cuando hay una base disponible:
//   - GET  /api/notificaciones/conteo           : 200 { conteo }.
//   - POST /api/notificaciones/marcar-todas-leidas : 200 { actualizadas }.
//
// Sigue la convención de `__tests__/unit/content-type-smoke.test.ts` y de las
// pruebas de integración que invocan los handlers con `NextRequest`/`Request`.
//
// Validates: Requirements R2.14, R3.13, R8.11
import { describe, it, expect } from "vitest"
import { NextRequest } from "next/server"

const CONTENT_TYPE = "application/json; charset=utf-8"
const BASE = "http://localhost:3000"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

function reqGet(path: string): NextRequest {
  return new NextRequest(`${BASE}${path}`)
}

describe("Smoke — Content-Type de endpoints de dashboard y notificaciones", () => {
  // --- Caminos de validación (422), sin BD ---

  it("GET /api/dashboard/metricas (422 sin parámetros) responde JSON utf-8", async () => {
    const { GET } = await import("@/app/api/dashboard/metricas/route")
    const res = await GET(reqGet("/api/dashboard/metricas"))
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("GET /api/dashboard/rankings (422 sin parámetros) responde JSON utf-8", async () => {
    const { GET } = await import("@/app/api/dashboard/rankings/route")
    const res = await GET(reqGet("/api/dashboard/rankings"))
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("GET /api/notificaciones (422 solo_no_leidas inválido) responde JSON utf-8", async () => {
    const { GET } = await import("@/app/api/notificaciones/route")
    const res = await GET(reqGet("/api/notificaciones?solo_no_leidas=quiza"))
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("PATCH /api/notificaciones/{id} (422 id no-uuid) responde JSON utf-8", async () => {
    const { PATCH } = await import("@/app/api/notificaciones/[id]/route")
    const res = await PATCH(reqGet("/api/notificaciones/no-es-uuid"), {
      params: Promise.resolve({ id: "no-es-uuid" }),
    })
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })
})

// --- Endpoints que consultan BD directamente (sin camino de validación) ---
describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Smoke — Content-Type de endpoints de notificaciones que requieren BD",
  () => {
    it("GET /api/notificaciones/conteo responde JSON utf-8", async () => {
      const { GET } = await import("@/app/api/notificaciones/conteo/route")
      const res = await GET()
      expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    })

    it("POST /api/notificaciones/marcar-todas-leidas responde JSON utf-8", async () => {
      const { POST } = await import("@/app/api/notificaciones/marcar-todas-leidas/route")
      const res = await POST()
      expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    })
  },
)
