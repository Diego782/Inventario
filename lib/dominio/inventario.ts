/**
 * lib/dominio/inventario.ts
 * Capa de dominio para operaciones de inventario.
 * Todas las operaciones que modifican stock usan transacciones Prisma.
 */
import { prisma } from "@/lib/db"
import { generarEan13, detectarFormato } from "@/lib/codigo-barras"
import {
  CodigoBarrasInvalidoError,
  ProductoNoEncontradoError,
  StockNegativoError,
  TallaInvalidaError,
  PrecioVarianteInvalidoError,
  StockMinimoVarianteInvalidoError,
  UsarAjusteStockError,
} from "@/lib/api/errores"
import type { CrearProductoInput, EditarProductoInput, AjusteStockInput } from "@/lib/schemas/producto"
import type { Producto, MovimientoStock } from "@prisma/client"
import { detectarStockCritico, detectarStockCero, estadoStock } from "@/lib/dominio/notificaciones"
import { redondearBancario } from "@/lib/money"
import { precioCompraEfectivo, precioEfectivo } from "@/lib/precio-variantes"

// ---- Helpers ----

/**
 * Normaliza un valor de talla: trim + toLowerCase.
 * Lanza TallaInvalidaError si la longitud tras trim supera 20 caracteres (Req 3.7).
 */
export function normalizarTalla(valor: string): string {
  const trimmed = valor.trim()
  if (trimmed.length > 20) throw new TallaInvalidaError()
  return trimmed.toLowerCase()
}

/**
 * Determina si un producto está en estado "Crítico" según la definición del glosario
 * (Req 10.1): `stock_actual = 0 OR stock_actual <= stock_minimo × 0.3`.
 * Helper reutilizable que coincide con la lógica de `estadoStock` en notificaciones.ts.
 */
export function esCritico(stock_actual: number, stock_minimo: number): boolean {
  return stock_actual === 0 || stock_actual <= stock_minimo * 0.3
}

/**
 * Genera un código EAN-13 único que no exista en la BD para la organización dada.
 * Intenta hasta 10 veces antes de lanzar error.
 */
async function generarCodigoUnico(organizacion_id: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const codigo = generarEan13("200")
    const existente = await prisma.producto.findFirst({
      where: { codigo_barras: codigo, organizacion_id },
      select: { id: true },
    })
    if (!existente) return codigo
  }
  throw new Error("No se pudo generar un código de barras único después de 10 intentos")
}

/**
 * Valida el código de barras si se proporciona.
 * Lanza CodigoBarrasInvalidoError si el formato no es válido.
 */
function validarCodigoBarras(codigo: string | null | undefined): void {
  if (codigo && detectarFormato(codigo) === null) {
    throw new CodigoBarrasInvalidoError()
  }
}

// ---- Operaciones de dominio ----

/**
 * Crea un nuevo producto en el catálogo para la organización dada.
 * Si no se proporciona código de barras, genera uno EAN-13 único dentro del tenant.
 * Si se pasan `variantes_stock`, crea las variantes con su stock inicial en lugar de
 * usar `stock_actual` directamente.
 */
