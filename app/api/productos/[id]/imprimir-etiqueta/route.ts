import { NextRequest } from "next/server"
import { exec } from "node:child_process"
import { writeFile, unlink } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { randomUUID } from "node:crypto"
import { promisify } from "node:util"
import { z } from "zod"
import { PDFDocument, StandardFonts, rgb } from "pdf-lib"
import bwipjs from "bwip-js"
import { prisma } from "@/lib/db"
import { ok, errorNoEncontrado, errorPeticion, errorServidor } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"

const execAsync = promisify(exec)

const imprimirSchema = z.object({
  cantidad: z.number().int().min(1).max(100),
})

type Params = { params: Promise<{ id: string }> }

const MM_TO_PT = 2.834645669 // 1 mm = 2.834645... pt

function formatearPrecio(valor: number): string {
  return new Intl.NumberFormat("es-MX", {
    style: "currency",
    currency: "MXN",
  }).format(valor)
}

async function generarBarcodePNG(codigo: string): Promise<Buffer> {
  const formato = codigo.length === 13 ? "ean13" : "code128"
  return await bwipjs.toBuffer({
    bcid: formato,
    text: codigo,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: "center",
    textsize: 8,
  })
}

async function generarPdfEtiquetas(opts: {
  nombre: string
  codigoBarras: string | null
  precio: number
  anchoMm: number
  altoMm: number
  cantidad: number
}): Promise<Uint8Array> {
  const { nombre, codigoBarras, precio, anchoMm, altoMm, cantidad } = opts

  const anchoPt = anchoMm * MM_TO_PT
  const altoPt = altoMm * MM_TO_PT

  const pdf = await PDFDocument.create()
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica)
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold)

  let barcodeImage: Awaited<ReturnType<typeof pdf.embedPng>> | null = null
  if (codigoBarras) {
    try {
      const png = await generarBarcodePNG(codigoBarras)
      barcodeImage = await pdf.embedPng(png)
    } catch {
      barcodeImage = null
    }
  }

  const precioStr = formatearPrecio(precio)

  for (let i = 0; i < cantidad; i++) {
    const page = pdf.addPage([anchoPt, altoPt])

    // --- Nombre del producto (truncado al ancho) ---
    const fontSizeNombre = 8
    let nombreTruncado = nombre
    const maxNombreWidth = anchoPt - 4 * MM_TO_PT
    while (
      fontBold.widthOfTextAtSize(nombreTruncado, fontSizeNombre) > maxNombreWidth &&
      nombreTruncado.length > 1
    ) {
      nombreTruncado = nombreTruncado.slice(0, -1)
    }
    if (nombreTruncado !== nombre) {
      while (
        fontBold.widthOfTextAtSize(nombreTruncado + "…", fontSizeNombre) > maxNombreWidth &&
        nombreTruncado.length > 1
      ) {
        nombreTruncado = nombreTruncado.slice(0, -1)
      }
      nombreTruncado += "…"
    }
    const nombreWidth = fontBold.widthOfTextAtSize(nombreTruncado, fontSizeNombre)
    const nombreY = altoPt - 2 * MM_TO_PT - fontSizeNombre
    page.drawText(nombreTruncado, {
      x: (anchoPt - nombreWidth) / 2,
      y: nombreY,
      size: fontSizeNombre,
      font: fontBold,
      color: rgb(0, 0, 0),
    })

    // --- Código de barras ---
    let barcodeBottomY = nombreY
    if (barcodeImage) {
      const margenLateral = 3 * MM_TO_PT
      const barcodeMaxWidth = anchoPt - 2 * margenLateral
      const altoDisponible = altoPt - 4 * MM_TO_PT - 4 * MM_TO_PT // dejar espacio para nombre y precio
      const ratio = barcodeImage.width / barcodeImage.height
      let barcodeW = barcodeMaxWidth
      let barcodeH = barcodeW / ratio
      if (barcodeH > altoDisponible) {
        barcodeH = altoDisponible
        barcodeW = barcodeH * ratio
      }
      const barcodeX = (anchoPt - barcodeW) / 2
      const fontSizePrecio = 10
      const precioY = 4 * MM_TO_PT
      const espacioBarcode = nombreY - 1 * MM_TO_PT - (precioY + fontSizePrecio + 1 * MM_TO_PT)
      if (barcodeH > espacioBarcode) {
        barcodeH = espacioBarcode
        barcodeW = barcodeH * ratio
      }
      const barcodeY = precioY + fontSizePrecio + 1 * MM_TO_PT + (espacioBarcode - barcodeH) / 2
      page.drawImage(barcodeImage, {
        x: (anchoPt - barcodeW) / 2,
        y: barcodeY,
        width: barcodeW,
        height: barcodeH,
      })
      barcodeBottomY = barcodeY
    } else if (codigoBarras) {
      const fontSize = 7
      const w = fontRegular.widthOfTextAtSize(codigoBarras, fontSize)
      page.drawText(codigoBarras, {
        x: (anchoPt - w) / 2,
        y: altoPt / 2,
        size: fontSize,
        font: fontRegular,
        color: rgb(0.4, 0.4, 0.4),
      })
    }

    // --- Precio ---
    const fontSizePrecio = 10
    const precioWidth = fontBold.widthOfTextAtSize(precioStr, fontSizePrecio)
    page.drawText(precioStr, {
      x: (anchoPt - precioWidth) / 2,
      y: 4 * MM_TO_PT,
      size: fontSizePrecio,
      font: fontBold,
      color: rgb(0, 0, 0),
    })
  }

  return await pdf.save()
}

