// __tests__/integration/aislamiento-metricas-rankings.test.ts
//
// Tests de ejemplo para el aislamiento multi-tenant en métricas y rankings
// del Dashboard (Req 1.4, 1.1, 1.2, 1.5) y para el guard de organización activa.
//
// Cubre dos grupos:
//
// 1. AISLAMIENTO (sin BD, con mocks): siembra dos organizaciones con datos
//    distintos y verifica que las métricas/rankings de org1 no incluyen
//    registros de org2, y viceversa.
//
// 2. GUARD SIN ORGANIZACIÓN (sin BD): verifica que una petición a los endpoints
//    de métricas/rankings sin organización activa resuelta responde con error
//    de autorización (SIN_ORGANIZACION_ACTIVA) y no devuelve ninguna métrica
//    ni ranking.
//
// Validates: Requirements 1.1, 1.2, 1.4, 1.5
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextRequest } from "next/server"
import { errorAuth } from "@/lib/api/respuestas-auth"

// ─── IDs de organización de prueba ─────────────────────────────────────────
const ORG_A = "00000000-aaaa-4000-8000-000000000001"
const ORG_B = "00000000-bbbb-4000-8000-000000000002"

// Parámetros de consulta válidos (rango civil + timezone implícita)
const DESDE = "2025-01-01"
const HASTA = "2025-12-31"

// Helper para construir una NextRequest de GET con los query params del dashboard
function metricasReq(extra: Record<string, string> = {}): NextRequest {
  const params = new URLSearchParams({ desde: DESDE, hasta: HASTA, ...extra })
  return new NextRequest(`http://localhost:3000/api/dashboard/metricas?${params}`)
}

function rankingsReq(extra: Record<string, string> = {}): NextRequest {
  const params = new URLSearchParams({ desde: DESDE, hasta: HASTA, ...extra })
  return new NextRequest(`http://localhost:3000/api/dashboard/rankings?${params}`)
}

// ─── Helpers de contexto ────────────────────────────────────────────────────
function ctxConOrg(organizacion_id: string) {
  return {
    ctx: {
      usuarioActual: { id: "usr-001", correo: "test@test.com", nombre: "Test" },
      organizacionActiva: { id: organizacion_id, nombre: "Org Test", slug: "org-test" },
      rol: "propietario",
      permisos: [{ seccion: "dashboard", accion: "ver" }],
      sesionId: "ses-001",
    },
  }
}

// ─── Datos de negocio sembrados para las dos organizaciones ─────────────────
// Org A tiene 2 ventas completadas; Org B tiene 1 venta completada.
// Las cifras son intencionalmente distintas para detectar filtraciones.
const EN_RANGO = new Date("2025-06-15T12:00:00.000Z")

