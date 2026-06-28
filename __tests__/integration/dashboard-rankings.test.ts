// __tests__/integration/dashboard-rankings.test.ts
//
// Prueba de integración de las agregaciones de rankings (`calcularRankings`) contra
// MySQL real. Siembra un catálogo de productos con precios conocidos, ventas
// completadas con sus ítems y movimientos de salida (cantidad negativa) en un rango
// conocido, y verifica NUMÉRICAMENTE las 4 listas que devuelve `calcularRankings`:
//
//   - topSelling : desc por unidades vendidas, desempate por producto_id asc, monto
//                  vendido redondeado (R3.6, R3.9, R3.11).
//   - topMargin  : desc por margen `precio_venta − precio_compra`, desempate id asc,
//                  margen redondeado (R3.6, R3.9, R3.11).
//   - topRotation: desc por unidades con salida, desempate id asc (R3.6, R3.9).
//   - lowRotation: productos activos asc por salida, INCLUYENDO un producto con CERO
//                  salidas, desempate id asc (R3.9, R3.12).
//
// `calcularRankings` agrega sobre TODOS los productos (no por organización) para
// topMargin/lowRotation, por lo que el dataset preexistente podría aparecer en esas
// listas. Para que las aserciones sean deterministas se usa un `limite` amplio (de modo
// que nada se trunca) y se FILTRAN las listas resultantes a los IDs sembrados aquí;
// como `ordenarRanking` aplica un orden global estable, el orden relativo del subconjunto
// sembrado se preserva y puede compararse contra el modelo esperado.
//
// Validates: Requirements R3.6, R3.9, R3.11, R3.12
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { redondearBancario } from "@/lib/money"
import { calcularRankings } from "@/lib/dominio/rankings"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

const TZ = "America/Mexico_City"
const ORG_DEFAULT = "00000000-0000-4000-8000-000000000001"

// Rango civil que cubre cómodamente los datos sembrados (todos en 2025-06).
const DESDE = "2025-01-01"
const HASTA = "2025-12-31"
// Instante dentro del rango (mediodía UTC del 15 de junio de 2025).
const EN_RANGO = new Date("2025-06-15T12:00:00.000Z")
// Instante FUERA del rango (año 2099) para confirmar que el filtro por fecha excluye
// las salidas fuera de rango (refuerza R3.12: el producto sigue con cero salidas).
const FUERA_RANGO = new Date("2099-06-15T12:00:00.000Z")
// Límite amplio: con <100 productos en la BD nada se trunca.
const LIMITE = 100

// ── Modelo de los productos sembrados (precios conocidos, todos activos) ──
type SeedProd = {
  idx: number
  id: string // poblado tras crear en BD
  nombre: string
  precio_compra: number
  precio_venta: number
  unidadesVendidas: number // esperado en topSelling
  montoVendido: number // esperado (redondeado)
  unidadesSalida: number // esperado en topRotation/lowRotation
}

// A y B empatan en unidades vendidas (5) ⇒ desempate por id.
// B y C empatan en margen (10) y en salida (3) ⇒ desempate por id.
// D tiene CERO ventas y CERO salidas (producto activo sin rotación) ⇒ R3.12.
const PRODUCTOS: SeedProd[] = [
  { idx: 0, id: "", nombre: "Ranking A", precio_compra: 10.0, precio_venta: 30.0, unidadesVendidas: 5, montoVendido: 150.0, unidadesSalida: 5 },
  { idx: 1, id: "", nombre: "Ranking B", precio_compra: 5.0, precio_venta: 15.0, unidadesVendidas: 5, montoVendido: 75.0, unidadesSalida: 3 },
  { idx: 2, id: "", nombre: "Ranking C", precio_compra: 2.5, precio_venta: 12.5, unidadesVendidas: 2, montoVendido: 25.0, unidadesSalida: 3 },
  { idx: 3, id: "", nombre: "Ranking D", precio_compra: 1.0, precio_venta: 8.0, unidadesVendidas: 0, montoVendido: 0, unidadesSalida: 0 },
]

function margen(p: SeedProd): number {
  return redondearBancario(p.precio_venta - p.precio_compra)
}

