import { z } from "zod"

export const varianteStockSchema = z.object({
  talla: z.string().min(1).max(20),
  stock: z.number().int().nonnegative("El stock no puede ser negativo").default(0),
  stock_minimo: z.number().int().nonnegative("El stock mínimo no puede ser negativo").optional(),
  precio_compra: z.number().finite().nonnegative("El precio de compra no puede ser negativo").nullable().optional(),
  precio_venta: z.number().finite().nonnegative("El precio no puede ser negativo").nullable().optional(),
})

export const fechaVencimientoSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Usa una fecha válida (AAAA-MM-DD)")
  .refine((valor) => {
    const fecha = new Date(`${valor}T00:00:00.000Z`)
    return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === valor
  }, "La fecha de vencimiento no existe")

const loteBaseSchema = z.object({
  fecha_vencimiento: fechaVencimientoSchema,
  cantidad: z.number().int().positive("La cantidad del lote debe ser positiva"),
})

export const loteInicialSchema = loteBaseSchema.extend({ talla: z.string().min(1).max(20).nullable().optional() })
export const loteAsignacionSchema = loteBaseSchema.extend({ variante_id: z.string().uuid().nullable().optional() })

/** Límite máximo para los filtros de rango de stock (Req 10.2, 10.7). */
const STOCK_MAX_PERMITIDO = 999_999_999

/**
 * Schema para los query params del listado de productos.
 * Reemplaza el antiguo filtro "Stock inicial" (stock_actual_min/max) por un
 * filtro "Stock" con stock_min/stock_max (enteros 0–999.999.999, opcionales e
 * independientes) y añade solo_critico boolean (Req 10.2–10.7).
 */
