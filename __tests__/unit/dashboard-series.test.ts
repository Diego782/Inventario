// Feature: dashboard-metricas-notificaciones — Test unitario de agruparPorDia
// Validates: Requirements 5.1, 5.2
import { describe, it, expect } from "vitest"
import { agruparPorDia } from "@/lib/dashboard/series"

// America/Mexico_City es UTC-6 todo el año (sin horario de verano desde 2022),
// por lo que los offsets "-06:00" fijan cada timestamp a su día civil esperado.
const TZ = "America/Mexico_City"

describe("agruparPorDia", () => {
  it("(a) rango de 5 días con datos en sólo 2 días → 5 entradas, ceros en los 3 restantes, orden ascendente", () => {
    const rango = { desde: "2025-04-01", hasta: "2025-04-05" }
    // Puntos únicamente en el día civil 2025-04-02 (dos puntos que suman) y 2025-04-04.
    const puntos = [
      { creado_en: "2025-04-02T09:00:00-06:00", valor: 10 },
      { creado_en: "2025-04-02T18:30:00-06:00", valor: 5 },
      { creado_en: "2025-04-04T12:00:00-06:00", valor: 7 },
    ]

    const resultado = agruparPorDia(puntos, rango, TZ)

    expect(resultado).toEqual([
      { fecha: "2025-04-01", valor: 0 },
      { fecha: "2025-04-02", valor: 15 },
      { fecha: "2025-04-03", valor: 0 },
      { fecha: "2025-04-04", valor: 7 },
      { fecha: "2025-04-05", valor: 0 },
    ])

    // Una entrada por cada día del rango inclusivo.
    expect(resultado).toHaveLength(5)
    // Orden ascendente estricto por fecha.
    const fechas = resultado.map((p) => p.fecha)
    expect(fechas).toEqual([...fechas].sort())
    // Exactamente 3 días en cero.
    expect(resultado.filter((p) => p.valor === 0)).toHaveLength(3)
  })

  it("(b) puntos en los extremos exactos del rango se incluyen", () => {
    const rango = { desde: "2025-04-01", hasta: "2025-04-05" }
    // Extremo inicial: medianoche civil del primer día. Extremo final: último instante del último día.
    const puntos = [
      { creado_en: "2025-04-01T00:00:00-06:00", valor: 3 },
      { creado_en: "2025-04-05T23:59:59-06:00", valor: 8 },
    ]

    const resultado = agruparPorDia(puntos, rango, TZ)

    expect(resultado).toEqual([
      { fecha: "2025-04-01", valor: 3 },
      { fecha: "2025-04-02", valor: 0 },
      { fecha: "2025-04-03", valor: 0 },
      { fecha: "2025-04-04", valor: 0 },
      { fecha: "2025-04-05", valor: 8 },
    ])
  })
})
