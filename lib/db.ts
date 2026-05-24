/**
 * lib/db.ts
 * Singleton de PrismaClient para evitar fugas de conexiones durante hot-reload.
 * Compatible con Prisma 7 que requiere @prisma/adapter-mariadb para MySQL.
 */
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

function parseDatabaseUrl(url: string) {
  const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
  if (!match) return null
  const [, user, password, host, portStr, database] = match
  return { user, password, host, port: parseInt(portStr, 10), database }
}

function createPrismaClient(): PrismaClient | null {
  const url = process.env.DATABASE_URL

  if (!url) {
    console.error(
      "[boot] MISSING_DATABASE_URL: La variable de entorno DATABASE_URL no está definida. " +
        "La base de datos no estará disponible hasta que se configure correctamente."
    )
    return null
  }

  const parsed = parseDatabaseUrl(url)
  if (!parsed) {
    console.error("[boot] MISSING_DATABASE_URL: DATABASE_URL tiene un formato inválido.")
    return null
  }

  try {
    const adapter = new PrismaMariaDb({
      host: parsed.host,
      port: parsed.port,
      user: parsed.user,
      password: parsed.password,
      database: parsed.database,
      connectionLimit: process.env.NODE_ENV === "production" ? 10 : 3,
    })

    return new PrismaClient({
      adapter,
      log:
        process.env.NODE_ENV === "development"
          ? ["error", "warn"]
          : ["error"],
    })
  } catch (e) {
    console.error("[boot] Error al crear PrismaClient:", e)
    return null
  }
}

export const prisma: PrismaClient =
  (globalForPrisma.prisma ?? createPrismaClient()) as PrismaClient

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma
}
