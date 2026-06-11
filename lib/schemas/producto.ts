import { z } from "zod"

export const varianteStockSchema = z.object({
  talla: z.string().min(1).max(20),
  stock: z.number().int().nonnegative("El stock no puede ser negativo").default(0),
})

export const crearProductoSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(160),
  sku: z
    .string()
    .min(1, "El SKU es requerido")
    .max(32)
    .regex(/^[A-Za-z0-9\-_]+$/, "El SKU solo puede contener letras, números, guiones y guiones bajos"),
  codigo_barras: z.string().max(48).optional().nullable(),
  categoria_id: z.string().uuid("ID de categoría inválido").optional().nullable(),
  precio_compra: z.number().nonnegative("El precio de compra no puede ser negativo").default(0),
  precio_venta: z.number().nonnegative("El precio de venta no puede ser negativo"),
  // stock_actual se ignora cuando variantes_stock tiene entradas; se usa solo para productos sin tallas
  stock_actual: z.number().int().nonnegative("El stock no puede ser negativo").default(0),
  stock_minimo: z.number().int().nonnegative("El stock mínimo no puede ser negativo").default(0),
  unidad: z.string().min(1).max(16).default("unidad"),
  talla: z.string().max(20).optional().nullable(),
  // Stock por talla al crear un producto con variantes
  variantes_stock: z.array(varianteStockSchema).optional().nullable(),
})

export const editarProductoSchema = crearProductoSchema
  .omit({ stock_actual: true, variantes_stock: true })
  .partial()

export const ajusteStockSchema = z.object({
  tipo: z.enum(["entrada", "salida", "merma", "devolucion", "ajuste"], {
    errorMap: () => ({ message: "Tipo de ajuste inválido" }),
  }),
  cantidad: z.number().int().positive("La cantidad debe ser un entero positivo"),
  motivo: z.string().max(240).optional(),
})

export type CrearProductoInput = z.infer<typeof crearProductoSchema>
export type EditarProductoInput = z.infer<typeof editarProductoSchema>
export type AjusteStockInput = z.infer<typeof ajusteStockSchema>
