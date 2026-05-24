import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ok, creado, errorConflicto, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"

const CLAVE = "tallas_disponibles"
const DEFAULTS = ["XS", "S", "M", "L", "XL", "XXL"]

async function leerTallas(): Promise<string[]> {
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE } })
  if (!fila) return DEFAULTS
  try {
    const parsed = JSON.parse(fila.valor)
    return Array.isArray(parsed) ? parsed : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

async function guardarTallas(tallas: string[]): Promise<void> {
  await prisma.configuracion.upsert({
    where: { clave: CLAVE },
    create: { clave: CLAVE, valor: JSON.stringify(tallas) },
    update: { valor: JSON.stringify(tallas) },
  })
}

export async function GET() {
  try {
    return ok(await leerTallas())
  } catch (e) {
    return mapPrismaError(e)
  }
}

const crearSchema = z.object({ nombre: z.string().min(1).max(20) })

export async function POST(req: NextRequest) {
  return withValidation(crearSchema, req, async (input) => {
    try {
      const tallas = await leerTallas()
      const nombre = input.nombre.trim().toUpperCase()
      if (tallas.includes(nombre)) return errorConflicto("TALLA_DUPLICADA", 409, "Esa talla ya existe.")
      tallas.push(nombre)
      await guardarTallas(tallas)
      return creado(tallas)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const editarSchema = z.object({ nombre: z.string().min(1).max(20), nuevo: z.string().min(1).max(20) })

export async function PUT(req: NextRequest) {
  return withValidation(editarSchema, req, async (input) => {
    try {
      const tallas = await leerTallas()
      const idx = tallas.indexOf(input.nombre.trim().toUpperCase())
      if (idx === -1) return errorNoEncontrado("NO_ENCONTRADO", "Talla no encontrada.")
      const nuevo = input.nuevo.trim().toUpperCase()
      if (tallas.includes(nuevo) && nuevo !== tallas[idx]) return errorConflicto("TALLA_DUPLICADA", 409, "Esa talla ya existe.")
      tallas[idx] = nuevo
      await guardarTallas(tallas)
      return ok(tallas)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const eliminarSchema = z.object({ nombre: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  return withValidation(eliminarSchema, req, async (input) => {
    try {
      const tallas = await leerTallas()
      const nombre = input.nombre.trim().toUpperCase()
      const filtrado = tallas.filter((t) => t !== nombre)
      if (filtrado.length === tallas.length) return errorNoEncontrado("NO_ENCONTRADO", "Talla no encontrada.")
      await guardarTallas(filtrado)
      return ok(filtrado)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
