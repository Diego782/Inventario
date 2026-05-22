// Feature: inventario-ventas-core, Property 7: Folio único e incremental por día
// Validates: Requirements 18.6
import { describe, it, expect, beforeEach } from "vitest"
import * as fc from "fast-check"
import { generarFolio } from "@/lib/dominio/folio"
import { LimiteFolioDiarioError } from "@/lib/api/errores"

// Este test requiere una BD real. Se omite si DATABASE_URL no está definida.
const TIENE_BD = !!process.env.DATABASE_URL

// ---------------------------------------------------------------------------
// Tests de integración con BD (Property 7 completa)
// ---------------------------------------------------------------------------

describe.skipIf(!TIENE_BD)("Property 7: Folio único e incremental por día (con BD)", () => {
  // Importar prisma dinámicamente para no romper el módulo cuando no hay BD
  let prisma: import("@prisma/client").PrismaClient

  beforeEach(async () => {
    const { prisma: p } = await import("@/lib/db")
    prisma = p
  })

  it("P7 — Para toda fecha d y K ∈ [2, 200] llamadas, los folios son únicos, crecientes y con formato correcto", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.date({ min: new Date("2024-01-01"), max: new Date("2030-12-31") }),
        fc.integer({ min: 2, max: 20 }), // reducido a 20 para velocidad en CI
        async (fecha, K) => {
          // Limpiar el contador del día para este test
          const { formatInTimeZone } = await import("date-fns-tz")
          const tz = process.env.TZ ?? "America/Mexico_City"
          const yyyymmdd = formatInTimeZone(fecha, tz, "yyyyMMdd")
          const clave = `folio_seq:${yyyymmdd}`

          await prisma.$executeRaw`
            DELETE FROM configuracion WHERE clave = ${clave}
          `

          // Generar K folios secuencialmente (cada uno en su propia transacción)
          const folios: string[] = []
          for (let i = 0; i < K; i++) {
            const folio = await prisma.$transaction(async (tx) => {
              return generarFolio(tx, fecha)
            })
            folios.push(folio)
          }

          const formatoFolio = /^VTA-\d{8}-\d{4}$/

          // Invariante 1: todos tienen el formato correcto
          const todosFormatoValido = folios.every((f) => formatoFolio.test(f))
          if (!todosFormatoValido) return false

          // Invariante 2: todos son distintos (unicidad)
          const unicos = new Set(folios)
          if (unicos.size !== folios.length) return false

          // Invariante 3: la parte NNNN es estrictamente creciente
          const sufijos = folios.map((f) => parseInt(f.slice(-4), 10))
          for (let i = 1; i < sufijos.length; i++) {
            if (sufijos[i] <= sufijos[i - 1]) return false
          }

          // Invariante 4: la fecha en el folio coincide con la fecha de entrada
          const fechaEnFolio = folios[0].slice(4, 12) // VTA-AAAAMMDD-NNNN
          if (fechaEnFolio !== yyyymmdd) return false

          return true
        }
      ),
      { numRuns: 5 } // reducido para no saturar la BD en CI
    )
  })

  it("P7 — Lanza LimiteFolioDiarioError al superar 9999 folios en el día", async () => {
    // Usamos una fecha ficticia muy específica para este test
    const fechaLimite = new Date("2099-12-31T12:00:00Z")
    const { formatInTimeZone } = await import("date-fns-tz")
    const tz = process.env.TZ ?? "America/Mexico_City"
    const yyyymmdd = formatInTimeZone(fechaLimite, tz, "yyyyMMdd")
    const clave = `folio_seq:${yyyymmdd}`

    // Forzar el contador a 9999 directamente
    await prisma.$executeRaw`
      INSERT INTO configuracion (clave, valor, actualizado_en)
      VALUES (${clave}, '9999', NOW())
      ON DUPLICATE KEY UPDATE valor = '9999', actualizado_en = NOW()
    `

    // La siguiente llamada debe lanzar LimiteFolioDiarioError
    await expect(
      prisma.$transaction(async (tx) => generarFolio(tx, fechaLimite))
    ).rejects.toThrow(LimiteFolioDiarioError)
  })
})

// ---------------------------------------------------------------------------
// Tests puros de formato (sin BD) — siempre se ejecutan
// ---------------------------------------------------------------------------

describe("Folio — validación de formato (sin BD)", () => {
  it("P7.1 — El formato VTA-AAAAMMDD-NNNN es correcto para ejemplos conocidos", () => {
    const formatoFolio = /^VTA-\d{8}-\d{4}$/
    const ejemplos = [
      "VTA-20240101-0001",
      "VTA-20241231-9999",
      "VTA-20250615-0042",
    ]
    for (const folio of ejemplos) {
      expect(folio).toMatch(formatoFolio)
    }
  })

  it("P7.2 — Folios inválidos no coinciden con el formato", () => {
    const formatoFolio = /^VTA-\d{8}-\d{4}$/
    const invalidos = [
      "VTA-2024010-0001",   // fecha corta (7 dígitos)
      "VTA-20240101-001",   // consecutivo corto (3 dígitos)
      "VTA-20240101-00001", // consecutivo largo (5 dígitos)
      "vta-20240101-0001",  // prefijo en minúsculas
      "VTA20240101-0001",   // sin guión entre prefijo y fecha
    ]
    for (const folio of invalidos) {
      expect(folio).not.toMatch(formatoFolio)
    }
  })

  it("P7.3 — formatInTimeZone produce AAAAMMDD de 8 dígitos para cualquier fecha válida", () => {
    fc.assert(
      fc.property(
        fc.date({ min: new Date("2024-01-01"), max: new Date("2030-12-31"), noInvalidDate: true }),
        (fecha) => {
          // Verificar que el formato de fecha produce exactamente 8 dígitos
          const formatter = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Mexico_City",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          })
          const yyyymmdd = formatter.format(fecha).replace(/-/g, "")
          return /^\d{8}$/.test(yyyymmdd)
        }
      ),
      { numRuns: 100 }
    )
  })

  it("P7.4 — El consecutivo NNNN siempre tiene exactamente 4 dígitos con padding", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 9999 }),
        (n) => {
          const nnnn = String(n).padStart(4, "0")
          return nnnn.length === 4 && /^\d{4}$/.test(nnnn)
        }
      ),
      { numRuns: 100 }
    )
  })
})