// Comparador de desempate por producto_id ascendente (R3.9).
function porId(a: string, b: string): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Integración: agregaciones de rankings con datos seed",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    const ventaIds: string[] = []
    const sufijo = `RNK-${Date.now()}`

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p

      // 1) Catálogo de productos activos con precios conocidos.
      for (const sp of PRODUCTOS) {
        const creado = await prisma.producto.create({
          data: {
            organizacion_id: ORG_DEFAULT,
            codigo_barras: `${sufijo}-${sp.idx}`,
            nombre: sp.nombre,
            precio_compra: sp.precio_compra,
            precio_venta: sp.precio_venta,
            stock_actual: 1000,
            stock_minimo: 0,
            activo: true,
          },
        })
        sp.id = creado.id
      }

      const [A, B, C] = PRODUCTOS

      // 2) Ventas COMPLETADAS con ítems (en rango). Las unidades de cada producto se
      //    reparten entre dos ventas para ejercitar la SUMA por producto.
      const venta1 = await prisma.venta.create({
        data: {
          organizacion_id: ORG_DEFAULT,
          folio: "VTA-RNK-1",
          subtotal: 165.0,
          impuesto: 0,
          total: 165.0,
          metodo_pago: "efectivo",
          estado: "completada",
          creado_en: EN_RANGO,
          items: {
            create: [
              { organizacion_id: ORG_DEFAULT, producto_id: A.id, cantidad: 3, precio_unitario: 30.0, subtotal_linea: 90.0 },
              { organizacion_id: ORG_DEFAULT, producto_id: B.id, cantidad: 5, precio_unitario: 15.0, subtotal_linea: 75.0 },
            ],
          },
        },
      })
      ventaIds.push(venta1.id)

      const venta2 = await prisma.venta.create({
        data: {
          organizacion_id: ORG_DEFAULT,
          folio: "VTA-RNK-2",
          subtotal: 85.0,
          impuesto: 0,
          total: 85.0,
          metodo_pago: "efectivo",
          estado: "completada",
          creado_en: EN_RANGO,
          items: {
            create: [
              { organizacion_id: ORG_DEFAULT, producto_id: A.id, cantidad: 2, precio_unitario: 30.0, subtotal_linea: 60.0 },
              { organizacion_id: ORG_DEFAULT, producto_id: C.id, cantidad: 2, precio_unitario: 12.5, subtotal_linea: 25.0 },
            ],
          },
        },
      })
      ventaIds.push(venta2.id)

      // Venta PENDIENTE (no completada): no debe contar para topSelling (R3.6).
      const venta3 = await prisma.venta.create({
        data: {
          organizacion_id: ORG_DEFAULT,
          folio: "VTA-RNK-3",
          subtotal: 300.0,
          impuesto: 0,
          total: 300.0,
          metodo_pago: "efectivo",
          estado: "pendiente",
          creado_en: EN_RANGO,
          items: {
            create: [
              { organizacion_id: ORG_DEFAULT, producto_id: A.id, cantidad: 10, precio_unitario: 30.0, subtotal_linea: 300.0 },
            ],
          },
        },
      })
      ventaIds.push(venta3.id)

      // 3) Movimientos de SALIDA (cantidad negativa) en rango.
      //    A: -4 y -1 = 5 ; B: -3 ; C: -3 ; D: ninguno (cero salidas).
      await prisma.movimientoStock.createMany({
        data: [
          { organizacion_id: ORG_DEFAULT, producto_id: A.id, tipo: "salida", cantidad: -4, stock_resultante: 996, creado_en: EN_RANGO },
          { organizacion_id: ORG_DEFAULT, producto_id: A.id, tipo: "venta", cantidad: -1, stock_resultante: 995, creado_en: EN_RANGO },
          { organizacion_id: ORG_DEFAULT, producto_id: B.id, tipo: "salida", cantidad: -3, stock_resultante: 997, creado_en: EN_RANGO },
          { organizacion_id: ORG_DEFAULT, producto_id: C.id, tipo: "salida", cantidad: -3, stock_resultante: 997, creado_en: EN_RANGO },
          // Salida de D FUERA del rango: no cuenta ⇒ D permanece con cero salidas.
          { organizacion_id: ORG_DEFAULT, producto_id: PRODUCTOS[3].id, tipo: "salida", cantidad: -7, stock_resultante: 993, creado_en: FUERA_RANGO },
        ],
      })
    })

    afterAll(async () => {
      if (!prisma) return
      const ids = PRODUCTOS.map((p) => p.id).filter(Boolean)
      // Orden de borrado respetando llaves foráneas.
      await prisma.ventaItem.deleteMany({ where: { producto_id: { in: ids } } })
      if (ventaIds.length > 0) {
        await prisma.venta.deleteMany({ where: { id: { in: ventaIds } } })
      }
      await prisma.movimientoStock.deleteMany({ where: { producto_id: { in: ids } } })
      await prisma.producto.deleteMany({ where: { id: { in: ids } } })
    })

    it("verifica numéricamente topSelling, topMargin, topRotation y lowRotation", async () => {
      const idSet = new Set(PRODUCTOS.map((p) => p.id))
      const dto = await calcularRankings(DESDE, HASTA, LIMITE, TZ)

      // ── topSelling: unidades desc, desempate id asc, monto redondeado (R3.6, R3.9, R3.11) ──
      const ventasEsperadas = PRODUCTOS.filter((p) => p.unidadesVendidas > 0).sort(
        (a, b) => b.unidadesVendidas - a.unidadesVendidas || porId(a.id, b.id),
      )
      const topSellingMio = dto.topSelling.filter((r) => idSet.has(r.producto_id))
      expect(topSellingMio.map((r) => r.producto_id)).toEqual(ventasEsperadas.map((p) => p.id))
      for (let i = 0; i < ventasEsperadas.length; i++) {
        const esp = ventasEsperadas[i]
        const got = topSellingMio[i]
        expect(got.unidadesVendidas).toBe(esp.unidadesVendidas)
        expect(got.montoVendido).toBe(esp.montoVendido)
        // R3.11: el monto es un valor monetario redondeado.
        expect(got.montoVendido).toBe(redondearBancario(got.montoVendido))
      }
      // La venta PENDIENTE no infló las unidades del producto A.
      const aEnTop = topSellingMio.find((r) => r.producto_id === PRODUCTOS[0].id)!
      expect(aEnTop.unidadesVendidas).toBe(5)

      // ── topMargin: margen desc, desempate id asc, margen redondeado (R3.6, R3.9, R3.11) ──
      const margenEsperado = [...PRODUCTOS].sort(
        (a, b) => margen(b) - margen(a) || porId(a.id, b.id),
      )
      const topMarginMio = dto.topMargin.filter((r) => idSet.has(r.producto_id))
      expect(topMarginMio.map((r) => r.producto_id)).toEqual(margenEsperado.map((p) => p.id))
      for (let i = 0; i < margenEsperado.length; i++) {
        expect(topMarginMio[i].margen).toBe(margen(margenEsperado[i]))
        expect(topMarginMio[i].margen).toBe(redondearBancario(topMarginMio[i].margen))
      }
      // Verifica explícitamente el desempate por id en el empate de margen (B y C, margen 10).
      const bc = [PRODUCTOS[1], PRODUCTOS[2]].sort((a, b) => porId(a.id, b.id))
      const posB = topMarginMio.findIndex((r) => r.producto_id === bc[0].id)
      const posC = topMarginMio.findIndex((r) => r.producto_id === bc[1].id)
      expect(posB).toBeLessThan(posC)

      // ── topRotation: salida desc, desempate id asc (R3.6, R3.9) ──
      const rotEsperada = PRODUCTOS.filter((p) => p.unidadesSalida > 0).sort(
        (a, b) => b.unidadesSalida - a.unidadesSalida || porId(a.id, b.id),
      )
      const topRotationMio = dto.topRotation.filter((r) => idSet.has(r.producto_id))
      expect(topRotationMio.map((r) => r.producto_id)).toEqual(rotEsperada.map((p) => p.id))
      for (let i = 0; i < rotEsperada.length; i++) {
        expect(topRotationMio[i].unidadesSalida).toBe(rotEsperada[i].unidadesSalida)
      }
      // El producto D (cero salidas) NO aparece en topRotation.
      expect(topRotationMio.some((r) => r.producto_id === PRODUCTOS[3].id)).toBe(false)

      // ── lowRotation: activos asc por salida incluyendo ceros, desempate id asc (R3.9, R3.12) ──
      const lowEsperada = [...PRODUCTOS].sort(
        (a, b) => a.unidadesSalida - b.unidadesSalida || porId(a.id, b.id),
      )
      const lowRotationMio = dto.lowRotation.filter((r) => idSet.has(r.producto_id))
      expect(lowRotationMio.map((r) => r.producto_id)).toEqual(lowEsperada.map((p) => p.id))
      for (let i = 0; i < lowEsperada.length; i++) {
        expect(lowRotationMio[i].unidadesSalida).toBe(lowEsperada[i].unidadesSalida)
      }
      // R3.12: el producto activo con CERO salidas aparece en lowRotation, con valor 0,
      // y es el primero del subconjunto sembrado (menor rotación).
      const dEnLow = lowRotationMio.find((r) => r.producto_id === PRODUCTOS[3].id)
      expect(dEnLow).toBeDefined()
      expect(dEnLow!.unidadesSalida).toBe(0)
      expect(lowRotationMio[0].producto_id).toBe(PRODUCTOS[3].id)
    })
  },
)