export async function crearProducto(input: CrearProductoInput, organizacion_id: string): Promise<Producto> {
  validarCodigoBarras(input.codigo_barras)

  const codigoBarras = input.codigo_barras || (await generarCodigoUnico(organizacion_id))

  const tieneVariantes = Array.isArray(input.variantes_stock) && input.variantes_stock.length > 0
  if (input.precio_por_variante && (!tieneVariantes || input.variantes_stock!.some((v) => v.precio_compra == null || v.precio_venta == null))) {
    throw new PrecioVarianteInvalidoError()
  }

  // El stock del producto raíz es la suma de variantes (o el valor directo si no hay variantes)
  const stockTotal = tieneVariantes
    ? input.variantes_stock!.reduce((sum, v) => sum + v.stock, 0)
    : (input.stock_actual ?? 0)
  const minimosVariantes = tieneVariantes
    ? input.variantes_stock!.map((variante, index, todas) => variante.stock_minimo
      ?? Math.floor((input.stock_minimo ?? 0) / todas.length)
        + (index < (input.stock_minimo ?? 0) % todas.length ? 1 : 0))
    : []

  return prisma.producto.create({
    data: {
      codigo_barras: codigoBarras,
      nombre: input.nombre,
      categoria_id: input.categoria_id ?? null,
      precio_compra: input.precio_por_variante
        ? Math.min(...input.variantes_stock!.map((v) => v.precio_compra!))
        : (input.precio_compra ?? 0),
      precio_venta: input.precio_por_variante
        ? Math.min(...input.variantes_stock!.map((v) => v.precio_venta!))
        : input.precio_venta,
      precio_por_variante: input.precio_por_variante ?? false,
      stock_actual: stockTotal,
      stock_minimo: tieneVariantes
        ? minimosVariantes.reduce((sum, minimo) => sum + minimo, 0)
        : (input.stock_minimo ?? 0),
      unidad: input.unidad ?? "unidad",
      talla: tieneVariantes ? null : (input.talla ?? null),
      organizacion_id,
      ...(tieneVariantes && {
        variantes: {
          create: input.variantes_stock!.map((v, index) => ({
            talla: v.talla,
            stock_actual: v.stock,
            stock_minimo: minimosVariantes[index],
            precio_compra: input.precio_por_variante ? v.precio_compra : null,
            precio_venta: input.precio_por_variante ? v.precio_venta : null,
          })),
        },
      }),
    },
    include: { variantes: true },
  })
}

/**
 * Edita los datos de un producto existente, verificando que pertenezca al tenant.
 * No permite modificar stock_actual directamente (usar ajustarStock).
 */
