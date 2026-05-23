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
import { ok, errorNoEncontrado, errorServidor } from "@/lib/api/respuestas"
import { mapPrismaError } from "@/lib/api/errores"
import { withValidation } from "@/lib/api/with-validation"

const execAsync = promisify(exec)

const imprimirSchema = z.object({
  cantidad: z.number().int().min(1).max(100),
})

type Params = { params: Promise<{ id: string }> }

const MM_TO_PT = 2.834645669

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

// Genera HTML con @page size exacto — el navegador imprime con el tamaño correcto
async function generarHtmlEtiquetas(opts: {
  nombre: string
  codigoBarras: string | null
  precio: number
  anchoMm: number
  altoMm: number
  cantidad: number
}): Promise<string> {
  const { nombre, codigoBarras, precio, anchoMm, altoMm, cantidad } = opts

  const precioStr = formatearPrecio(precio)
  const nombreEscapado = nombre.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

  let barcodeBase64 = ""
  if (codigoBarras) {
    try {
      const png = await generarBarcodePNG(codigoBarras)
      barcodeBase64 = `data:image/png;base64,${png.toString("base64")}`
    } catch {
      barcodeBase64 = ""
    }
  }

  const etiquetaHtml = `<div class="etiqueta"><p class="nombre">${nombreEscapado}</p>${
    barcodeBase64
      ? `<img class="barcode" src="${barcodeBase64}" alt="${codigoBarras ?? ""}" />`
      : codigoBarras
        ? `<p class="codigo-texto">${codigoBarras}</p>`
        : ""
  }<p class="precio">${precioStr}</p></div>`

  const etiquetas = Array.from({ length: cantidad }).map(() => etiquetaHtml).join("")

  // alto 0.5mm menor que el @page para evitar desbordes que generen páginas blancas
  const etiquetaAltoMm = Math.max(altoMm - 0.5, 1)

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    html, body {
      margin: 0;
      padding: 0;
      background: white;
    }
    * { box-sizing: border-box; }
    @page {
      size: ${anchoMm}mm ${altoMm}mm portrait;
      margin: 0;
    }
    .etiqueta {
      width: ${anchoMm}mm;
      height: ${etiquetaAltoMm}mm;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 1mm 1mm 0.5mm 1mm;
      overflow: hidden;
      page-break-after: always;
      break-after: page;
      page-break-inside: avoid;
      break-inside: avoid;
    }
    .etiqueta:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    .nombre {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 8pt;
      font-weight: bold;
      text-align: center;
      width: 100%;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin: 0 0 0.5mm 0;
      line-height: 1.1;
    }
    .barcode {
      max-width: 95%;
      max-height: ${Math.max(altoMm - 14, 8)}mm;
      width: auto;
      height: auto;
      object-fit: contain;
      display: block;
    }
    .codigo-texto {
      font-family: monospace;
      font-size: 7pt;
      color: #444;
      margin: 0;
    }
    .precio {
      font-family: Helvetica, Arial, sans-serif;
      font-size: 10pt;
      font-weight: bold;
      margin: 0.5mm 0 0 0;
      line-height: 1.1;
    }
  </style>
</head>
<body>${etiquetas}</body>
</html>`
}

// Genera PDF con dimensiones exactas (usado cuando hay impresora CUPS configurada)
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

    if (barcodeImage) {
      const fontSizePrecio = 10
      const precioY = 4 * MM_TO_PT
      const espacioBarcode = nombreY - 1 * MM_TO_PT - (precioY + fontSizePrecio + 1 * MM_TO_PT)
      const ratio = barcodeImage.width / barcodeImage.height
      let barcodeW = anchoPt - 6 * MM_TO_PT
      let barcodeH = barcodeW / ratio
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
    anchoMm: mapa.etiqueta_ancho_mm ? parseInt(mapa.etiqueta_ancho_mm, 10) : 57,
    altoMm: mapa.etiqueta_alto_mm ? parseInt(mapa.etiqueta_alto_mm, 10) : 40,
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
      const impresora = process.env.PRINTER_NAME?.trim()

      // Sin impresora: devolver HTML con @page size correcto para impresión desde el navegador
      if (!impresora) {
        const html = await generarHtmlEtiquetas({
          nombre: producto.nombre,
          codigoBarras: producto.codigo_barras,
          precio: Number(producto.precio_venta),
          anchoMm,
          altoMm,
          cantidad: input.cantidad,
        })
        return new Response(html, {
          status: 200,
          headers: { "Content-Type": "text/html; charset=utf-8" },
        })
      }

      // Con impresora CUPS: generar PDF y enviarlo con lp
      const pdfBytes = await generarPdfEtiquetas({
        nombre: producto.nombre,
        codigoBarras: producto.codigo_barras,
        precio: Number(producto.precio_venta),
        anchoMm,
        altoMm,
        cantidad: input.cantidad,
      })

      const tmpFile = join(tmpdir(), `etiqueta-${randomUUID()}.pdf`)
      await writeFile(tmpFile, pdfBytes)

      try {
        const cmd = `lp -d ${JSON.stringify(impresora)} -o media=Custom.${anchoMm}x${altoMm}mm ${JSON.stringify(tmpFile)}`
        await execAsync(cmd)
      } catch {
        await unlink(tmpFile).catch(() => {})
        return errorServidor("IMPRESION_FALLIDA", 500)
      }

      setTimeout(() => unlink(tmpFile).catch(() => {}), 30_000)

      return ok({ enviado: true, cantidad: input.cantidad, impresora })
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
