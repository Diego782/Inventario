// __tests__/integration/content-type-clientes-deuda.test.ts
//
// Smoke tests de integración para los nuevos endpoints de la spec
// `gestion-clientes-y-fiadores`. Verifican dos propiedades sin base de datos:
//
//   1. Content-Type: application/json; charset=utf-8
//      Se ejercitan los caminos de validación (422) que no tocan la BD.
//
//   2. Auth guard sin organización activa → 409 SIN_ORGANIZACION_ACTIVA
//      Se verifica que cada endpoint retorna 409 cuando `resolverContexto`
//      devuelve el error de tenant faltante, sin consultar la BD.
//
// Endpoints cubiertos:
//   - GET  /api/clientes                                 (422: take inválido)
//   - POST /api/clientes                                 (422: body inválido)
//   - GET  /api/clientes/[id]                            (no hay path de validación 422,
//                                                         se verifica sólo el auth guard)
//   - GET  /api/deuda/fiadores                           (auth guard sólo)
//   - GET  /api/deuda/[cliente_id]                       (auth guard sólo)
//   - POST /api/deuda/[cliente_id]/abono                 (422: body inválido)
//   - GET  /api/inventario/valor                         (auth guard sólo)
//   - POST /api/notificaciones/[id]/extender-deuda       (422: id no-uuid;
//                                                         422: body inválido)
//
// Sigue el patrón de `content-type-dashboard-notif.test.ts`.
//
// Validates: Requirements 4.1, 4.5, 4.7, 5.1, 5.7, 2.7, 8.8, 8.9
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { errorAuth } from "@/lib/api/respuestas-auth"

const CONTENT_TYPE = "application/json; charset=utf-8"
const BASE = "http://localhost:3000"

// ── Helpers ──────────────────────────────────────────────────────────────────

function reqGet(path: string): NextRequest {
  return new NextRequest(`${BASE}${path}`)
}

function reqPost(path: string, body: unknown): NextRequest {
  return new NextRequest(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  })
}

/** Contexto válido con organización activa. */
function ctxValido(organizacion_id = "00000000-0000-4000-8000-000000000001") {
  return {
    ctx: {
      usuarioActual: { id: "usr-001", correo: "test@test.com", nombre: "Test" },
      organizacionActiva: { id: organizacion_id, nombre: "Org Test", slug: "org-test" },
      rol: "propietario",
      permisos: [
        { seccion: "clientes", accion: "ver" },
        { seccion: "clientes", accion: "crear" },
        { seccion: "clientes", accion: "editar" },
        { seccion: "clientes", accion: "eliminar" },
        { seccion: "fiadores", accion: "ver" },
        { seccion: "fiadores", accion: "editar" },
        { seccion: "inventario", accion: "ver" },
        { seccion: "ventas", accion: "editar" },
      ],
      sesionId: "ses-001",
    },
  }
}