export async function editarProducto(
  id: string,
  input: EditarProductoInput,
  organizacion_id: string
): Promise<Producto> {
  // Rechazar cambios a stock_actual
  if ("stock_actual" in input && input.stock_actual !== undefined) {
    throw new UsarAjusteStockError()
  }

  validarCodigoBarras(input.codigo_barras)

  return prisma.$transaction(async (tx) => {
    const existente = await tx.producto.findFirst({
      where: { id, organizacion_id },
      include: { variantes: true },
    })
    if (!existente) throw new ProductoNoEncontradoError()

    let preciosActualizados: Array<{ variante_id: string; precio_compra: number; precio_venta: number }> | undefined
    if (input.precio_por_variante === true || input.precios_variantes !== undefined) {
      const precios = input.precios_variantes ?? []
      const ids = new Set(precios.map((p) => p.variante_id))
      if (
        !existente.variantes.length ||
        precios.length !== existente.variantes.length ||
        ids.size !== precios.length ||
        existente.variantes.some((v) => !ids.has(v.id)) ||
        precios.some((p) => !Number.isFinite(p.precio_venta) || p.precio_venta < 0 || (p.precio_compra !== undefined && (!Number.isFinite(p.precio_compra) || p.precio_compra < 0)))
      ) throw new PrecioVarianteInvalidoError()
      preciosActualizados = precios.map((precio) => ({
        ...precio,
        precio_compra: precio.precio_compra ?? Number(existente.variantes.find((v) => v.id === precio.variante_id)?.precio_compra ?? existente.precio_compra),
      }))
      for (const precio of preciosActualizados) {
        await tx.varianteProducto.update({
          where: { id: precio.variante_id },
          data: { precio_compra: precio.precio_compra, precio_venta: precio.precio_venta },
        })
      }
    }

    if (input.precio_por_variante === false && existente.precio_por_variante) {
      if (input.precio_compra === undefined || input.precio_venta === undefined) throw new PrecioVarianteInvalidoError()
      await tx.varianteProducto.updateMany({
        where: { producto_id: id },
        data: { precio_compra: null, precio_venta: null },
      })
    }

    let minimoTotal: number | undefined
    if (input.minimos_variantes !== undefined) {
      const minimos = input.minimos_variantes
      const ids = new Set(minimos.map((m) => m.variante_id))
      if (
        minimos.length !== existente.variantes.length ||
        ids.size !== minimos.length ||
        existente.variantes.some((v) => !ids.has(v.id)) ||
        minimos.some((m) => !Number.isInteger(m.stock_minimo) || m.stock_minimo < 0)
      ) throw new StockMinimoVarianteInvalidoError()
      for (const minimo of minimos) {
        await tx.varianteProducto.update({
          where: { id: minimo.variante_id },
          data: { stock_minimo: minimo.stock_minimo },
        })
      }
      minimoTotal = minimos.reduce((sum, minimo) => sum + minimo.stock_minimo, 0)
    } else if (input.stock_minimo !== undefined && existente.variantes.length > 0) {
      // Compatibilidad con clientes antiguos que solo envían un mínimo común.
      for (const [index, variante] of existente.variantes.entries()) {
        await tx.varianteProducto.update({
          where: { id: variante.id },
          data: { stock_minimo: Math.floor(input.stock_minimo / existente.variantes.length)
            + (index < input.stock_minimo % existente.variantes.length ? 1 : 0) },
        })
      }
      minimoTotal = input.stock_minimo
    }

    return tx.producto.update({
      where: { id },
      data: {
      ...(input.codigo_barras != null && input.codigo_barras !== "" && { codigo_barras: input.codigo_barras }),
      ...(input.nombre !== undefined && { nombre: input.nombre }),
      ...(input.categoria_id !== undefined && { categoria_id: input.categoria_id || null }),
      ...(preciosActualizados
        ? { precio_compra: Math.min(...preciosActualizados.map((p) => p.precio_compra)) }
        : input.precio_compra !== undefined && { precio_compra: input.precio_compra }),
      ...(preciosActualizados
        ? { precio_venta: Math.min(...preciosActualizados.map((p) => p.precio_venta)) }
        : input.precio_venta !== undefined && { precio_venta: input.precio_venta }),
      ...(input.precio_por_variante !== undefined && { precio_por_variante: input.precio_por_variante }),
      ...(minimoTotal !== undefined
        ? { stock_minimo: minimoTotal }
        : input.stock_minimo !== undefined && { stock_minimo: input.stock_minimo }),
      ...(input.unidad !== undefined && { unidad: input.unidad }),
      ...(input.talla !== undefined && { talla: input.talla }),
      },
      include: { variantes: true },
    })
  })
}

/**
 * Realiza la baja de un producto, verificando que pertenezca al tenant.
 *
 * - Si el producto NO tiene ítems de venta asociados, se elimina físicamente
 *   (junto con sus variantes y movimientos de stock), liberando por completo
 *   el código de barras para que pueda reutilizarse.
 * - Si el producto SÍ tiene historial de ventas, se conserva para no romper la
 *   integridad referencial, pero se desactiva (soft delete) y se renombra su
 *   código de barras con un sufijo único, liberando el valor original para que
 *   el usuario pueda volver a crear un producto con el mismo código de barras.
 */
export async function bajaLogica(id: string, organizacion_id: string): Promise<{ id: string; activo: false }> {
  const existente = await prisma.producto.findFirst({ where: { id, organizacion_id } })
  if (!existente) throw new ProductoNoEncontradoError()

  const ventasAsociadas = await prisma.ventaItem.count({ where: { producto_id: id } })

  if (ventasAsociadas === 0) {
    // Sin historial de ventas → eliminación física (libera el código de barras)
    await prisma.$transaction(async (tx) => {
      await tx.movimientoStock.deleteMany({ where: { producto_id: id } })
      await tx.varianteProducto.deleteMany({ where: { producto_id: id } })
      await tx.notificacion.deleteMany({ where: { producto_id: id } })
      await tx.producto.delete({ where: { id } })
    })
    return { id, activo: false }
  }

  // Con historial de ventas → soft delete + renombrar el código para liberarlo.
  // El sufijo usa los últimos 8 caracteres del id para garantizar unicidad y
  // mantenerse dentro de los límites de longitud de columna (código: 48).
  const sufijo = `__del_${id.slice(-8)}`
  const codigoArchivado = `${existente.codigo_barras.slice(0, 48 - sufijo.length)}${sufijo}`

  await prisma.producto.update({
    where: { id },
    data: {
      activo: false,
      codigo_barras: codigoArchivado,
    },
  })

  return { id, activo: false }
}

