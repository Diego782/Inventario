import { describe, it, expect } from "vitest"
import {
  metricasQuerySchema,
  rankingsQuerySchema,
} from "@/lib/schemas/dashboard"
import {
  listarNotifQuerySchema,
  notifIdParamSchema,
} from "@/lib/schemas/notificaciones"

/**
 * Tests unitarios de los esquemas Zod de dashboard y notificaciones.
 * Cubre casos válidos e inválidos por schema (R2.2, R2.3, R3.2, R3.3,
 * R8.2, R8.10).
 */

describe("metricasQuerySchema (R2.2, R2.3)", () => {
  it("acepta un rango válido", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(true)
  })

  it("rechaza ausencia de desde", () => {
    const r = metricasQuerySchema.safeParse({ hasta: "2025-04-20" })
    expect(r.success).toBe(false)
  })

  it("rechaza ausencia de hasta", () => {
    const r = metricasQuerySchema.safeParse({ desde: "2025-04-02" })
    expect(r.success).toBe(false)
  })

  it("rechaza ambos parámetros ausentes", () => {
    const r = metricasQuerySchema.safeParse({})
    expect(r.success).toBe(false)
  })

  it("rechaza formato de fecha inválido en desde", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "02-04-2025",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza formato de fecha inválido en hasta", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "20/04/2025",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza cadena vacía", () => {
    const r = metricasQuerySchema.safeParse({ desde: "", hasta: "" })
    expect(r.success).toBe(false)
  })

  it("rechaza desde posterior a hasta con mensaje en español", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2025-04-21",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "La fecha de inicio debe ser anterior o igual a la fecha de fin",
      )
      expect(r.error.issues[0].path).toEqual(["desde"])
    }
  })

  it("rechaza rangos que exceden 366 días con mensaje en español", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2025-12-31",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      const issue = r.error.issues.find((i) => i.path[0] === "hasta")
      expect(issue?.message).toBe("El rango no puede exceder 366 días")
    }
  })

  it("acepta exactamente 366 días (año bisiesto)", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2024-12-31",
    })
    expect(r.success).toBe(true)
  })
})

describe("rankingsQuerySchema (R3.2, R3.3)", () => {
  it("acepta un rango válido y aplica limite=5 por defecto", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.limite).toBe(5)
    }
  })

  it("coerciona limite desde string dentro de [1,50]", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
      limite: "10",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.limite).toBe(10)
    }
  })

  it("acepta los extremos del rango (1 y 50)", () => {
    expect(
      rankingsQuerySchema.safeParse({
        desde: "2025-04-02",
        hasta: "2025-04-20",
        limite: "1",
      }).success,
    ).toBe(true)
    expect(
      rankingsQuerySchema.safeParse({
        desde: "2025-04-02",
        hasta: "2025-04-20",
        limite: "50",
      }).success,
    ).toBe(true)
  })

  it("rechaza limite por debajo de 1", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
      limite: "0",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza limite por encima de 50", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
      limite: "51",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza limite no entero", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
      limite: "5.5",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza ausencia de desde/hasta", () => {
    expect(rankingsQuerySchema.safeParse({ limite: "5" }).success).toBe(false)
    expect(
      rankingsQuerySchema.safeParse({ desde: "2025-04-02", limite: "5" })
        .success,
    ).toBe(false)
  })

  it("rechaza formato de fecha inválido", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-13-01",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza desde posterior a hasta", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-21",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(false)
  })

  it("rechaza rangos que exceden 366 días", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2025-12-31",
    })
    expect(r.success).toBe(false)
  })
})

describe("listarNotifQuerySchema (R8.2)", () => {
  it("aplica solo_no_leidas='false' por defecto cuando se omite", () => {
    const r = listarNotifQuerySchema.safeParse({})
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.solo_no_leidas).toBe("false")
    }
  })

  it("acepta solo_no_leidas='true'", () => {
    const r = listarNotifQuerySchema.safeParse({ solo_no_leidas: "true" })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.solo_no_leidas).toBe("true")
    }
  })

  it("acepta solo_no_leidas='false'", () => {
    const r = listarNotifQuerySchema.safeParse({ solo_no_leidas: "false" })
    expect(r.success).toBe(true)
  })

  it("rechaza valores inválidos de solo_no_leidas", () => {
    expect(
      listarNotifQuerySchema.safeParse({ solo_no_leidas: "1" }).success,
    ).toBe(false)
    expect(
      listarNotifQuerySchema.safeParse({ solo_no_leidas: "yes" }).success,
    ).toBe(false)
    expect(
      listarNotifQuerySchema.safeParse({ solo_no_leidas: "" }).success,
    ).toBe(false)
  })
})

describe("notifIdParamSchema (R8.10)", () => {
  it("acepta un UUID válido", () => {
    const r = notifIdParamSchema.safeParse({
      id: "f47ac10b-58cc-4372-a567-0e02b2c3d479",
    })
    expect(r.success).toBe(true)
  })

  it("rechaza un id que no es UUID con mensaje en español", () => {
    const r = notifIdParamSchema.safeParse({ id: "no-es-uuid" })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe("ID de notificación inválido")
    }
  })

  it("rechaza un id numérico", () => {
    const r = notifIdParamSchema.safeParse({ id: "12345" })
    expect(r.success).toBe(false)
  })

  it("rechaza un id ausente", () => {
    const r = notifIdParamSchema.safeParse({})
    expect(r.success).toBe(false)
  })
})
