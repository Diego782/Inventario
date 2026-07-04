// __tests__/integration/esquema-clientes-deuda.test.ts
// Verifica via information_schema que el esquema introducido por la migración
// `clientes_y_deuda` sea correcto (columnas nullable, índices, unicidad) y que
// reaplicar `prisma migrate deploy` sobre la BD ya migrada no duplica tablas
// ni altera datos (idempotencia).
// Validates: Requirements 11.2, 11.4, 11.5, 11.6, 11.8
import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { execSync } from "child_process"

const SKIP_DB = process.env.SKIP_DB_TESTS === "1"
const TIENE_BD = !!process.env.DATABASE_URL

// Extrae el nombre de la base de datos desde DATABASE_URL.
// Formato esperado: mysql://user:pass@host:port/dbname[?params]
function obtenerNombreBD(): string {
  const url = process.env.DATABASE_URL ?? ""
  const match = url.match(/\/([^/?]+)(\?|$)/)
  return match ? match[1] : ""
}

describe.skipIf(SKIP_DB || !TIENE_BD)(
  "Esquema clientes y deuda — verificación e idempotencia",
  () => {
    let prisma: import("@prisma/client").PrismaClient
    let nombreBD: string

    beforeAll(async () => {
      const { prisma: p } = await import("@/lib/db")
      prisma = p
      nombreBD = obtenerNombreBD()
    })

    afterAll(async () => {
      if (prisma) await prisma.$disconnect()
    })

    // -----------------------------------------------------------------------
    // Bloque 1: ventas.cliente_id y ventas.plazo_deuda son nullable (Req 11.2, 11.5)
    // -----------------------------------------------------------------------

    it("ventas.cliente_id es nullable (IS_NULLABLE = YES)", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ COLUMN_NAME: string; IS_NULLABLE: string }>
      >`
        SELECT COLUMN_NAME, IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'ventas'
          AND COLUMN_NAME  = 'cliente_id'
      `
      expect(rows).toHaveLength(1)
      expect(rows[0].IS_NULLABLE).toBe("YES")
    })

    it("ventas.plazo_deuda es nullable (IS_NULLABLE = YES)", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ COLUMN_NAME: string; IS_NULLABLE: string }>
      >`
        SELECT COLUMN_NAME, IS_NULLABLE
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'ventas'
          AND COLUMN_NAME  = 'plazo_deuda'
      `
      expect(rows).toHaveLength(1)
      expect(rows[0].IS_NULLABLE).toBe("YES")
    })

    // -----------------------------------------------------------------------
    // Bloque 2: clientes.organizacion_id está indexado (Req 11.6)
    // -----------------------------------------------------------------------

    it("clientes tiene un índice sobre organizacion_id", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ INDEX_NAME: string; COLUMN_NAME: string }>
      >`
        SELECT INDEX_NAME, COLUMN_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'clientes'
          AND COLUMN_NAME  = 'organizacion_id'
      `
      expect(rows.length).toBeGreaterThanOrEqual(1)
    })

    // -----------------------------------------------------------------------
    // Bloque 3: clientes tiene el índice único (organizacion_id, cedula) (Req 4.3, 4.4)
    // -----------------------------------------------------------------------

    it("clientes tiene el índice único compuesto (organizacion_id, cedula)", async () => {
      // Busca un índice único donde aparezcan ambas columnas juntas con la
      // misma INDEX_NAME y NON_UNIQUE = 0.
      const rows = await prisma.$queryRaw<
        Array<{ INDEX_NAME: string; COLUMN_NAME: string; NON_UNIQUE: number }>
      >`
        SELECT INDEX_NAME, COLUMN_NAME, NON_UNIQUE
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'clientes'
          AND NON_UNIQUE   = 0
          AND COLUMN_NAME  IN ('organizacion_id', 'cedula')
        ORDER BY INDEX_NAME, SEQ_IN_INDEX
      `

      // Debe haber exactamente un índice único que contenga ambas columnas.
      const uniqueIndexNames = [...new Set(rows.map((r) => r.INDEX_NAME))]
      const ambosColumnas = uniqueIndexNames.filter((name) => {
        const columnas = rows
          .filter((r) => r.INDEX_NAME === name)
          .map((r) => r.COLUMN_NAME)
        return (
          columnas.includes("organizacion_id") && columnas.includes("cedula")
        )
      })
      expect(ambosColumnas.length).toBeGreaterThanOrEqual(1)
    })

    // -----------------------------------------------------------------------
    // Bloque 4: movimientos_deuda.organizacion_id está indexado (Req 11.6)
    // -----------------------------------------------------------------------

    it("movimientos_deuda tiene un índice sobre organizacion_id", async () => {
      const rows = await prisma.$queryRaw<
        Array<{ INDEX_NAME: string; COLUMN_NAME: string }>
      >`
        SELECT INDEX_NAME, COLUMN_NAME
        FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'movimientos_deuda'
          AND COLUMN_NAME  = 'organizacion_id'
      `
      expect(rows.length).toBeGreaterThanOrEqual(1)
    })

    // -----------------------------------------------------------------------
    // Bloque 5: solo cambios aditivos — no se eliminaron columnas previas (Req 11.4)
    // -----------------------------------------------------------------------

    it("ventas conserva sus columnas preexistentes (sin drops)", async () => {
      const columnasPrevias = [
        "id",
        "organizacion_id",
        "folio",
        "subtotal",
        "impuesto",
        "total",
        "metodo_pago",
        "estado",
        "creado_en",
      ]
      const rows = await prisma.$queryRaw<Array<{ COLUMN_NAME: string }>>`
        SELECT COLUMN_NAME
        FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'ventas'
      `
      const columnasBD = rows.map((r) => r.COLUMN_NAME)
      for (const col of columnasPrevias) {
        expect(columnasBD, `columna ${col} debe existir en ventas`).toContain(
          col
        )
      }
    })

    // -----------------------------------------------------------------------
    // Bloque 6: idempotencia — reaplicar migrate deploy no duplica tablas (Req 11.8)
    // -----------------------------------------------------------------------

    it("reaplicar prisma migrate deploy no duplica la tabla clientes", async () => {
      // Reaplicar la migración: no debe lanzar error
      expect(() => {
        execSync("pnpm exec prisma migrate deploy", {
          cwd: process.cwd(),
          stdio: "pipe",
        })
      }).not.toThrow()

      // Confirma que la tabla sigue existiendo y no hay duplicados
      const rows = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'clientes'
      `
      expect(rows).toHaveLength(1)
    })

    it("reaplicar prisma migrate deploy no duplica la tabla movimientos_deuda", async () => {
      const rows = await prisma.$queryRaw<Array<{ TABLE_NAME: string }>>`
        SELECT TABLE_NAME
        FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = ${nombreBD}
          AND TABLE_NAME   = 'movimientos_deuda'
      `
      expect(rows).toHaveLength(1)
    })

    it("reaplicar prisma migrate deploy no altera los datos existentes en ventas", async () => {
      // Captura el conteo antes y después de reaplicar
      const conteoAntes = await prisma.venta.count()

      execSync("pnpm exec prisma migrate deploy", {
        cwd: process.cwd(),
        stdio: "pipe",
      })

      const conteoDespues = await prisma.venta.count()
      expect(conteoDespues).toBe(conteoAntes)
    })

    it("reaplicar prisma migrate deploy no altera los datos en clientes", async () => {
      const conteoAntes = await prisma.cliente.count()

      execSync("pnpm exec prisma migrate deploy", {
        cwd: process.cwd(),
        stdio: "pipe",
      })

      const conteoDespues = await prisma.cliente.count()
      expect(conteoDespues).toBe(conteoAntes)
    })

    // -----------------------------------------------------------------------
    // Bloque 7: prisma migrate status reporta BD al día (Req 11.8 implícito)
    // -----------------------------------------------------------------------

    it("prisma migrate status reporta que la BD está al día", () => {
      const output = execSync("pnpm exec prisma migrate status", {
        cwd: process.cwd(),
        encoding: "utf-8",
        stdio: "pipe",
      })
      // Prisma imprime "Database schema is up to date" cuando no hay
      // migraciones pendientes de aplicar.
      expect(output).toMatch(/Database schema is up to date/i)
    })
  }
)