/**
 * Ajusta el stock de un producto con registro de movimiento, verificando que pertenezca al tenant.
 * Usa transacción para garantizar atomicidad.
 *
 * La `cantidad` siempre es una magnitud positiva. El signo se determina por `tipo`:
 * - entrada, devolucion → delta positivo (incrementa stock)
 * - salida, merma, ajuste, venta → delta negativo (decrementa stock)
 */
export async function ajustarStock(
  id: string,
  input: AjusteStockInput & { usuario_id?: string },
  organizacion_id: string
): Promise<{ producto: Producto; movimiento: MovimientoStock }> {
  return prisma.$transaction(async (tx) => {
    const producto = await tx.producto.findFirst({ where: { id, organizacion_id } })
    if (!producto) throw new ProductoNoEncontradoError()

    // Calcular delta según tipo
    const esEntrada = ["entrada", "devolucion"].includes(input.tipo)
    const delta = esEntrada ? input.cantidad : -input.cantidad
    const nuevoStock = producto.stock_actual + delta

    if (nuevoStock < 0) throw new StockNegativoError()

    const [productoActualizado, movimiento] = await Promise.all([
      tx.producto.update({
        where: { id },
        data: { stock_actual: nuevoStock },
      }),
      tx.movimientoStock.create({
        data: {
          producto_id: id,
          tipo: input.tipo as any,
          cantidad: delta,
          stock_resultante: nuevoStock,
          motivo: input.motivo?.slice(0, 240) ?? null,
          usuario_id: input.usuario_id ?? null,
          organizacion_id,
        },
      }),
    ])

    // Detección de stock crítico dentro de la misma transacción (Req 8.5).
    // Solo crea notificación en la transición no-Crítico ⇒ Crítico (stock > 0).
    await detectarStockCritico(
      tx,
      {
        producto_id: id,
        nombre: producto.nombre,
        stock_actual: nuevoStock,
        stock_minimo: producto.stock_minimo,
        organizacion_id,
      },
      estadoStock(producto.stock_actual, producto.stock_minimo),
    )

    // Detección de stock cero dentro de la misma transacción (Req 8.1).
    await detectarStockCero(
      tx,
      {
        producto_id: id,
        nombre: producto.nombre,
        stock_actual: nuevoStock,
        organizacion_id,
      },
    )

    return { producto: productoActualizado, movimiento }
  })
}

/**
 * Obtiene un producto por su código de barras dentro del tenant.
 */
export async function obtenerPorCodigo(codigo: string, organizacion_id: string): Promise<Producto | null> {
  return prisma.producto.findFirst({
    where: { codigo_barras: codigo, organizacion_id },
    include: { variantes: true },
  })
}

/**
 * Lista productos con filtros y paginación, filtrados por tenant.
 *
 * Filtros avanzados (opcionales) — se combinan con AND:
 * - `nombre`: coincidencia parcial (contains).
 * - `unidad` / `talla`: coincidencia exacta.
 * - `categoria_id`: coincidencia exacta.
 * - rangos `*_min` / `*_max` sobre precio de venta, precio de compra y stock mínimo.
 * - `stock_min`/`stock_max`: rango de stock actual (enteros 0–999.999.999, Req 10.2–10.5).
 * - `solo_critico`: filtra solo productos con Estado_Stock "Crítico" (Req 10.1).
 *
 * `q` mantiene la búsqueda rápida OR (nombre / código de barras).
 * Cuando `solo_critico = true` y también hay rango de stock u otros filtros, se aplica
 * conjunción AND (Req 10.9). Sin coincidencias → lista vacía (Req 10.8).
 */
