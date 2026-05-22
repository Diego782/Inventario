import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient } from "@prisma/client"

const url = process.env["DATABASE_URL"] ?? ""
// Parse mysql://user:pass@host:port/db?params
const match = url.match(/mysql:\/\/([^:]+):([^@]+)@([^:]+):(\d+)\/([^?]+)/)
if (!match) {
  console.error("❌ DATABASE_URL inválida o no encontrada:", url)
  process.exit(1)
}
const [, user, password, host, portStr, database] = match
const port = parseInt(portStr, 10)

const adapter = new PrismaMariaDb({ host, port, user, password, database, connectionLimit: 1 })
const prisma = new PrismaClient({ adapter })

async function main() {
  // Categorías base
  const categorias = ["General", "Bebidas", "Alimentos", "Limpieza", "Otros"]
  for (const nombre of categorias) {
    await prisma.categoria.upsert({
      where: { nombre },
      create: { nombre },
      update: {},
    })
  }

  // Configuración por defecto
  const configuracion: Record<string, string> = {
    porcentaje_impuesto: "0",
    etiqueta_ancho_mm: "50",
    etiqueta_alto_mm: "30",
    ticket_ancho_mm: "80",
    imprimir_automaticamente: "false",
    permitir_sobreventa: "false",
  }

  for (const [clave, valor] of Object.entries(configuracion)) {
    await prisma.configuracion.upsert({
      where: { clave },
      create: { clave, valor },
      update: {},
    })
  }

  console.log("✅ Seed completado: categorías y configuración por defecto insertadas.")
}

main()
  .catch((e) => {
    console.error("❌ Error en seed:", e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
