"use client"

import { useEffect, useMemo, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import type { FlujoProducto } from "@/lib/dominio/flujos-producto"

const POR_PAGINA = 20
const dinero = new Intl.NumberFormat("es-CO", { style: "currency", currency: "COP", maximumFractionDigits: 0 })

function TablaFlujo({ filas, tipo }: { filas: FlujoProducto[]; tipo: "entradas" | "ventas" }) {
  const [busqueda, setBusqueda] = useState("")
  const [pagina, setPagina] = useState(0)
  const filtradas = useMemo(() => filas
    .filter((fila) => fila.nombre.toLocaleLowerCase().includes(busqueda.trim().toLocaleLowerCase()))
    .sort((a, b) => {
      const aCantidad = tipo === "entradas" ? a.unidadesEntrada : a.unidadesVendidas
      const bCantidad = tipo === "entradas" ? b.unidadesEntrada : b.unidadesVendidas
      return bCantidad - aCantidad || a.nombre.localeCompare(b.nombre, "es") || a.producto_id.localeCompare(b.producto_id)
    }), [filas, busqueda, tipo])
  const totalPaginas = Math.max(1, Math.ceil(filtradas.length / POR_PAGINA))
  const paginaActual = Math.min(pagina, totalPaginas - 1)
  const visibles = filtradas.slice(paginaActual * POR_PAGINA, (paginaActual + 1) * POR_PAGINA)

  return <Card>
    <CardHeader>
      <CardTitle>{tipo === "entradas" ? "Entradas de productos" : "Ventas y rotación"}</CardTitle>
      <CardDescription>
        {tipo === "entradas"
          ? "Todas las entradas de stock registradas en el período, incluyendo productos sin entradas."
          : "Todos los productos. La rotación cuenta las unidades que salieron del inventario en el período."}
      </CardDescription>
      <Input aria-label={`Buscar producto en ${tipo}`} placeholder="Buscar producto..." value={busqueda}
        onChange={(evento) => { setBusqueda(evento.target.value); setPagina(0) }} />
    </CardHeader>
    <CardContent className="space-y-3">
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Producto</TableHead>
            {tipo === "entradas" ? <><TableHead className="text-right">Unidades</TableHead><TableHead className="text-right">Entradas</TableHead></>
              : <><TableHead className="text-right">Vendidas</TableHead><TableHead className="text-right">Rotación</TableHead><TableHead className="text-right">Ingresos</TableHead></>}
            <TableHead className="text-right">Stock actual</TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {visibles.map((fila) => <TableRow key={fila.producto_id}>
              <TableCell className="font-medium">{fila.nombre}{!fila.activo && <span className="ml-2 text-xs text-muted-foreground">Inactivo</span>}</TableCell>
              {tipo === "entradas" ? <>
                <TableCell className="text-right tabular-nums">{fila.unidadesEntrada.toLocaleString("es-CO")}</TableCell>
                <TableCell className="text-right tabular-nums">{fila.operacionesEntrada.toLocaleString("es-CO")}</TableCell>
              </> : <>
                <TableCell className="text-right tabular-nums">{fila.unidadesVendidas.toLocaleString("es-CO")}</TableCell>
                <TableCell className="text-right tabular-nums">{fila.unidadesSalida.toLocaleString("es-CO")}</TableCell>
                <TableCell className="text-right tabular-nums">{dinero.format(fila.montoVendido)}</TableCell>
              </>}
              <TableCell className="text-right tabular-nums">{fila.stock_actual.toLocaleString("es-CO")} {fila.unidad}</TableCell>
            </TableRow>)}
            {!visibles.length && <TableRow><TableCell colSpan={tipo === "entradas" ? 4 : 5} className="text-center text-muted-foreground">Sin productos para mostrar</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between gap-2 text-sm text-muted-foreground">
        <span>{filtradas.length} productos · página {paginaActual + 1} de {totalPaginas}</span>
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" disabled={paginaActual === 0} onClick={() => setPagina(paginaActual - 1)}>Anterior</Button>
          <Button type="button" variant="outline" size="sm" disabled={paginaActual >= totalPaginas - 1} onClick={() => setPagina(paginaActual + 1)}>Siguiente</Button>
        </div>
      </div>
    </CardContent>
  </Card>
}

export function TablasFlujoProductos({ desde, hasta }: { desde: string; hasta: string }) {
  const [filas, setFilas] = useState<FlujoProducto[] | null>(null)
  const [error, setError] = useState(false)
  useEffect(() => {
    const controlador = new AbortController()
    setFilas(null)
    setError(false)
    fetch(`/api/dashboard/flujos?${new URLSearchParams({ desde, hasta })}`, { signal: controlador.signal })
      .then((respuesta) => { if (!respuesta.ok) throw new Error("No se pudieron cargar los movimientos"); return respuesta.json() })
      .then((datos) => { if (!controlador.signal.aborted) setFilas(Array.isArray(datos) ? datos : []) })
      .catch(() => { if (!controlador.signal.aborted) setError(true) })
    return () => controlador.abort()
  }, [desde, hasta])

  if (error) return <p role="alert" className="text-sm text-destructive">No se pudieron cargar las tablas de productos.</p>
  if (!filas) return <p className="text-sm text-muted-foreground">Cargando movimientos de productos...</p>
  return <div className="grid gap-6">
    <TablaFlujo filas={filas} tipo="entradas" />
    <TablaFlujo filas={filas} tipo="ventas" />
  </div>
}
