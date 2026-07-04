/**
 * lib/dominio/deuda.ts
 * Historial de deuda por cliente: saldos, abonos, fiadores y totales.
 *
 * El saldo se deriva de los movimientos (nunca se materializa como columna)
 * para evitar anomalías de sincronización.
 *
 * Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11,
 *               5.12, 5.13
 */
import { Prisma } from "@prisma/client"
import type { Cliente, MovimientoDeuda } from "@prisma/client"
import { prisma } from "@/lib/db"
import { redondearBancario } from "@/lib/money"
import { AbonoInvalidoError, ClienteNoEncontradoError } from "@/lib/api/errores"

// ---------------------------------------------------------------------------
// Tipo público
// ---------------------------------------------------------------------------

export type TipoMovimientoDeuda = "cargo" | "abono"

// ---------------------------------------------------------------------------
// Saldo de un cliente
// ---------------------------------------------------------------------------

/**
 * Calcula el saldo de un cliente como la suma de sus cargos menos sus abonos,
 * aplicando redondeo bancario al resultado (Req 5.3, 5.12).
 *
 * Solo agrega `MovimientoDeuda` con `organizacion_id` coincidente (Req 5.12).
 * Devuelve 0 si no hay movimientos.
 */
export async function saldoCliente(
  cliente_id: string,
  organizacion_id: string
): Promise<number> {
  const movimientos = await prisma.movimientoDeuda.findMany({
    where: { cliente_id, organizacion_id },
    select: { tipo: true, monto: true },
  })

  const saldo = movimientos.reduce((acc, m) => {
    const monto = Number(m.monto)
    return m.tipo === "cargo" ? acc + monto : acc - monto
  }, 0)

  return redondearBancario(saldo)
}

// ---------------------------------------------------------------------------
// Cargo transaccional (se invoca dentro de $transaction)
// ---------------------------------------------------------------------------

/**
 * Crea un cargo de deuda dentro de una transacción Prisma.
 *
 * Debe invocarse siempre dentro de la misma `$transaction` que la venta
 * fiada (Req 6.6, 6.10). Si el cargo falla, la transacción revierte la venta.
 */
export async function crearCargoDeuda(
  tx: Prisma.TransactionClient,
  params: {
    cliente_id: string
    organizacion_id: string
    monto: number
    venta_id: string
    plazo?: Date
  }
): Promise<MovimientoDeuda> {
  return tx.movimientoDeuda.create({
    data: {
      organizacion_id: params.organizacion_id,
      cliente_id: params.cliente_id,
      tipo: "cargo",
      monto: new Prisma.Decimal(params.monto),
      venta_id: params.venta_id,
      plazo_deuda: params.plazo ?? null,
    },
  })
}

// ---------------------------------------------------------------------------
// Registrar abono
// ---------------------------------------------------------------------------

/**
 * Registra un abono para un cliente validando:
 *   - Que el cliente exista en el tenant (Req 5.11).
 *   - Que `monto >= 0.01` (Req 5.9).
 *   - Que `monto <= saldo_actual` (Req 5.8).
 *
 * Recalcula el saldo tras el abono (Req 5.7). Lanza `AbonoInvalidoError`
 * (422) en los casos inválidos.
 *
 * Solo agrega `MovimientoDeuda` con `organizacion_id` coincidente (Req 5.12).
 */
export async function registrarAbono(
  input: { cliente_id: string; monto: number },
  organizacion_id: string
): Promise<{ movimiento: MovimientoDeuda; saldo: number }> {
  const { cliente_id, monto } = input

  // Req 5.11 — el cliente debe existir en el tenant.
  const cliente = await prisma.cliente.findFirst({
    where: { id: cliente_id, organizacion_id },
    select: { id: true },
  })
  if (!cliente) throw new ClienteNoEncontradoError()

  // Req 5.9 — el monto mínimo es 0.01.
  if (monto < 0.01) {
    throw new AbonoInvalidoError(
      "El monto del abono debe ser mayor o igual a 0.01"
    )
  }

  // Calcular saldo actual para validar el límite superior.
  const saldoActual = await saldoCliente(cliente_id, organizacion_id)

  // Req 5.8 — el monto no puede superar el saldo actual.
  if (monto > saldoActual) {
    throw new AbonoInvalidoError(
      "El monto del abono no puede superar el saldo actual del cliente"
    )
  }

  // Persistir el abono.
  const movimiento = await prisma.movimientoDeuda.create({
    data: {
      organizacion_id,
      cliente_id,
      tipo: "abono",
      monto: new Prisma.Decimal(monto),
    },
  })

  // Recalcular el saldo tras el abono (Req 5.7).
  const saldoNuevo = redondearBancario(saldoActual - monto)

  return { movimiento, saldo: saldoNuevo }
}