function buildPrismaData() {
  // ventas
  const ventasOrgA = [
    { id: "vta-a1", organizacion_id: ORG_A, total: 100, estado: "completada", creado_en: EN_RANGO },
    { id: "vta-a2", organizacion_id: ORG_A, total: 200, estado: "completada", creado_en: EN_RANGO },
  ]
  const ventasOrgB = [
    { id: "vta-b1", organizacion_id: ORG_B, total: 9999, estado: "completada", creado_en: EN_RANGO },
  ]
  const todasLasVentas = [...ventasOrgA, ...ventasOrgB]

  // ítems de venta (precio_compra del producto embebido para calcular gasto)
  const itemsOrgA = [
    {
      id: "item-a1",
      organizacion_id: ORG_A,
      producto_id: "prod-a1",
      cantidad: 2,
      precio_unitario: 50,
      subtotal_linea: 100,
      venta: { estado: "completada", creado_en: EN_RANGO, organizacion_id: ORG_A },
      producto: { nombre: "Prod A1", precio_compra: 30, precio_venta: 50 },
    },
    {
      id: "item-a2",
      organizacion_id: ORG_A,
      producto_id: "prod-a2",
      cantidad: 4,
      precio_unitario: 50,
      subtotal_linea: 200,
      venta: { estado: "completada", creado_en: EN_RANGO, organizacion_id: ORG_A },
      producto: { nombre: "Prod A2", precio_compra: 25, precio_venta: 50 },
    },
  ]
  const itemsOrgB = [
    {
      id: "item-b1",
      organizacion_id: ORG_B,
      producto_id: "prod-b1",
      cantidad: 1,
      precio_unitario: 9999,
      subtotal_linea: 9999,
      venta: { estado: "completada", creado_en: EN_RANGO, organizacion_id: ORG_B },
      producto: { nombre: "Prod B1", precio_compra: 5000, precio_venta: 9999 },
    },
  ]
  const todosLosItems = [...itemsOrgA, ...itemsOrgB]

  // movimientos de stock (devoluciones)
  const movOrgA = [
    {
      id: "mov-a1",
      organizacion_id: ORG_A,
      producto_id: "prod-a1",
      tipo: "devolucion",
      cantidad: 1,
      creado_en: EN_RANGO,
      producto: { nombre: "Prod A1", precio_venta: 50 },
    },
  ]
  const movOrgB = [
    {
      id: "mov-b1",
      organizacion_id: ORG_B,
      producto_id: "prod-b1",
      tipo: "devolucion",
      cantidad: 3,
      creado_en: EN_RANGO,
      producto: { nombre: "Prod B1", precio_venta: 9999 },
    },
  ]
  const todosLosMov = [...movOrgA, ...movOrgB]

  // productos (para rankings y topMargin)
  const productosOrgA = [
    {
      id: "prod-a1",
      organizacion_id: ORG_A,
      nombre: "Prod A1",
      precio_compra: 30,
      precio_venta: 50,
      activo: true,
    },
    {
      id: "prod-a2",
      organizacion_id: ORG_A,
      nombre: "Prod A2",
      precio_compra: 25,
      precio_venta: 50,
      activo: true,
    },
  ]
  const productosOrgB = [
    {
      id: "prod-b1",
      organizacion_id: ORG_B,
      nombre: "Prod B1",
      precio_compra: 5000,
      precio_venta: 9999,
      activo: true,
    },
  ]
  const todosLosProductos = [...productosOrgA, ...productosOrgB]

  return {
    ventasOrgA,
    ventasOrgB,
    todasLasVentas,
    itemsOrgA,
    itemsOrgB,
    todosLosItems,
    movOrgA,
    movOrgB,
    todosLosMov,
    productosOrgA,
    productosOrgB,
    todosLosProductos,
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 1: Guard sin organización activa (Req 1.4)
// ═══════════════════════════════════════════════════════════════════════════
describe("Guard sin organización activa — error de autorización (Req 1.4)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  describe("sin sesión → 401 NO_AUTENTICADO", () => {
    beforeEach(() => {
      vi.doMock("@/lib/auth/contexto-request", () => ({
        resolverContexto: vi.fn().mockResolvedValue({
          error: errorAuth("NO_AUTENTICADO", 401),
        }),
      }))
      // Prisma mockeado vacío — no debe ser llamado
      vi.doMock("@/lib/db", () => ({
        prisma: {
          venta: { findMany: vi.fn() },
          ventaItem: { findMany: vi.fn() },
          movimientoStock: { findMany: vi.fn() },
          producto: { findMany: vi.fn() },
        },
      }))
    })

    it("GET /api/dashboard/metricas sin sesión → 401 y sin métricas", async () => {
      const { GET } = await import("@/app/api/dashboard/metricas/route")
      const res = await GET(metricasReq())

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.codigo).toBe("NO_AUTENTICADO")
      // El cuerpo no contiene ninguna métrica
      expect(body.totalSales).toBeUndefined()
      expect(body.totalExpenses).toBeUndefined()

      // La capa de datos no fue consultada
      const { prisma } = await import("@/lib/db")
      expect(prisma.venta.findMany).not.toHaveBeenCalled()
    })

    it("GET /api/dashboard/rankings sin sesión → 401 y sin rankings (Req 1.4)", async () => {
      const { GET } = await import("@/app/api/dashboard/rankings/route")
      const res = await GET(rankingsReq())

      expect(res.status).toBe(401)
      const body = await res.json()
      expect(body.error.codigo).toBe("NO_AUTENTICADO")
      // El cuerpo no contiene ningún ranking
      expect(body.topSelling).toBeUndefined()
      expect(body.topMargin).toBeUndefined()

      // La capa de datos no fue consultada
      const { prisma } = await import("@/lib/db")
      expect(prisma.ventaItem.findMany).not.toHaveBeenCalled()
    })
  })

  describe("sesión sin organización activa → 409 SIN_ORGANIZACION_ACTIVA", () => {
    beforeEach(() => {
      vi.doMock("@/lib/auth/contexto-request", () => ({
        resolverContexto: vi.fn().mockResolvedValue({
          error: errorAuth("SIN_ORGANIZACION_ACTIVA", 409),
        }),
      }))
      vi.doMock("@/lib/db", () => ({
        prisma: {
          venta: { findMany: vi.fn() },
          ventaItem: { findMany: vi.fn() },
          movimientoStock: { findMany: vi.fn() },
          producto: { findMany: vi.fn() },
        },
      }))
    })

    it("GET /api/dashboard/metricas sin org activa → 409 y sin métricas (Req 1.4)", async () => {
      const { GET } = await import("@/app/api/dashboard/metricas/route")
      const res = await GET(metricasReq())

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
      // No hay métricas en la respuesta
      expect(body.totalSales).toBeUndefined()
      expect(body.rango).toBeUndefined()

      // La capa de datos no fue consultada — no se exponen datos de ningún tenant
      const { prisma } = await import("@/lib/db")
      expect(prisma.venta.findMany).not.toHaveBeenCalled()
      expect(prisma.ventaItem.findMany).not.toHaveBeenCalled()
      expect(prisma.movimientoStock.findMany).not.toHaveBeenCalled()
    })

    it("GET /api/dashboard/rankings sin org activa → 409 y sin rankings (Req 1.4)", async () => {
      const { GET } = await import("@/app/api/dashboard/rankings/route")
      const res = await GET(rankingsReq())

      expect(res.status).toBe(409)
      const body = await res.json()
      expect(body.error.codigo).toBe("SIN_ORGANIZACION_ACTIVA")
      // No hay rankings en la respuesta
      expect(body.topSelling).toBeUndefined()
      expect(body.topMargin).toBeUndefined()
      expect(body.rango).toBeUndefined()

      // La capa de datos no fue consultada — no se exponen datos de ningún tenant
      const { prisma } = await import("@/lib/db")
      expect(prisma.ventaItem.findMany).not.toHaveBeenCalled()
      expect(prisma.movimientoStock.findMany).not.toHaveBeenCalled()
      expect(prisma.producto.findMany).not.toHaveBeenCalled()
    })
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 2: Aislamiento de métricas entre dos organizaciones (Req 1.1, 1.3, 1.5)
// ═══════════════════════════════════════════════════════════════════════════
describe("Aislamiento de métricas: org A no ve registros de org B (Req 1.1, 1.3, 1.5)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  // Mock de prisma que filtra estrictamente por organizacion_id
  function setupPrismaAislado() {
    const data = buildPrismaData()

    vi.doMock("@/lib/db", () => ({
      prisma: {
        venta: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            const estado = where?.estado
            const result = data.todasLasVentas.filter(
              (v) =>
                (!orgId || v.organizacion_id === orgId) &&
                (!estado || v.estado === estado),
            )
            return Promise.resolve(result)
          }),
        },
        ventaItem: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            const result = data.todosLosItems.filter(
              (it) =>
                (!orgId || it.organizacion_id === orgId) &&
                it.venta.estado === "completada",
            )
            return Promise.resolve(result)
          }),
        },
        movimientoStock: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            const tipo = where?.tipo
            const result = data.todosLosMov.filter(
              (m) =>
                (!orgId || m.organizacion_id === orgId) &&
                (!tipo || m.tipo === tipo),
            )
            return Promise.resolve(result)
          }),
        },
        // Req 9.4–9.6: calcularMetricas llama a totalesDeuda que agrega movimientoDeuda.
        movimientoDeuda: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([]),
        },
        producto: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            const result = data.todosLosProductos.filter(
              (p) => !orgId || p.organizacion_id === orgId,
            )
            return Promise.resolve(result)
          }),
        },
      },
    }))

    return data
  }

  it("métricas de org A no contienen montos de ventas de org B", async () => {
    const data = setupPrismaAislado()

    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxConOrg(ORG_A)),
    }))

    const { GET } = await import("@/app/api/dashboard/metricas/route")
    const res = await GET(metricasReq())

    expect(res.status).toBe(200)
    const body = await res.json()

    // totalSales.actual para Org A = 100 + 200 = 300
    // NO debe ser 300 + 9999 = 10299 (que sería si filtrara mal)
    const ventasOrgA = data.ventasOrgA.reduce((s, v) => s + v.total, 0) // 300
    const ventasOrgB = data.ventasOrgB.reduce((s, v) => s + v.total, 0) // 9999

    expect(body.totalSales.actual).toBe(ventasOrgA)
    expect(body.totalSales.actual).not.toBe(ventasOrgA + ventasOrgB)
    // La cifra de Org B no debe aparecer en ningún componente
    expect(body.totalSales.actual).toBeLessThan(ventasOrgB)
  })

  it("métricas de org B no contienen montos de ventas de org A", async () => {
    const data = setupPrismaAislado()

    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxConOrg(ORG_B)),
    }))

    const { GET } = await import("@/app/api/dashboard/metricas/route")
    const res = await GET(metricasReq())

    expect(res.status).toBe(200)
    const body = await res.json()

    const ventasOrgB = data.ventasOrgB.reduce((s, v) => s + v.total, 0) // 9999
    const ventasOrgA = data.ventasOrgA.reduce((s, v) => s + v.total, 0) // 300

    expect(body.totalSales.actual).toBe(ventasOrgB)
    expect(body.totalSales.actual).not.toBe(ventasOrgA + ventasOrgB)
    expect(body.totalSales.actual).toBeGreaterThan(ventasOrgA)
  })

  it("añadir ventas de org B no altera las métricas de org A (Req 1.5)", async () => {
    // Primer escenario: solo datos de Org A en la BD
    const data = buildPrismaData()

    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxConOrg(ORG_A)),
    }))

    // Prisma que solo conoce registros de Org A
    vi.doMock("@/lib/db", () => ({
      prisma: {
        venta: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              data.ventasOrgA.filter((v) =>
                (!where?.organizacion_id || v.organizacion_id === where.organizacion_id) &&
                (!where?.estado || v.estado === where.estado),
              ),
            )
          }),
        },
        ventaItem: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              data.itemsOrgA.filter((it) =>
                !where?.organizacion_id || it.organizacion_id === where.organizacion_id,
              ),
            )
          }),
        },
        movimientoStock: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              data.movOrgA.filter((m) =>
                (!where?.organizacion_id || m.organizacion_id === where.organizacion_id) &&
                (!where?.tipo || m.tipo === where.tipo),
              ),
            )
          }),
        },
        // Req 9.4–9.6: calcularMetricas llama a totalesDeuda que agrega movimientoDeuda.
        movimientoDeuda: {
          findMany: vi.fn().mockResolvedValue([]),
          groupBy: vi.fn().mockResolvedValue([]),
        },
        producto: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            return Promise.resolve(
              data.productosOrgA.filter((p) =>
                !where?.organizacion_id || p.organizacion_id === where.organizacion_id,
              ),
            )
          }),
        },
      },
    }))

    const { GET } = await import("@/app/api/dashboard/metricas/route")
    const resSinOrgB = await GET(metricasReq())
    const bodySinOrgB = await resSinOrgB.json()
    const salesSinOrgB = bodySinOrgB.totalSales.actual

    // Las métricas de Org A deben ser las mismas independientemente de si Org B
    // tiene o no registros — el filtro por organizacion_id es estricto.
    expect(salesSinOrgB).toBe(300)
  })
})