export const listadoProductosSchema = z
  .object({
    q: z.string().optional(),
    nombre: z.string().optional(),
    unidad: z.string().optional(),
    talla: z.string().optional(),
    categoria_id: z.string().uuid().optional(),
    estado: z.enum(["En Stock", "Bajo Stock", "Crítico"]).optional(),
    precio_venta_min: z.coerce.number().nonnegative().optional(),
    precio_venta_max: z.coerce.number().nonnegative().optional(),
    precio_compra_min: z.coerce.number().nonnegative().optional(),
    precio_compra_max: z.coerce.number().nonnegative().optional(),
    stock_minimo_min: z.coerce.number().int().min(0).optional(),
    stock_minimo_max: z.coerce.number().int().min(0).optional(),
    // Filtro de rango de stock actual (reemplaza stock_actual_min/max, Req 10.2–10.7)
    stock_min: z.coerce
      .number()
      .int("El stock mínimo debe ser un entero.")
      .min(0, "El stock mínimo no puede ser negativo.")
      .max(STOCK_MAX_PERMITIDO, `El stock mínimo no puede superar ${STOCK_MAX_PERMITIDO}.`)
      .optional(),
    stock_max: z.coerce
      .number()
      .int("El stock máximo debe ser un entero.")
      .min(0, "El stock máximo no puede ser negativo.")
      .max(STOCK_MAX_PERMITIDO, `El stock máximo no puede superar ${STOCK_MAX_PERMITIDO}.`)
      .optional(),
    // Filtro de stock crítico (Req 10.1)
    solo_critico: z.coerce.boolean().optional(),
    take: z.coerce.number().int().min(1).max(100).default(20),
    skip: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((v, ctx) => {
    // Validación min ≤ max para rangos de precio y stock_minimo (Req 10.6)
    const rangos: Array<[string, number | undefined, number | undefined]> = [
      ["precio_venta", v.precio_venta_min, v.precio_venta_max],
      ["precio_compra", v.precio_compra_min, v.precio_compra_max],
      ["stock_minimo", v.stock_minimo_min, v.stock_minimo_max],
    ]
    for (const [campo, min, max] of rangos) {
      if (min !== undefined && max !== undefined && min > max) {
        ctx.addIssue({
          code: "custom",
          path: [`${campo}_min`],
          message: "El valor mínimo no puede ser mayor que el máximo.",
        })
      }
    }
    // Validación min ≤ max para rango de stock (Req 10.6)
    if (v.stock_min !== undefined && v.stock_max !== undefined && v.stock_min > v.stock_max) {
      ctx.addIssue({
        code: "custom",
        path: ["stock_min"],
        message: "El stock mínimo no puede ser mayor que el stock máximo.",
      })
    }
  })

export type ListarProductosInput = z.infer<typeof listadoProductosSchema>

const productoBaseSchema = z.object({
  nombre: z.string().min(1, "El nombre es requerido").max(160),
  codigo_barras: z.string().max(48).optional().nullable(),
  categoria_id: z.string().uuid("ID de categoría inválido").optional().nullable(),
  precio_compra: z.number().nonnegative("El precio de compra no puede ser negativo").default(0),
  precio_venta: z.number().nonnegative("El precio de venta no puede ser negativo"),
  precio_por_variante: z.boolean().optional(),
  controla_vencimiento: z.boolean().optional(),
  // stock_actual se ignora cuando variantes_stock tiene entradas; se usa solo para productos sin tallas
  stock_actual: z.number().int().nonnegative("El stock no puede ser negativo").default(0),
  stock_minimo: z.number().int().nonnegative("El stock mínimo no puede ser negativo").default(0),
  unidad: z.string().min(1).max(16).default("unidad"),
  talla: z.string().max(20).optional().nullable(),
  // Stock por talla al crear un producto con variantes
  variantes_stock: z.array(varianteStockSchema).optional().nullable(),
  lotes_iniciales: z.array(loteInicialSchema).optional(),
})

export const crearProductoSchema = productoBaseSchema.superRefine((valor, ctx) => {
  if (valor.precio_por_variante) {
    if (!valor.variantes_stock?.length) {
      ctx.addIssue({ code: "custom", path: ["variantes_stock"], message: "Selecciona al menos una variante." })
    }
    valor.variantes_stock?.forEach((variante, index) => {
      if (variante.precio_compra === null || variante.precio_compra === undefined) {
        ctx.addIssue({ code: "custom", path: ["variantes_stock", index, "precio_compra"], message: "Indica el precio de compra de esta variante." })
      }
      if (variante.precio_venta === null || variante.precio_venta === undefined) {
        ctx.addIssue({ code: "custom", path: ["variantes_stock", index, "precio_venta"], message: "Indica el precio de venta de esta variante." })
      }
    })
  }
  if (valor.controla_vencimiento) {
    const variantes = valor.variantes_stock ?? []
    if (variantes.length) {
      for (const variante of variantes) {
        const asignado = (valor.lotes_iniciales ?? [])
          .filter((lote) => lote.talla === variante.talla)
          .reduce((suma, lote) => suma + lote.cantidad, 0)
        if (asignado !== variante.stock) {
          ctx.addIssue({ code: "custom", path: ["lotes_iniciales"], message: `Asigna una fecha a las ${variante.stock} unidades de ${variante.talla}.` })
        }
      }
      if ((valor.lotes_iniciales ?? []).some((lote) => !variantes.some((v) => v.talla === lote.talla))) {
        ctx.addIssue({ code: "custom", path: ["lotes_iniciales"], message: "Hay un lote sin variante válida." })
      }
    } else {
      const asignado = (valor.lotes_iniciales ?? []).reduce((suma, lote) => suma + lote.cantidad, 0)
      if (asignado !== valor.stock_actual || (valor.lotes_iniciales ?? []).some((lote) => lote.talla)) {
        ctx.addIssue({ code: "custom", path: ["lotes_iniciales"], message: "Asigna una fecha a todo el stock inicial." })
      }
    }
  }
})

export const editarProductoSchema = productoBaseSchema
  .omit({ stock_actual: true, variantes_stock: true, lotes_iniciales: true })
  .partial()
  .extend({
  precios_variantes: z.array(z.object({
    variante_id: z.string().uuid(),
    precio_compra: z.number().finite().nonnegative("El precio de compra no puede ser negativo").optional(),
    precio_venta: z.number().finite().nonnegative("El precio no puede ser negativo"),
  })).optional(),
  minimos_variantes: z.array(z.object({
    variante_id: z.string().uuid(),
    stock_minimo: z.number().int().nonnegative("El stock mínimo no puede ser negativo"),
  })).optional(),
  lotes_asignacion: z.array(loteAsignacionSchema).optional(),
})

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