async function leerDimensionesEtiqueta(): Promise<{ anchoMm: number; altoMm: number }> {
  const filas = await prisma.configuracion.findMany({
    where: { clave: { in: ["etiqueta_ancho_mm", "etiqueta_alto_mm"] } },
  })
  const mapa: Record<string, string> = {}
  for (const f of filas) mapa[f.clave] = f.valor
  return {
    anchoMm: mapa.etiqueta_ancho_mm ? parseInt(mapa.etiqueta_ancho_mm, 10) : 50,
    altoMm: mapa.etiqueta_alto_mm ? parseInt(mapa.etiqueta_alto_mm, 10) : 30,
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  return withValidation(imprimirSchema, req, async (input) => {
    try {
      const { id } = await params
      const producto = await prisma.producto.findUnique({ where: { id } })

      if (!producto || !producto.activo) {
        return errorNoEncontrado("PRODUCTO_NO_ENCONTRADO")
      }

      const { anchoMm, altoMm } = await leerDimensionesEtiqueta()

      const pdfBytes = await generarPdfEtiquetas({
        nombre: producto.nombre,
        codigoBarras: producto.codigo_barras,
        precio: Number(producto.precio_venta),
        anchoMm,
        altoMm,
        cantidad: input.cantidad,
      })

      const impresora = process.env.PRINTER_NAME?.trim()

      // Si no hay impresora configurada, devolver el PDF para que el cliente lo descargue/imprima
      if (!impresora) {
        return new Response(pdfBytes as BodyInit, {
          status: 200,
          headers: {
            "Content-Type": "application/pdf",
            "Content-Disposition": `inline; filename="etiqueta-${producto.sku}.pdf"`,
          },
        })
      }

      // Guardar PDF temporal y enviarlo a la impresora con `lp`
      const tmpFile = join(tmpdir(), `etiqueta-${randomUUID()}.pdf`)
      await writeFile(tmpFile, pdfBytes)

      try {
        const cmd = `lp -d ${JSON.stringify(impresora)} -o media=Custom.${anchoMm}x${altoMm}mm ${JSON.stringify(tmpFile)}`
        await execAsync(cmd)
      } catch {
        await unlink(tmpFile).catch(() => {})
        return errorServidor("IMPRESION_FALLIDA", 500)
      }

      // Limpiar archivo temporal después de un tiempo prudente
      setTimeout(() => {
        unlink(tmpFile).catch(() => {})
      }, 30_000)

      return ok({ enviado: true, cantidad: input.cantidad, impresora })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
