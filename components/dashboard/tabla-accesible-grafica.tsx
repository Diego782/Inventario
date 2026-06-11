"use client"

import * as React from "react"

import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { cn } from "@/lib/utils"

/**
 * Alternativa textual/tabla accesible para cada gráfica del dashboard (R13.7).
 *
 * Expone los mismos valores de datos representados en la gráfica en forma de
 * tabla HTML semántica, navegable por teclado (Tab) y lectores de pantalla.
 *
 * Se puede usar de dos formas:
 *   1. **Siempre visible** – omitir `visiblementOculta` o pasarla como `false`.
 *      Útil cuando la tabla aparece junto a la gráfica en un acordeón/toggle.
 *   2. **Solo para lectores de pantalla** – pasar `visiblementOculta={true}`.
 *      La tabla es leída por AT pero no ocupa espacio visual (clase `sr-only`).
 *
 * Props:
 *   - `titulo`   Nombre de la gráfica (se usa como `<caption>` y `aria-label`).
 *   - `columnas` Encabezados de columna.
 *   - `filas`    Filas de datos como `string[][]`.  Cada `filas[i]` debe tener
 *                la misma longitud que `columnas`.
 *   - `visiblementOculta` (default `false`) Aplica `sr-only` para ocultar
 *                visualmente la tabla sin retirarla del árbol de accesibilidad.
 *   - `className` Clases adicionales para el contenedor.
 */
export type TablaAccesibleGraficaProps = {
  /** Nombre de la gráfica representada (usado como caption y aria-label). */
  titulo: string
  /** Encabezados de columna en el mismo orden que cada fila. */
  columnas: string[]
  /**
   * Filas de datos. Cada elemento es un array de strings con la misma longitud
   * que `columnas`. El orden de filas debe coincidir con el de la gráfica.
   */
  filas: string[][]
  /**
   * Cuando `true`, aplica `sr-only` para ocultar visualmente la tabla sin
   * retirarla del árbol de accesibilidad (default: `false`).
   */
  visiblementOculta?: boolean
  className?: string
}

export function TablaAccesibleGrafica({
  titulo,
  columnas,
  filas,
  visiblementOculta = false,
  className,
}: TablaAccesibleGraficaProps) {
  return (
    <div
      role="region"
      aria-label={`Datos tabulares: ${titulo}`}
      className={cn(visiblementOculta ? "sr-only" : undefined, className)}
    >
      <Table>
        <TableCaption className={visiblementOculta ? undefined : "sr-only"}>
          {titulo}
        </TableCaption>
        <TableHeader>
          <TableRow>
            {columnas.map((encabezado, idx) => (
              <TableHead
                key={`col-${idx}`}
                scope="col"
              >
                {encabezado}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={columnas.length}
                className="text-center text-muted-foreground"
              >
                Sin datos
              </TableCell>
            </TableRow>
          ) : (
            filas.map((fila, filaIdx) => (
              <TableRow
                key={`fila-${filaIdx}`}
                tabIndex={0}
              >
                {fila.map((celda, celdaIdx) => (
                  <TableCell key={`celda-${filaIdx}-${celdaIdx}`}>
                    {celda}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default TablaAccesibleGrafica
