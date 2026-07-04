import { z } from "zod"

export const crearVentaItemSchema = z.object({
  producto_id: z.string().uuid("ID de producto inválido"),
  variante_id: z.string().uuid("ID de variante inválido").optional().nullable(),
  cantidad: z.number().int().positive("La cantidad debe ser un entero positivo"),
  precio_unitario: z.number().nonnegative("El precio unitario no puede ser negativo"),
  descuento_producto: z
    .number()
    .nonnegative("El descuento por producto no puede ser negativo")
    .optional(),
})

export const crearVentaSchema = z
  .object({
    items: z
      .array(crearVentaItemSchema)
      .min(1, "La venta debe tener al menos un ítem"),
    metodo_pago: z.enum(["efectivo", "tarjeta", "transferencia", "fiado"], {
      errorMap: () => ({ message: "Método de pago inválido" }),
    }),
    monto_recibido: z.number().nonnegative().optional(),
    fiador_id: z.string().uuid("ID de fiador inválido").optional(),
    /** Cliente asociado a la venta. Obligatorio cuando metodo_pago === "fiado". */
    cliente_id: z.string().uuid("ID de cliente inválido").optional(),
    /** Fecha límite de la deuda. Obligatoria y >= hoy cuando metodo_pago === "fiado". */
    plazo_deuda: z.coerce.date().optional(),
    /** Descuento aplicado sobre el total de la venta (>= 0). */
    descuento_total: z
      .number()
      .nonnegative("El descuento total no puede ser negativo")
      .optional(),
  })
  .superRefine((v, ctx) => {
    // Nota: fiador_id es legacy y ya no es requerido para ventas fiadas.
    // El nuevo flujo usa cliente_id (Req 6.3). Se conserva el campo para
    // retrocompatibilidad con registros históricos, pero no se valida su presencia.
    if (v.metodo_pago === "efectivo" && v.monto_recibido === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["monto_recibido"],
        message: "El monto recibido es obligatorio para pago en efectivo",
      })
    }
    // Req 6.3: cliente_id es obligatorio para ventas fiadas
    if (v.metodo_pago === "fiado" && !v.cliente_id) {
      ctx.addIssue({
        code: "custom",
        path: ["cliente_id"],
        message: "Se requiere seleccionar un cliente para venta fiada",
      })
    }
    // Req 6.4: plazo_deuda es obligatorio y debe ser >= hoy para ventas fiadas
    if (v.metodo_pago === "fiado") {
      if (!v.plazo_deuda) {
        ctx.addIssue({
          code: "custom",
          path: ["plazo_deuda"],
          message: "Se requiere un plazo de deuda para venta fiada",
        })
      } else {
        const hoy = new Date()
        hoy.setHours(0, 0, 0, 0)
        const plazo = new Date(v.plazo_deuda)
        plazo.setHours(0, 0, 0, 0)
        if (plazo < hoy) {
          ctx.addIssue({
            code: "custom",
            path: ["plazo_deuda"],
            message: "El plazo de deuda debe ser igual o posterior a la fecha de hoy",
          })
        }
      }
    }
  })

export type CrearVentaInput = z.infer<typeof crearVentaSchema>
export type CrearVentaItemInput = z.infer<typeof crearVentaItemSchema>

export const editarVentaSchema = z
  .object({
    metodo_pago: z
      .enum(["efectivo", "tarjeta", "transferencia", "fiado"], {
        errorMap: () => ({ message: "Método de pago inválido" }),
      })
      .optional(),
    estado: z
      .enum(["completada", "pendiente", "cancelada"], {
        errorMap: () => ({ message: "Estado inválido" }),
      })
      .optional(),
  })
  .refine((v) => v.metodo_pago !== undefined || v.estado !== undefined, {
    message: "Debes indicar al menos un campo a editar",
  })

export type EditarVentaInput = z.infer<typeof editarVentaSchema>
