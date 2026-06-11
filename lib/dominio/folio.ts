/**
 * lib/dominio/folio.ts
 * Generación atómica de folios de venta con formato VTA-AAAAMMDD-NNNN.
 *
 * El consecutivo diario se almacena en la tabla `configuracion` con clave
 * `folio_seq:AAAAMMDD` y se incrementa dentro de la misma transacción de venta
 * usando SELECT ... FOR UPDATE + UPDATE para garantizar atomicidad sin carreras.
 */
import { formatInTimeZone } from "date-fns-tz"
import type { PrismaClient } from "@prisma/client"
import { LimiteFolioDiarioError } from "@/lib/api/errores"

// Tipo para el cliente de transacción de Prisma
type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0]

/**
 * Genera un folio único para la fecha dada dentro de una transacción Prisma.
 *
 * Estrategia de incremento atómico:
 * 1. Asegura que exista la fila con `INSERT IGNORE` (valor inicial "1").
 * 2. Incrementa con `UPDATE ... SET valor = valor + 1`.
 * 3. Lee el valor resultante con `SELECT ... FOR UPDATE` (lock pesimista).
 *
 * Al ejecutarse dentro de la misma `$transaction` que la venta, el folio
 * se asigna junto con la inserción o se revierte con ella.
 *
 * @param tx - Cliente de transacción Prisma
 * @param fecha - Fecha de la venta (default: ahora)
 * @param organizacion_id - ID del tenant para aislar el contador por organización
 * @returns Folio con formato VTA-AAAAMMDD-NNNN
 * @throws LimiteFolioDiarioError si se superan 9999 ventas en el día
 */
export async function generarFolio(
  tx: TransactionClient,
  fecha: Date = new Date(),
  organizacion_id: string
): Promise<string> {
  const tz = process.env.TZ ?? "America/Mexico_City"
  const yyyymmdd = formatInTimeZone(fecha, tz, "yyyyMMdd")
  const clave = `folio_seq:${yyyymmdd}`

  // Paso 1: Insertar la fila si no existe (valor inicial = 0, se incrementará a 1)
  await tx.$executeRaw`
    INSERT IGNORE INTO configuracion (organizacion_id, clave, valor, actualizado_en)
    VALUES (${organizacion_id}, ${clave}, '0', NOW())
  `

  // Paso 2: Incrementar atómicamente
  await tx.$executeRaw`
    UPDATE configuracion
    SET valor = CAST(CAST(valor AS UNSIGNED) + 1 AS CHAR),
        actualizado_en = NOW()
    WHERE organizacion_id = ${organizacion_id} AND clave = ${clave}
  `

  // Paso 3: Leer el valor con lock pesimista para serializar dentro de la tx
  const rows = await tx.$queryRaw<Array<{ valor: string }>>`
    SELECT valor FROM configuracion WHERE organizacion_id = ${organizacion_id} AND clave = ${clave} FOR UPDATE
  `

  const valor = parseInt(rows[0]?.valor ?? "1", 10)

  if (valor > 9999) {
    throw new LimiteFolioDiarioError()
  }

  return `VTA-${yyyymmdd}-${String(valor).padStart(4, "0")}`
}
