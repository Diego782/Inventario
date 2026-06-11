/**
 * Hashing y verificación de contraseñas con bcryptjs.
 * Validates: Requirements R2.4, R2.5
 */

import bcrypt from "bcryptjs";
import { clampInt } from "@/lib/auth/vigencia";

/**
 * Costo de bcrypt derivado de la variable de entorno BCRYPT_COST.
 * Rango válido: [4, 15]. Default: 12.
 */
function obtenerCosto(): number {
  return clampInt(process.env.BCRYPT_COST, 12, 4, 15);
}

/**
 * Genera el hash bcrypt de una contraseña en texto plano.
 */
export async function hashContrasena(plano: string): Promise<string> {
  const cost = obtenerCosto();
  return bcrypt.hash(plano, cost);
}

/**
 * Verifica una contraseña en texto plano contra un hash bcrypt.
 * Retorna `false` ante hash corrupto o cualquier error.
 */
export async function verificarContrasena(
  plano: string,
  hash: string,
): Promise<boolean> {
  try {
    return await bcrypt.compare(plano, hash);
  } catch {
    return false;
  }
}
