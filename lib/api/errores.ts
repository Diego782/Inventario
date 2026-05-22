/**
 * lib/api/errores.ts
 * Mapeo centralizado de errores de Prisma a respuestas HTTP del dominio.
 * Evita que los stack traces de Prisma lleguen al cliente.
 */
import { Prisma } from "@prisma/client"
import {
  errorConflicto,
  errorServidor,
  errorBdNoDisponible,
  errorNoEncontrado,
  errorPeticion,
} from "./respuestas"

/**
 * Errores de dominio para lanzar desde la capa de dominio.
 * Cada uno se mapea a un código de error específico.
 */
export class StockNegativoError extends Error {
  constructor() {
    super("STOCK_NEGATIVO")
    this.name = "StockNegativoError"
  }
}

export class UsarAjusteStockError extends Error {
  constructor() {
    super("USAR_AJUSTE_STOCK")
    this.name = "UsarAjusteStockError"
  }
}

export class CodigoBarrasInvalidoError extends Error {
  constructor() {
    super("CODIGO_BARRAS_INVALIDO")
    this.name = "CodigoBarrasInvalidoError"
  }
}

export class ProductoNoEncontradoError extends Error {
  constructor() {
    super("PRODUCTO_NO_ENCONTRADO")
    this.name = "ProductoNoEncontradoError"
  }
}

export class VentaFallidaError extends Error {
  constructor(cause?: unknown) {
    super("VENTA_FALLIDA")
    this.name = "VentaFallidaError"
    if (cause) this.cause = cause
  }
}

export class LimiteFolioDiarioError extends Error {
  constructor() {
    super("LIMITE_FOLIO_DIARIO")
    this.name = "LimiteFolioDiarioError"
  }
}

export class VentaTimeoutError extends Error {
  constructor() {
    super("VENTA_TIMEOUT")
    this.name = "VentaTimeoutError"
  }
}

/**
 * Mapea cualquier error (Prisma o dominio) a una Response HTTP.
 * Nunca filtra stack traces al cliente.
 */
export function mapPrismaError(e: unknown): Response {
  // Errores de dominio
  if (e instanceof StockNegativoError) return errorPeticion("STOCK_NEGATIVO")
  if (e instanceof UsarAjusteStockError) return errorPeticion("USAR_AJUSTE_STOCK")
  if (e instanceof CodigoBarrasInvalidoError) return errorPeticion("CODIGO_BARRAS_INVALIDO")
  if (e instanceof ProductoNoEncontradoError) return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
  if (e instanceof LimiteFolioDiarioError) return errorConflicto("LIMITE_FOLIO_DIARIO")
  if (e instanceof VentaTimeoutError) return errorServidor("VENTA_TIMEOUT", 504)
  if (e instanceof VentaFallidaError) return errorServidor("VENTA_FALLIDA")

  // Errores de Prisma
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      // Unique constraint violation
      const target = (e.meta?.target as string[] | string | undefined) ?? ""
      const targetStr = Array.isArray(target) ? target.join(",") : String(target)
      if (targetStr.includes("sku")) return errorConflicto("SKU_DUPLICADO")
      if (targetStr.includes("codigo_barras")) return errorConflicto("CODIGO_BARRAS_DUPLICADO")
      if (targetStr.includes("folio")) return errorConflicto("LIMITE_FOLIO_DIARIO")
      if (targetStr.includes("nombre")) return errorConflicto("CATEGORIA_DUPLICADA")
      return errorConflicto("CONFLICTO")
    }
    if (e.code === "P2025") {
      return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
    }
  }

  if (
    e instanceof Prisma.PrismaClientInitializationError ||
    e instanceof Prisma.PrismaClientRustPanicError
  ) {
    return errorBdNoDisponible()
  }

  // Error genérico del servidor
  return errorServidor("VENTA_FALLIDA")
}
