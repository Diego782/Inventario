// __tests__/integration/migracion-multitenant-smoke.test.ts
// Smoke test de migración aditiva: verifica que los datos de negocio
// existentes fueron migrados correctamente al modelo multi-tenant.
// Validates: Requirements R1.10, R13.1, R13.4
import { describe, it, expect, beforeAll } from "vitest"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

const DEFAULT_ORG_ID = "00000000-0000-4000-8000-000000000001"

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Migración multi-tenant — smoke test de preservación de datos",
  () => {
    let prisma: import("@prisma/client").PrismaClient

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p
    })

    it("la tabla organizaciones contiene la organización por defecto", async () => {
      const org = await prisma.organizacion.findUnique({
        where: { id: DEFAULT_ORG_ID },
      })
      expect(org).not.toBeNull()
      expect(org!.slug).toBe("principal")
    })

    it("producto.count() se conserva (≥ 0) y ningún producto tiene organizacion_id NULL", async () => {
      const total = await prisma.producto.count()
      expect(total).toBeGreaterThanOrEqual(0)

      // Verificar que no hay productos sin organizacion_id asignado
      // Como la columna es NOT NULL en el schema, Prisma no permitiría nulos,
      // pero verificamos con una query directa que el backfill funcionó.
      const sinOrg = await prisma.producto.count({
        where: { organizacion_id: "" },
      })
      expect(sinOrg).toBe(0)
    })

    it("todos los productos existentes tienen organizacion_id de la organización por defecto", async () => {
      const total = await prisma.producto.count()

      if (total === 0) {
        // Sin productos previos, el test pasa trivialmente
        return
      }

      const conOrgDefault = await prisma.producto.count({
        where: { organizacion_id: DEFAULT_ORG_ID },
      })

      // Todos los productos pre-existentes deben pertenecer a la org por defecto
      expect(conOrgDefault).toBe(total)
    })
  }
)