// ═══════════════════════════════════════════════════════════════════════════
// GRUPO 3: Aislamiento de rankings entre dos organizaciones (Req 1.2, 1.5)
// ═══════════════════════════════════════════════════════════════════════════
describe("Aislamiento de rankings: org A no ve productos de org B (Req 1.2, 1.5)", () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
  })

  function setupRankingsData() {
    const data = buildPrismaData()

    vi.doMock("@/lib/db", () => ({
      prisma: {
        ventaItem: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            const result = data.todosLosItems.filter(
              (it) =>
                (!orgId || it.organizacion_id === orgId) &&
                it.venta.estado === "completada",
            )
            return Promise.resolve(result)
          }),
        },
        producto: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            const result = data.todosLosProductos.filter(
              (p) => !orgId || p.organizacion_id === orgId,
            )
            return Promise.resolve(result)
          }),
        },
        movimientoStock: {
          findMany: vi.fn().mockImplementation(({ where }: any) => {
            const orgId = where?.organizacion_id
            // Salidas para rankings: cantidad < 0 (mock vacío; no hay salidas en data)
            const result = data.todosLosMov.filter(
              (m) =>
                (!orgId || m.organizacion_id === orgId) &&
                m.cantidad < 0,
            )
            return Promise.resolve(result)
          }),
        },
      },
    }))

    return data
  }

  it("rankings de org A solo contienen productos de org A", async () => {
    const data = setupRankingsData()

    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxConOrg(ORG_A)),
    }))

    const { calcularRankings } = await import("@/lib/dominio/rankings")
    const resultado = await calcularRankings(DESDE, HASTA, 100, ORG_A)

    const idsOrgA = new Set(data.productosOrgA.map((p) => p.id))
    const idsOrgB = new Set(data.productosOrgB.map((p) => p.id))

    // lowRotation incluye todos los productos activos del tenant
    const idsEnLowRotation = new Set(resultado.lowRotation.map((r) => r.producto_id))
    for (const id of idsOrgB) {
      expect(idsEnLowRotation.has(id)).toBe(false)
    }
    for (const id of idsOrgA) {
      expect(idsEnLowRotation.has(id)).toBe(true)
    }

    // topMargin tampoco debe tener productos de org B
    const idsEnTopMargin = new Set(resultado.topMargin.map((r) => r.producto_id))
    for (const id of idsOrgB) {
      expect(idsEnTopMargin.has(id)).toBe(false)
    }
  })

  it("rankings de org B solo contienen productos de org B", async () => {
    const data = setupRankingsData()

    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxConOrg(ORG_B)),
    }))

    const { calcularRankings } = await import("@/lib/dominio/rankings")
    const resultado = await calcularRankings(DESDE, HASTA, 100, ORG_B)

    const idsOrgA = new Set(data.productosOrgA.map((p) => p.id))
    const idsOrgB = new Set(data.productosOrgB.map((p) => p.id))

    const idsEnLowRotation = new Set(resultado.lowRotation.map((r) => r.producto_id))
    for (const id of idsOrgA) {
      expect(idsEnLowRotation.has(id)).toBe(false)
    }
    for (const id of idsOrgB) {
      expect(idsEnLowRotation.has(id)).toBe(true)
    }
  })

  it("topSelling de org A solo muestra ítems vendidos en org A, no de org B", async () => {
    const data = setupRankingsData()

    vi.doMock("@/lib/auth/contexto-request", () => ({
      resolverContexto: vi.fn().mockResolvedValue(ctxConOrg(ORG_A)),
    }))

    const { calcularRankings } = await import("@/lib/dominio/rankings")
    const resultado = await calcularRankings(DESDE, HASTA, 100, ORG_A)

    const idsOrgB = new Set(data.productosOrgB.map((p) => p.id))

    // ningún producto de org B debe aparecer en topSelling de org A
    for (const item of resultado.topSelling) {
      expect(idsOrgB.has(item.producto_id)).toBe(false)
    }

    // Los productos de org A vendidos sí deben aparecer
    const idsVendidosOrgA = new Set(data.itemsOrgA.map((it) => it.producto_id))
    for (const item of resultado.topSelling) {
      expect(idsVendidosOrgA.has(item.producto_id)).toBe(true)
    }
  })

  it("org A sin ventas propias en el rango → topSelling vacío (Req 1.6)", async () => {
    // Org A sin ítems de venta en el rango
    vi.doMock("@/lib/db", () => ({
      prisma: {
        ventaItem: {
          findMany: vi.fn().mockResolvedValue([]),
        },
        producto: {
          findMany: vi.fn().mockResolvedValue([
            { id: "prod-a1", organizacion_id: ORG_A, nombre: "Prod A1", precio_compra: 30, precio_venta: 50, activo: true },
          ]),
        },
        movimientoStock: {
          findMany: vi.fn().mockResolvedValue([]),
        },
      },
    }))

    const { calcularRankings } = await import("@/lib/dominio/rankings")
    const resultado = await calcularRankings(DESDE, HASTA, 100, ORG_A)

    expect(resultado.topSelling).toHaveLength(0)
    expect(resultado.topRotation).toHaveLength(0)
    // lowRotation sí debe incluir los productos activos del tenant (cero salidas)
    expect(resultado.lowRotation.length).toBeGreaterThan(0)
    expect(resultado.lowRotation[0].unidadesSalida).toBe(0)
  })
})