// ---------------------------------------------------------------------------
// Listar fiadores
// ---------------------------------------------------------------------------

/**
 * Lista los clientes de la organización cuyo saldo es mayor que cero
 * (Req 5.1, 5.10).
 *
 * Solo considera `MovimientoDeuda` con `organizacion_id` coincidente (Req 5.12).
 * Si no hay clientes con deuda, devuelve un array vacío (Req 5.13).
 */
export async function listarFiadores(
  organizacion_id: string
): Promise<Array<{ cliente: Cliente; saldo: number }>> {
  // Traer todos los clientes del tenant con sus movimientos.
  const clientes = await prisma.cliente.findMany({
    where: { organizacion_id },
    include: {
      movimientos_deuda: {
        where: { organizacion_id },
        select: { tipo: true, monto: true },
      },
    },
  })

  const fiadores: Array<{ cliente: Cliente; saldo: number }> = []

  for (const c of clientes) {
    const saldo = redondearBancario(
      c.movimientos_deuda.reduce((acc, m) => {
        const monto = Number(m.monto)
        return m.tipo === "cargo" ? acc + monto : acc - monto
      }, 0)
    )

    if (saldo > 0) {
      // Extraer el cliente sin la relación incluida para devolver tipo limpio.
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { movimientos_deuda: _movs, ...clienteBase } = c
      fiadores.push({ cliente: clienteBase as Cliente, saldo })
    }
  }

  return fiadores
}

// ---------------------------------------------------------------------------
// Historial de deuda
// ---------------------------------------------------------------------------

/**
 * Devuelve el historial cronológico de movimientos de deuda de un cliente,
 * anotando el saldo corrido después de cada movimiento (Req 5.2).
 *
 * Orden: ascendente por `fecha`, con desempate por `creado_en` (orden de
 * registro, Req 5.2).
 *
 * Solo incluye `MovimientoDeuda` con `organizacion_id` coincidente (Req 5.12).
 */
export async function historialDeuda(
  cliente_id: string,
  organizacion_id: string
): Promise<Array<{ movimiento: MovimientoDeuda; saldoResultante: number }>> {
  const movimientos = await prisma.movimientoDeuda.findMany({
    where: { cliente_id, organizacion_id },
    orderBy: [{ fecha: "asc" }, { creado_en: "asc" }],
  })

  let acumulado = 0
  return movimientos.map((m) => {
    const monto = Number(m.monto)
    if (m.tipo === "cargo") {
      acumulado += monto
    } else {
      acumulado -= monto
    }
    return {
      movimiento: m,
      saldoResultante: redondearBancario(acumulado),
    }
  })
}

// ---------------------------------------------------------------------------
// Totales de deuda
// ---------------------------------------------------------------------------

/**
 * Devuelve los totales de la sección Fiadores para el tenant:
 *   - `totalClientesConDeuda`: cantidad de clientes con saldo > 0 (Req 5.4, 5.5).
 *   - `totalDeudaPendiente`: suma de saldos de esos clientes, con redondeo
 *     bancario (Req 5.6).
 *
 * Usa solo `MovimientoDeuda` y `Cliente` del tenant (Req 5.12).
 * Si no hay clientes con deuda, devuelve ceros (Req 5.13).
 *
 * Este mismo valor alimenta la métrica "Total de dinero en deuda" del
 * dashboard (Req 9.4, 9.5), garantizando un único origen de cálculo.
 */
export async function totalesDeuda(organizacion_id: string): Promise<{
  totalClientesConDeuda: number
  totalDeudaPendiente: number
}> {
  // Obtener todos los movimientos del tenant agrupados por cliente.
  const movimientos = await prisma.movimientoDeuda.findMany({
    where: { organizacion_id },
    select: { cliente_id: true, tipo: true, monto: true },
  })

  // Calcular saldo por cliente.
  const saldosPorCliente = new Map<string, number>()
  for (const m of movimientos) {
    const prev = saldosPorCliente.get(m.cliente_id) ?? 0
    const monto = Number(m.monto)
    saldosPorCliente.set(
      m.cliente_id,
      m.tipo === "cargo" ? prev + monto : prev - monto
    )
  }

  let totalClientesConDeuda = 0
  let sumaRaw = 0

  for (const saldo of saldosPorCliente.values()) {
    const saldoRedondeado = redondearBancario(saldo)
    if (saldoRedondeado > 0) {
      totalClientesConDeuda += 1
      sumaRaw += saldoRedondeado
    }
  }

  return {
    totalClientesConDeuda,
    totalDeudaPendiente: redondearBancario(sumaRaw),
  }
}
