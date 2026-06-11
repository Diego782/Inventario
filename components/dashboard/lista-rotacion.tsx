"use client"

import * as React from "react"

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { RankingItemRotacion } from "@/lib/api/serializadores"

/**
 * Listas/tablas de rotación: `topRotation` (desc por unidades de salida) y
 * `lowRotation` (asc, incluye ceros), máx 10 cada una (R5.6, R5.7).
 * Usa primitivas shadcn `Card`, `Table` y `Badge`. Sin colores hex.
 */

const MAX_ITEMS = 10

export type ListaRotacionProps = {
  topRotation: RankingItemRotacion[]
  lowRotation: RankingItemRotacion[]
  className?: string
}

function TablaRotacion({
  items,
  vacioMensaje,
}: {
  items: RankingItemRotacion[]
  vacioMensaje: string
}) {
  if (!items.length) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {vacioMensaje}
      </p>
    )
  }
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">#</TableHead>
          <TableHead>Producto</TableHead>
          <TableHead className="text-right">Unidades</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {items.map((item, indice) => (
          <TableRow key={item.producto_id}>
            <TableCell className="text-muted-foreground">
              {indice + 1}
            </TableCell>
            <TableCell className="font-medium">{item.nombre}</TableCell>
            <TableCell className="text-right">
              <Badge variant="secondary" className="tabular-nums">
                {item.unidadesSalida.toLocaleString("es-MX")}
              </Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

export function ListaRotacion({
  topRotation,
  lowRotation,
  className,
}: ListaRotacionProps) {
  // Mayor rotación: desc por salida, máx 10 (R5.6).
  const mayor = React.useMemo(
    () =>
      [...topRotation]
        .sort((a, b) => b.unidadesSalida - a.unidadesSalida)
        .slice(0, MAX_ITEMS),
    [topRotation],
  )

  // Menor rotación: asc por salida (incluye ceros), máx 10 (R5.7).
  const menor = React.useMemo(
    () =>
      [...lowRotation]
        .sort((a, b) => a.unidadesSalida - b.unidadesSalida)
        .slice(0, MAX_ITEMS),
    [lowRotation],
  )

  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>
      <Card>
        <CardHeader>
          <CardTitle>Mayor rotación</CardTitle>
          <CardDescription>
            Productos con más unidades de salida (máx. 10)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TablaRotacion
            items={mayor}
            vacioMensaje="Sin movimientos de salida en el período"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Menor rotación</CardTitle>
          <CardDescription>
            Productos con menos unidades de salida (máx. 10)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TablaRotacion
            items={menor}
            vacioMensaje="Sin productos para mostrar"
          />
        </CardContent>
      </Card>
    </div>
  )
}

export default ListaRotacion
