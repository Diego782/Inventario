import { describe, it, expect } from "vitest"
import {
  metricasQuerySchema,
  rankingsQuerySchema,
} from "@/lib/schemas/dashboard"

describe("metricasQuerySchema", () => {
  it("rechaza fechas con formato inválido", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2025-13-01",
      hasta: "2025-01-01",
    })
    expect(r.success).toBe(false)
  })

  it("acepta un rango válido", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(true)
  })

  it("rechaza desde posterior a hasta", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2025-04-21",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(false)
    if (!r.success) {
      expect(r.error.issues[0].message).toBe(
        "La fecha de inicio debe ser anterior o igual a la fecha de fin",
      )
    }
  })

  it("rechaza rangos que exceden 366 días", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2025-12-31",
    })
    expect(r.success).toBe(false)
  })

  it("acepta exactamente 366 días", () => {
    const r = metricasQuerySchema.safeParse({
      desde: "2024-01-01",
      hasta: "2024-12-31", // año bisiesto: 366 días inclusivos
    })
    expect(r.success).toBe(true)
  })

  it("rechaza parámetros ausentes", () => {
    const r = metricasQuerySchema.safeParse({})
    expect(r.success).toBe(false)
  })
})

describe("rankingsQuerySchema", () => {
  it("aplica limite=5 por defecto cuando se omite", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
    })
    expect(r.success).toBe(true)
    if (r.success) {
      expect(r.data.limite).toBe(5)
    }
  })

  it("coerciona limite desde string y lo acepta en rango 1..50", () => {
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

  it("rechaza limite fuera del rango 1..50", () => {
    expect(
      rankingsQuerySchema.safeParse({
        desde: "2025-04-02",
        hasta: "2025-04-20",
        limite: "51",
      }).success,
    ).toBe(false)
    expect(
      rankingsQuerySchema.safeParse({
        desde: "2025-04-02",
        hasta: "2025-04-20",
        limite: "0",
      }).success,
    ).toBe(false)
  })

  it("rechaza limite no entero", () => {
    const r = rankingsQuerySchema.safeParse({
      desde: "2025-04-02",
      hasta: "2025-04-20",
      limite: "5.5",
    })
    expect(r.success).toBe(false)
  })
})
