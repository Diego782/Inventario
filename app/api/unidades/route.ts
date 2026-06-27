import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ok, creado, errorConflicto, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { resolverContexto } from "@/lib/auth/contexto-request"

const CLAVE = "unidades_disponibles"
const DEFAULTS = ["unidad", "kg", "litro", "caja", "metro", "par"]

async function leerUnidades(): Promise<string[]> {
  const fila = await prisma.configuracion.findFirst({ where: { clave: CLAVE } })
  if (!fila) return DEFAULTS
  try {
    const parsed = JSON.parse(fila.valor)
    return Array.isArray(parsed) ? parsed : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

async function guardarUnidades(unidades: string[], organizacion_id: string): Promise<void> {
  await prisma.configuracion.upsert({
    where: { organizacion_id_clave: { organizacion_id, clave: CLAVE } },
    create: { organizacion_id, clave: CLAVE, valor: JSON.stringify(unidades) },
    update: { valor: JSON.stringify(unidades) },
  })
}

export async function GET() {
  // Requiere autenticación con organización activa
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  try {
    const unidades = await leerUnidades()
    return ok(unidades)
  } catch (e) {
    return mapPrismaError(e)
  }
}

const crearSchema = z.object({ nombre: z.string().min(1).max(30) })

export async function POST(req: NextRequest) {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  return withValidation(crearSchema, req, async (input) => {
    try {
      const unidades = await leerUnidades()
      const nombre = input.nombre.trim().toLowerCase()
      if (unidades.includes(nombre)) {
        return errorConflicto("UNIDAD_DUPLICADA", 409, "Esa unidad ya existe.")
      }
      unidades.push(nombre)
      const orgId = resultado.ctx.organizacionActiva!.id
      await guardarUnidades(unidades, orgId)
      return creado(unidades)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const editarSchema = z.object({ nombre: z.string().min(1).max(30), nuevo: z.string().min(1).max(30) })

export async function PUT(req: NextRequest) {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

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
      const orgId = resultado.ctx.organizacionActiva!.id
      await guardarUnidades(unidades, orgId)
      return ok(unidades)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const eliminarSchema = z.object({ nombre: z.string().min(1) })

export async function DELETE(req: NextRequest) {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  return withValidation(eliminarSchema, req, async (input) => {
    try {
      const unidades = await leerUnidades()
      const nombre = input.nombre.trim().toLowerCase()
      const filtrado = unidades.filter((u) => u !== nombre)
      if (filtrado.length === unidades.length) {
        return errorNoEncontrado("NO_ENCONTRADO", "Unidad no encontrada.")
      }
      const orgId = resultado.ctx.organizacionActiva!.id
      await guardarUnidades(filtrado, orgId)
      return ok(filtrado)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
