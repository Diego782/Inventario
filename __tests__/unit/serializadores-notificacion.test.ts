/**
 * Tests para toNotificacionDTO en lib/api/serializadores.ts
 * Valida que creado_en se convierte a ISO 8601 UTC y que producto_id
 * mapea correctamente el caso nullable (R2.5, R3.5, R8.1).
 */
import { describe, it, expect } from "vitest"
import { toNotificacionDTO } from "@/lib/api/serializadores"
import type { Notificacion as PNotificacion } from "@prisma/client"

// ---- Fixtures ----

const creado = new Date("2024-01-15T10:30:00.000Z")

const notificacionConProducto: PNotificacion = {
  id: "notif-001",
  tipo: "stock_critico",
  titulo: "Stock crítico",
  mensaje: "El producto X alcanzó stock crítico",
  producto_id: "prod-001",
  leida: false,
  clave_deduplicacion: "stock_critico:prod-001",
  creado_en: creado,
}

const notificacionSinProducto: PNotificacion = {
  id: "notif-002",
  tipo: "stock_critico",
  titulo: "Aviso",
  mensaje: "Producto eliminado",
  producto_id: null,
  leida: true,
  clave_deduplicacion: null,
  creado_en: creado,
}

// ---- Tests ----

describe("toNotificacionDTO", () => {
  it("convierte creado_en a string ISO 8601 UTC", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect(dto.creado_en).toBe("2024-01-15T10:30:00.000Z")
    expect(typeof dto.creado_en).toBe("string")
  })

  it("mapea producto_id cuando tiene valor", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect(dto.producto_id).toBe("prod-001")
  })

  it("mapea producto_id nullable como null", () => {
    const dto = toNotificacionDTO(notificacionSinProducto)
    expect(dto.producto_id).toBeNull()
  })

  it("conserva el resto de campos del DTO", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect(dto).toEqual({
      id: "notif-001",
      tipo: "stock_critico",
      titulo: "Stock crítico",
      mensaje: "El producto X alcanzó stock crítico",
      producto_id: "prod-001",
      leida: false,
      creado_en: "2024-01-15T10:30:00.000Z",
    })
  })

  it("no expone clave_deduplicacion en el DTO", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect("clave_deduplicacion" in dto).toBe(false)
  })
})
