import crypto from "crypto"

export function generarToken(): { plano: string; hash: string } {
  const buffer = crypto.randomBytes(32)
  const plano = buffer.toString("base64url")
  const hash = hashToken(plano)
  return { plano, hash }
}

export function hashToken(plano: string): string {
  return crypto.createHash("sha256").update(plano).digest("hex")
}

export function coincideToken(plano: string, hash: string): boolean {
  const calculado = hashToken(plano)
  return crypto.timingSafeEqual(Buffer.from(calculado, "hex"), Buffer.from(hash, "hex"))
}

export function esVigente(expira_en: Date, ahora: Date = new Date()): boolean {
  return ahora <= expira_en
}
