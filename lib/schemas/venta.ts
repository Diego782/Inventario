import { z } from "zod"

export const crearVentaItemSchema = z.object({
  producto_id: z.string().uuid("ID de producto inválido"),
  variante_id: z.string().uuid("ID de variante inválido").optional().nullable(),
  cantidad: z.number().int().positive("La cantidad debe ser un entero positivo"),
  precio_unitario: z.number().nonnegative("El precio unitario no puede ser negativo"),
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
  })
  .superRefine((v, ctx) => {
    if (v.metodo_pago === "fiado" && !v.fiador_id) {
      ctx.addIssue({
        code: "custom",
        path: ["fiador_id"],
        message: "Se requiere seleccionar un fiador para venta fiada",
      })
    }
    if (v.metodo_pago === "efectivo" && v.monto_recibido === undefined) {
      ctx.addIssue({
        code: "custom",
        path: ["monto_recibido"],
        message: "El monto recibido es obligatorio para pago en efectivo",
      })
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