/** Respuesta de resolverContexto cuando no hay organización activa. */
function ctxSinOrg() {
  return { error: errorAuth("SIN_ORGANIZACION_ACTIVA", 409) }
}

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 1 — Content-Type: caminos de validación 422 (sin BD)
// ════════════════════════════════════════════════════════════════════════════
describe("Smoke — Content-Type de los nuevos endpoints (422 sin BD)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxValido()),
    }))
  })

  // ── /api/clientes ──────────────────────────────────────────────────────

  it("GET /api/clientes (422: take inválido) responde JSON utf-8", async () => {
    const { GET } = await import("@/app/api/clientes/route")
    const res = await GET(reqGet("/api/clientes?take=abc"))
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("POST /api/clientes (422: body vacío) responde JSON utf-8", async () => {
    const { POST } = await import("@/app/api/clientes/route")
    const res = await POST(reqPost("/api/clientes", {}))
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("POST /api/clientes (422: cédula demasiado corta) responde JSON utf-8", async () => {
    const { POST } = await import("@/app/api/clientes/route")
    const res = await POST(
      reqPost("/api/clientes", {
        cedula: "abc", // < 5 caracteres
        nombre: "Juan Pérez",
        telefono: "04141234567",
      })
    )
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("POST /api/clientes (422: teléfono con letras) responde JSON utf-8", async () => {
    const { POST } = await import("@/app/api/clientes/route")
    const res = await POST(
      reqPost("/api/clientes", {
        cedula: "ABCDE12345",
        nombre: "Juan Pérez",
        telefono: "no-es-telefono",
      })
    )
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("POST /api/clientes (422: correo con formato inválido) responde JSON utf-8", async () => {
    const { POST } = await import("@/app/api/clientes/route")
    const res = await POST(
      reqPost("/api/clientes", {
        cedula: "ABCDE12345",
        nombre: "Juan Pérez",
        telefono: "04141234567",
        correo: "no-es-correo",
      })
    )
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  // ── /api/deuda/[cliente_id]/abono ──────────────────────────────────────

  it("POST /api/deuda/[cliente_id]/abono (422: body vacío) responde JSON utf-8", async () => {
    const { POST } = await import("@/app/api/deuda/[cliente_id]/abono/route")
    const res = await POST(reqPost("/api/deuda/abc/abono", {}), {
      params: Promise.resolve({ cliente_id: "00000000-0000-4000-8000-000000000001" }),
    })
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  it("POST /api/deuda/[cliente_id]/abono (422: monto negativo) responde JSON utf-8", async () => {
    const { POST } = await import("@/app/api/deuda/[cliente_id]/abono/route")
    const res = await POST(
      reqPost("/api/deuda/abc/abono", { monto: -5 }),
      {
        params: Promise.resolve({ cliente_id: "00000000-0000-4000-8000-000000000001" }),
      }
    )
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })

  // ── /api/notificaciones/[id]/extender-deuda ────────────────────────────

  it("POST /api/notificaciones/[id]/extender-deuda (422: id no-uuid) responde JSON utf-8", async () => {
    const { POST } = await import(
      "@/app/api/notificaciones/[id]/extender-deuda/route"
    )
    const res = await POST(
      reqPost("/api/notificaciones/no-es-uuid/extender-deuda", {
        nueva_fecha: "2030-01-01",
      }),
      { params: Promise.resolve({ id: "no-es-uuid" }) }
    )
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
  })
})

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 2 — Auth guard: sin organización activa → 409 SIN_ORGANIZACION_ACTIVA
// ════════════════════════════════════════════════════════════════════════════
describe("Auth guard — sin organización activa → 409 SIN_ORGANIZACION_ACTIVA", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxSinOrg()),
    }))
    // Mock de DB para asegurar que no se consulta la BD
    vi.doMock("@/lib/db", () => ({
      prisma: {
        cliente: { findMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
        movimientoDeuda: { findMany: vi.fn() },
        producto: { findMany: vi.fn() },
        venta: { findFirst: vi.fn() },
        notificacion: { findFirst: vi.fn() },
      },
    }))
  })

  // ── /api/clientes ──────────────────────────────────────────────────────

  it("GET /api/clientes sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 4.5)", async () => {
    const { GET } = await import("@/app/api/clientes/route")
    const res = await GET(reqGet("/api/clientes"))
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  it("POST /api/clientes sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 4.1)", async () => {
    const { POST } = await import("@/app/api/clientes/route")
    const res = await POST(
      reqPost("/api/clientes", {
        cedula: "ABCDE12345",
        nombre: "Juan Pérez",
        telefono: "04141234567",
      })
    )
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  // ── /api/clientes/[id] ─────────────────────────────────────────────────

  it("GET /api/clientes/[id] sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 4.7)", async () => {
    const { GET } = await import("@/app/api/clientes/[id]/route")
    const id = "00000000-0000-4000-8000-000000000001"
    const res = await GET(reqGet(`/api/clientes/${id}`), {
      params: Promise.resolve({ id }),
    })
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  it("PATCH /api/clientes/[id] sin org activa → 409 SIN_ORGANIZACION_ACTIVA", async () => {
    const { PATCH } = await import("@/app/api/clientes/[id]/route")
    const id = "00000000-0000-4000-8000-000000000001"
    const res = await PATCH(
      new NextRequest(`${BASE}/api/clientes/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nombre: "Nuevo Nombre" }),
      }),
      { params: Promise.resolve({ id }) }
    )
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  it("DELETE /api/clientes/[id] sin org activa → 409 SIN_ORGANIZACION_ACTIVA", async () => {
    const { DELETE } = await import("@/app/api/clientes/[id]/route")
    const id = "00000000-0000-4000-8000-000000000001"
    const res = await DELETE(reqGet(`/api/clientes/${id}`), {
      params: Promise.resolve({ id }),
    })
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  // ── /api/deuda/fiadores ────────────────────────────────────────────────

  it("GET /api/deuda/fiadores sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 5.1)", async () => {
    const { GET } = await import("@/app/api/deuda/fiadores/route")
    const res = await GET()
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  // ── /api/deuda/[cliente_id] ────────────────────────────────────────────

  it("GET /api/deuda/[cliente_id] sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 5.7)", async () => {
    const { GET } = await import("@/app/api/deuda/[cliente_id]/route")
    const cliente_id = "00000000-0000-4000-8000-000000000001"
    const res = await GET(reqGet(`/api/deuda/${cliente_id}`), {
      params: Promise.resolve({ cliente_id }),
    })
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  // ── /api/deuda/[cliente_id]/abono ──────────────────────────────────────

  it("POST /api/deuda/[cliente_id]/abono sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 5.7)", async () => {
    const { POST } = await import("@/app/api/deuda/[cliente_id]/abono/route")
    const cliente_id = "00000000-0000-4000-8000-000000000001"
    const res = await POST(
      reqPost(`/api/deuda/${cliente_id}/abono`, { monto: 100 }),
      { params: Promise.resolve({ cliente_id }) }
    )
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  // ── /api/inventario/valor ─────────────────────────────────────────────

  it("GET /api/inventario/valor sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 2.7)", async () => {
    const { GET } = await import("@/app/api/inventario/valor/route")
    const res = await GET(reqGet("/api/inventario/valor"))
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })

  // ── /api/notificaciones/[id]/extender-deuda ────────────────────────────

  it("POST /api/notificaciones/[id]/extender-deuda sin org activa → 409 SIN_ORGANIZACION_ACTIVA (Req 8.8, 8.9)", async () => {
    const { POST } = await import(
      "@/app/api/notificaciones/[id]/extender-deuda/route"
    )
    const id = "00000000-0000-4000-8000-000000000001"
    const res = await POST(
      reqPost(`/api/notificaciones/${id}/extender-deuda`, {
        nueva_fecha: "2030-01-01",
      }),
      { params: Promise.resolve({ id }) }
    )
    expect(res.status).toBe(409)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)
    const body = await res.json()
    expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
  })
})

// ════════════════════════════════════════════════════════════════════════════
// GRUPO 3 — Respuesta de error de validación tiene Content-Type correcto
//           Verifica el body de error además del header
// ════════════════════════════════════════════════════════════════════════════
describe("Smoke — Estructura del error de validación 422", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxValido()),
    }))
  })

  it("POST /api/clientes body inválido → error.codigo VALIDACION con campo", async () => {
    const { POST } = await import("@/app/api/clientes/route")
    const res = await POST(reqPost("/api/clientes", { cedula: "AB" }))
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)

    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.codigo).toBe("VALIDACION")
  })

  it("POST /api/deuda/[cliente_id]/abono monto cero → 422 con código VALIDACION", async () => {
    const { POST } = await import("@/app/api/deuda/[cliente_id]/abono/route")
    const res = await POST(reqPost("/api/deuda/abc/abono", { monto: 0 }), {
      params: Promise.resolve({ cliente_id: "00000000-0000-4000-8000-000000000001" }),
    })
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)

    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.codigo).toBe("VALIDACION")
  })

  it("POST /api/notificaciones/[id]/extender-deuda id no-uuid → 422 con campos de error", async () => {
    const { POST } = await import(
      "@/app/api/notificaciones/[id]/extender-deuda/route"
    )
    const res = await POST(
      reqPost("/api/notificaciones/no-uuid/extender-deuda", {
        nueva_fecha: "2030-06-01",
      }),
      { params: Promise.resolve({ id: "no-uuid" }) }
    )
    expect(res.status).toBe(422)
    expect(res.headers.get("content-type")).toBe(CONTENT_TYPE)

    const body = await res.json()
    expect(body.error).toBeDefined()
    expect(body.error.codigo).toBe("VALIDACION")
  })
})
