import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ok, creado, errorConflicto, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"

const CLAVE = "unidades_disponibles"
const DEFAULTS = ["unidad", "kg", "litro", "caja", "metro", "par"]

async function leerUnidades(): Promise<string[]> {
  const fila = await prisma.configuracion.findUnique({ where: { clave: CLAVE } })
  if (!fila) return DEFAULTS
  try {
    const parsed = JSON.parse(fila.valor)
    return Array.isArray(parsed) ? parsed : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

async function guardarUnidades(unidades: string[]): Promise<void> {
  await prisma.configuracion.upsert({
    where: { clave: CLAVE },
    create: { clave: CLAVE, valor: JSON.stringify(unidades) },
    update: { valor: JSON.stringify(unidades) },
  })
}

export async function GET() {
  try {
    const unidades = await leerUnidades()
    return ok(unidades)
  } catch (e) {
    return mapPrismaError(e)
  }
}

const crearSchema = z.object({ nombre: z.string().min(1).max(30) })

export async function POST(req: NextRequest) {
  return withValidation(crearSchema, req, async (input) => {
    try {
      const unidades = await leerUnidades()
      const nombre = input.nombre.trim().toLowerCase()
      if (unidades.includes(nombre)) {
        return errorConflicto("UNIDAD_DUPLICADA", 409, "Esa unidad ya existe.")
      }
      unidades.push(nombre)
      await guardarUnidades(unidades)
      return creado(unidades)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const editarSchema = z.object({ nombre: z.string().min(1).max(30), nuevo: z.string().min(1).max(30) })

export async function PUT(req: NextRequest) {
  return withValidation(editarSchema, req, async (input) => {
    try {
      const unidades = await leerUnidades()
      const idx = unidades.indexOf(input.nombre.trim().toLowerCase())
      if (idx === -1) return errorNoEncontrado("NO_ENCONTRADO", "Unidad no encontrada.")
      const nuevo = input.nuevo.trim().toLowerCase()
      if (unidades.includes(nuevo) && nuevo !== unidades[idx]) {
        return errorConflicto("UNIDAD_DUPLICADA", 409, "Esa unidad ya existe.")
      }
      unidades[idx] = nuevo
      await guardarUnidades(unidades)
      return ok(unidades)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const eliminarSchema = z.object({ nombre: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  return withValidation(eliminarSchema, req, async (input) => {
    try {
      const unidades = await leerUnidades()
      const nombre = input.nombre.trim().toLowerCase()
      const filtrado = unidades.filter((u) => u !== nombre)
      if (filtrado.length === unidades.length) {
        return errorNoEncontrado("NO_ENCONTRADO", "Unidad no encontrada.")
      }
      await guardarUnidades(filtrado)
      return ok(filtrado)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