export async function listarProductos(params: {
  q?: string
  nombre?: string
  unidad?: string
  talla?: string
  categoria_id?: string
  estado?: string
  precio_venta_min?: number
  precio_venta_max?: number
  precio_compra_min?: number
  precio_compra_max?: number
  stock_minimo_min?: number
  stock_minimo_max?: number
  /** Rango de stock actual — mínimo inclusivo (reemplaza stock_actual_min, Req 10.4) */
  stock_min?: number
  /** Rango de stock actual — máximo inclusivo (reemplaza stock_actual_max, Req 10.5) */
  stock_max?: number
  /** Solo productos en estado Crítico según el glosario (Req 10.1) */
  solo_critico?: boolean
  take?: number
  skip?: number
  organizacion_id: string
}): Promise<{ items: Producto[]; total: number }> {
  const {
    q,
    nombre,
    unidad,
    talla,
    categoria_id,
    precio_venta_min,
    precio_venta_max,
    precio_compra_min,
    precio_compra_max,
    stock_minimo_min,
    stock_minimo_max,
    stock_min,
    stock_max,
    solo_critico,
    take = 20,
    skip = 0,
    organizacion_id,
  } = params

  const where: any = { activo: true, organizacion_id }

  // Filtros adicionales: se acumulan en AND para preservar el aislamiento por
  // organizacion_id y permitir que el filtro de talla use OR internamente (Req 3.4)
  const andClauses: any[] = []

  if (q) {
    andClauses.push({
      OR: [
        { nombre: { contains: q } },
        { codigo_barras: { contains: q } },
      ],
    })
  }

  if (nombre) andClauses.push({ nombre: { contains: nombre } })
  if (unidad) andClauses.push({ unidad })
  if (categoria_id) andClauses.push({ categoria_id })

  // Filtro de talla: normaliza, valida longitud y busca en raíz y variantes (Req 3.1–3.7).
  // Cada producto aparece una sola vez porque findMany sobre Producto no multiplica filas
  // aunque un producto coincida por raíz Y variante (Prisma usa EXISTS, no JOIN).
  if (talla) {
    const tallaNorm = normalizarTalla(talla) // lanza TallaInvalidaError si > 20 chars
    andClauses.push({
      OR: [
        { talla: { equals: tallaNorm, mode: "insensitive" } },
        { variantes: { some: { talla: { equals: tallaNorm, mode: "insensitive" } } } },
      ],
    })
  }

  if (andClauses.length > 0) {
    where.AND = andClauses
  }

  // Helper: construye un filtro de rango { gte?, lte? } sólo si hay límites
  const rango = (min?: number, max?: number) => {
    const r: { gte?: number; lte?: number } = {}
    if (min !== undefined) r.gte = min
    if (max !== undefined) r.lte = max
    return Object.keys(r).length > 0 ? r : undefined
  }

  const precioVenta = rango(precio_venta_min, precio_venta_max)
  if (precioVenta) {
    where.AND = [
      ...(where.AND ?? []),
      { OR: [
        { precio_por_variante: false, precio_venta: precioVenta },
        { precio_por_variante: true, variantes: { some: { precio_venta: precioVenta } } },
      ] },
    ]
  }

  const precioCompra = rango(precio_compra_min, precio_compra_max)
  if (precioCompra) {
    where.AND = [
      ...(where.AND ?? []),
      { OR: [
        { precio_por_variante: false, precio_compra: precioCompra },
        { precio_por_variante: true, variantes: { some: { precio_compra: precioCompra } } },
      ] },
    ]
  }

  const stockMinimo = rango(stock_minimo_min, stock_minimo_max)
  if (stockMinimo) where.stock_minimo = stockMinimo

  // Filtro de rango de stock actual (Req 10.3–10.5).
  // Cuando solo_critico también se aplica, el rango puede reducir el subconjunto
  // crítico aún más (conjunción AND, Req 10.9).
  const stockActual = rango(stock_min, stock_max)
  if (stockActual) where.stock_actual = stockActual

  // Filtro de stock crítico (Req 10.1, 10.9, 10.10).
  // Prisma no permite comparar dos columnas directamente en `where`, por lo que se
  // recuperan los productos que pasan los demás filtros y se post-filtra en memoria
  // usando el helper `esCritico(stock_actual, stock_minimo)` — misma lógica que
  // `estadoStock` del glosario.
  if (solo_critico) {
    const [allItems, totalBefore] = await Promise.all([
      prisma.producto.findMany({
        where,
        // No aplicamos take/skip aquí porque el post-filtro cambia el total.
        // Para catálogos muy grandes esto tiene un coste; el diseño lo acepta porque
        // la alternativa (raw SQL) introduce complejidad sin valor en este contexto.
        orderBy: { nombre: "asc" },
        include: { variantes: true },
      }),
      prisma.producto.count({ where }),
    ])
    void totalBefore // descartado: se recalcula tras post-filtro
    const criticos = allItems.filter((p) => esCritico(p.stock_actual, p.stock_minimo))
    const total = criticos.length
    const items = criticos.slice(skip, skip + take)
    return { items, total }
  }

  const [items, total] = await Promise.all([
    prisma.producto.findMany({ where, take, skip, orderBy: { nombre: "asc" }, include: { variantes: true } }),
    prisma.producto.count({ where }),
  ])

  return { items, total }
}

