/**
 * Tests para toNotificacionDTO en lib/api/serializadores.ts
 * Valida que creado_en se convierte a ISO 8601 UTC, que producto_id
 * mapea correctamente el caso nullable (R2.5, R3.5, R8.1), y que
 * acciones_rapidas y venta_id se exponen correctamente (Req 8.2–8.7).
 */
import { describe, it, expect } from "vitest"
import { toNotificacionDTO, accionesPorTipo } from "@/lib/api/serializadores"
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

const notificacionStockCero: PNotificacion = {
  id: "notif-003",
  tipo: "stock_cero",
  titulo: "Sin stock",
  mensaje: "El producto Y se quedó sin stock",
  producto_id: "prod-002",
  leida: false,
  clave_deduplicacion: "stock_cero:prod-002",
  creado_en: creado,
}

const notificacionVencimientoDeuda: PNotificacion & { venta_id?: string | null } = {
  id: "notif-004",
  tipo: "vencimiento_deuda",
  titulo: "Deuda vencida",
  mensaje: "La deuda de la venta V001 ha vencido",
  producto_id: null,
  leida: false,
  clave_deduplicacion: "vencimiento_deuda:venta-001",
  creado_en: creado,
  venta_id: "venta-001",
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

  it("no expone clave_deduplicacion en el DTO", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect("clave_deduplicacion" in dto).toBe(false)
  })

  it("venta_id es null cuando no se proporciona", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect(dto.venta_id).toBeNull()
  })

  it("mapea venta_id cuando se proporciona", () => {
    const dto = toNotificacionDTO(notificacionVencimientoDeuda)
    expect(dto.venta_id).toBe("venta-001")
  })

  describe("acciones_rapidas por tipo", () => {
    it("stock_critico expone exactamente ['Ajustar stock']", () => {
      const dto = toNotificacionDTO(notificacionConProducto)
      expect(dto.acciones_rapidas).toEqual(["Ajustar stock"])
    })

    it("stock_cero expone exactamente ['Ajustar stock', 'Eliminar producto']", () => {
      const dto = toNotificacionDTO(notificacionStockCero)
      expect(dto.acciones_rapidas).toEqual(["Ajustar stock", "Eliminar producto"])
    })

    it("vencimiento_deuda expone exactamente ['Extender deuda']", () => {
      const dto = toNotificacionDTO(notificacionVencimientoDeuda)
      expect(dto.acciones_rapidas).toEqual(["Extender deuda"])
    })

    it("tipo desconocido expone array vacío", () => {
      const notifDesconocida: PNotificacion = {
        ...notificacionConProducto,
        tipo: "tipo_inexistente",
      }
      const dto = toNotificacionDTO(notifDesconocida)
      expect(dto.acciones_rapidas).toEqual([])
    })

    it("stock_critico NO incluye 'Eliminar producto' (Req 8.6)", () => {
      const dto = toNotificacionDTO(notificacionConProducto)
      expect(dto.acciones_rapidas).not.toContain("Eliminar producto")
    })
  })

  it("conserva el resto de campos del DTO", () => {
    const dto = toNotificacionDTO(notificacionConProducto)
    expect(dto).toEqual({
      id: "notif-001",
      tipo: "stock_critico",
      titulo: "Stock crítico",
      mensaje: "El producto X alcanzó stock crítico",
      producto_id: "prod-001",
      venta_id: null,
      leida: false,
      creado_en: "2024-01-15T10:30:00.000Z",
      acciones_rapidas: ["Ajustar stock"],
    })
  })
})

describe("accionesPorTipo", () => {
  it("stock_cero devuelve ['Ajustar stock', 'Eliminar producto']", () => {
    expect(accionesPorTipo("stock_cero")).toEqual(["Ajustar stock", "Eliminar producto"])
  })

  it("stock_critico devuelve ['Ajustar stock']", () => {
    expect(accionesPorTipo("stock_critico")).toEqual(["Ajustar stock"])
  })

  it("vencimiento_deuda devuelve ['Extender deuda']", () => {
    expect(accionesPorTipo("vencimiento_deuda")).toEqual(["Extender deuda"])
  })

  it("tipo desconocido devuelve []", () => {
    expect(accionesPorTipo("otro_tipo")).toEqual([])
  })

  it("es determinista: misma entrada siempre produce misma salida", () => {
    expect(accionesPorTipo("stock_cero")).toEqual(accionesPorTipo("stock_cero"))
    expect(accionesPorTipo("stock_critico")).toEqual(accionesPorTipo("stock_critico"))
    expect(accionesPorTipo("vencimiento_deuda")).toEqual(accionesPorTipo("vencimiento_deuda"))
  })
})
