/**
 * lib/dominio/clientes.ts
 * CRUD de Clientes con aislamiento multi-tenant por organizacion_id.
 *
 * Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.14
 */
import { Prisma } from "@prisma/client"
import type { Cliente } from "@prisma/client"
import { prisma } from "@/lib/db"
import {
  CedulaDuplicadaError,
  ClienteConHistorialError,
  ClienteNoEncontradoError,
} from "@/lib/api/errores"
import type { CrearClienteInput, EditarClienteInput } from "@/lib/schemas/cliente"

/** Máximo de registros por página para listarClientes (Req 4.14). */
const MAX_PAGE_SIZE = 50

/**
 * Crea un nuevo Cliente asociado al tenant indicado.
 *
 * La unicidad de cédula dentro de la organización se apoya en el índice
 * `@@unique([organizacion_id, cedula])` del esquema; si se viola, Prisma
 * lanza un P2002 que se mapea a `CedulaDuplicadaError` (Req 4.3, 4.4).
 */
export async function crearCliente(
  input: CrearClienteInput,
  organizacion_id: string
): Promise<Cliente> {
  try {
    return await prisma.cliente.create({
      data: {
        organizacion_id,
        cedula: input.cedula,
        nombre: input.nombre,
        telefono: input.telefono,
        correo: input.correo ?? null,
        direccion: input.direccion ?? null,
      },
    })
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new CedulaDuplicadaError()
    }
    throw e
  }
}

/**
 * Edita los datos de un Cliente existente verificando que pertenezca al tenant.
 *
 * Si el cliente no existe o pertenece a otra organización, lanza
 * `ClienteNoEncontradoError` (Req 4.7).
 * Si la nueva cédula choca con una existente en la misma organización, lanza
 * `CedulaDuplicadaError` (Req 4.3).
 */
export async function editarCliente(
  id: string,
  input: EditarClienteInput,
  organizacion_id: string
): Promise<Cliente> {
  // Verificar que el cliente pertenece al tenant antes de actualizar.
  const existente = await prisma.cliente.findFirst({
    where: { id, organizacion_id },
    select: { id: true },
  })
  if (!existente) throw new ClienteNoEncontradoError()

  try {
    return await prisma.cliente.update({
      where: { id },
      data: {
        ...(input.cedula !== undefined && { cedula: input.cedula }),
        ...(input.nombre !== undefined && { nombre: input.nombre }),
        ...(input.telefono !== undefined && { telefono: input.telefono }),
        ...(input.correo !== undefined && { correo: input.correo ?? null }),
        ...(input.direccion !== undefined && { direccion: input.direccion ?? null }),
      },
    })
  } catch (e) {
    if (
      e instanceof Prisma.PrismaClientKnownRequestError &&
      e.code === "P2002"
    ) {
      throw new CedulaDuplicadaError()
    }
    throw e
  }
}

/**
 * Elimina un Cliente si y solo si no tiene historial (Ventas ni MovimientosDeuda).
 *
 * - Si el cliente no existe o pertenece a otra organización → `ClienteNoEncontradoError` (Req 4.7).
 * - Si tiene Ventas o MovimientosDeuda asociados → `ClienteConHistorialError` (Req 4.9).
 * - Si no tiene historial → eliminación física (Req 4.8).
 */
export async function eliminarCliente(
  id: string,
  organizacion_id: string
): Promise<void> {
  const existente = await prisma.cliente.findFirst({
    where: { id, organizacion_id },
    select: { id: true },
  })
  if (!existente) throw new ClienteNoEncontradoError()

  // Contar ventas y movimientos de deuda asociados al cliente dentro del tenant.
  const [ventasCount, movimientosCount] = await Promise.all([
    prisma.venta.count({ where: { cliente_id: id } }),
    prisma.movimientoDeuda.count({ where: { cliente_id: id } }),
  ])

  if (ventasCount > 0 || movimientosCount > 0) {
    throw new ClienteConHistorialError()
  }

  await prisma.cliente.delete({ where: { id } })
}

/**
 * Lista Clientes del tenant con paginación.
 *
 * - `take` se limita a máximo 50 (Req 4.14); si no se indica, usa 50.
 * - Solo devuelve clientes cuyo `organizacion_id` coincide con el tenant (Req 4.5).
 * - `q` permite búsqueda parcial por nombre, cédula o teléfono.
 */
export async function listarClientes(params: {
  q?: string
  take?: number
  skip?: number
  organizacion_id: string
}): Promise<{ items: Cliente[]; total: number }> {
  const { q, organizacion_id } = params

  // Aplicar cota máxima de 50 y usar 50 como default (Req 4.14).
  const take = Math.min(params.take ?? MAX_PAGE_SIZE, MAX_PAGE_SIZE)
  const skip = params.skip ?? 0

  const where: Prisma.ClienteWhereInput = { organizacion_id }

  if (q) {
    where.OR = [
      { nombre: { contains: q } },
      { cedula: { contains: q } },
      { telefono: { contains: q } },
    ]
  }

  const [items, total] = await Promise.all([
    prisma.cliente.findMany({
      where,
      take,
      skip,
      orderBy: { nombre: "asc" },
    }),
    prisma.cliente.count({ where }),
  ])

  return { items, total }
}

/**
 * Devuelve un Cliente por su id verificando que pertenezca al tenant.
 *
 * Devuelve `null` si no existe o si pertenece a otra organización (Req 4.7).
 */
export async function obtenerCliente(
  id: string,
  organizacion_id: string
): Promise<Cliente | null> {
  return prisma.cliente.findFirst({
    where: { id, organizacion_id },
  })
}