/**
 * Calcula el valor del inventario para la organización activa (Req 2.2–2.6, 2.8).
 *
 * - `inversion`           = Σ precio_compra × stock_actual  sobre productos activos del tenant.
 * - `recaudacionPotencial` = Σ precio_venta  × stock_actual  sobre productos activos del tenant.
 *
 * El `stock_actual` del producto raíz ya se mantiene como la suma de variantes
 * (ver `crearProducto`), por lo que se usa directamente y cada producto se cuenta
 * exactamente una vez, sin doble conteo (Req 2.4).
 *
 * Nulos en `precio_compra`, `precio_venta` o `stock_actual` se tratan como 0 (Req 2.2, 2.3).
 * Sin productos activos → devuelve { inversion: 0, recaudacionPotencial: 0 } (Req 2.6).
 * Solo considera productos del tenant recibido (Req 2.5).
 * Aplica redondeo bancario a 2 decimales antes de devolver (Req 2.8).
 */
export async function calcularValorInventario(
  organizacion_id: string
): Promise<{ inversion: number; recaudacionPotencial: number }> {
  const productos = await prisma.producto.findMany({
    where: { organizacion_id, activo: true },
    select: {
      precio_compra: true,
      precio_venta: true,
      precio_por_variante: true,
      stock_actual: true,
      variantes: { select: { precio_compra: true, precio_venta: true, stock_actual: true } },
    },
  })

  let inversionCruda = 0
  let recaudacionCruda = 0

  for (const p of productos) {
    const stock = p.stock_actual ?? 0
    const compra = p.precio_compra !== null ? Number(p.precio_compra) : 0
    const venta = p.precio_venta !== null ? Number(p.precio_venta) : 0

    inversionCruda += p.precio_por_variante && p.variantes.length > 0
      ? p.variantes.reduce((sum, variante) => sum + precioCompraEfectivo(p, variante) * variante.stock_actual, 0)
      : compra * stock
    recaudacionCruda += p.precio_por_variante && p.variantes.length > 0
      ? p.variantes.reduce((sum, variante) => sum + precioEfectivo(p, variante) * variante.stock_actual, 0)
      : venta * stock
  }

  return {
    inversion: redondearBancario(inversionCruda),
    recaudacionPotencial: redondearBancario(recaudacionCruda),
  }
}
