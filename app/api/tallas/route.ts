import { NextRequest } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/db"
import { ok, creado, errorConflicto, errorNoEncontrado } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"
import { resolverContexto } from "@/lib/auth/contexto-request"

const CLAVE = "tallas_disponibles"
const DEFAULTS = ["XS", "S", "M", "L", "XL", "XXL"]

async function leerTallas(): Promise<string[]> {
  const fila = await prisma.configuracion.findFirst({ where: { clave: CLAVE } })
  if (!fila) return DEFAULTS
  try {
    const parsed = JSON.parse(fila.valor)
    return Array.isArray(parsed) ? parsed : DEFAULTS
  } catch {
    return DEFAULTS
  }
}

async function guardarTallas(tallas: string[], organizacion_id: string): Promise<void> {
  await prisma.configuracion.upsert({
    where: { organizacion_id_clave: { organizacion_id, clave: CLAVE } },
    create: { organizacion_id, clave: CLAVE, valor: JSON.stringify(tallas) },
    update: { valor: JSON.stringify(tallas) },
  })
}

export async function GET() {
  // Requiere autenticación con organización activa
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  try {
    return ok(await leerTallas())
  } catch (e) {
    return mapPrismaError(e)
  }
}

const crearSchema = z.object({ nombre: z.string().min(1).max(20) })

export async function POST(req: NextRequest) {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  return withValidation(crearSchema, req, async (input) => {
    try {
      const tallas = await leerTallas()
      const nombre = input.nombre.trim().toUpperCase()
      if (tallas.includes(nombre)) return errorConflicto("TALLA_DUPLICADA", 409, "Esa talla ya existe.")
      tallas.push(nombre)
      const orgId = resultado.ctx.organizacionActiva!.id
      await guardarTallas(tallas, orgId)
      return creado(tallas)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}

const editarSchema = z.object({ nombre: z.string().min(1).max(20), nuevo: z.string().min(1).max(20) })

export async function PUT(req: NextRequest) {
  const resultado = await resolverContexto("requiere-organizacion")
  if (resultado.error) return resultado.error

  return withValidation(editarSchema, req, async (input) => {
    try {
      const tallas = await leerTallas()
      const idx = tallas.indexOf(input.nombre.trim().toUpperCase())
      if (idx === -1) return errorNoEncontrado("NO_ENCONTRADO", "Talla no encontrada.")
      const nuevo = input.nuevo.trim().toUpperCase()
      if (tallas.includes(nuevo) && nuevo !== tallas[idx]) return errorConflicto("TALLA_DUPLICADA", 409, "Esa talla ya existe.")
      tallas[idx] = nuevo
      const orgId = resultado.ctx.organizacionActiva!.id
      await guardarTallas(tallas, orgId)
      return ok(tallas)
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
      const tallas = await leerTallas()
      const nombre = input.nombre.trim().toUpperCase()
      const filtrado = tallas.filter((t) => t !== nombre)
      if (filtrado.length === tallas.length) return errorNoEncontrado("NO_ENCONTRADO", "Talla no encontrada.")
      const orgId = resultado.ctx.organizacionActiva!.id
      await guardarTallas(filtrado, orgId)
      return ok(filtrado)
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
