"use client"

import { useEffect, useState } from "react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import type { ProductoDTO } from "@/lib/api/serializadores"

type Lote = { id: string; variante_id: string | null; variante: string | null; fecha_vencimiento: string; cantidad_inicial: number; stock_actual: number }
type Datos = { lotes: Lote[]; sin_fecha: { variante_id: string | null; variante: string | null; cantidad: number }[] }

export function LotesEditor({ producto, onCambio }: { producto: ProductoDTO; onCambio: () => void }) {
  const [datos, setDatos] = useState<Datos | null>(null)
  const [modo, setModo] = useState<"entrada" | "asignar">("entrada")
  const [varianteId, setVarianteId] = useState(producto.variantes[0]?.id ?? "__producto__")
  const [fecha, setFecha] = useState("")
  const [cantidad, setCantidad] = useState(1)
  const [fechasEditadas, setFechasEditadas] = useState<Record<string, string>>({})
  const [guardando, setGuardando] = useState(false)

  async function cargar() {
    const respuesta = await fetch(`/api/productos/${producto.id}/lotes`)
    if (!respuesta.ok) throw new Error("No se pudieron cargar los lotes.")
    const nuevos = await respuesta.json() as Datos
    setDatos(nuevos)
    setFechasEditadas(Object.fromEntries(nuevos.lotes.map((lote) => [lote.id, lote.fecha_vencimiento])))
  }

  useEffect(() => {
    setDatos(null)
    setVarianteId(producto.variantes[0]?.id ?? "__producto__")
    void cargar().catch(() => toast.error("No se pudieron cargar los lotes."))
  }, [producto.id])

  async function enviar(method: "POST" | "PATCH" | "DELETE", body: object) {
    setGuardando(true)
    try {
      const respuesta = await fetch(`/api/productos/${producto.id}/lotes`, {
        method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
      })
      if (!respuesta.ok) {
        const error = await respuesta.json().catch(() => null)
        throw new Error(error?.error?.mensaje ?? "No se pudo guardar el lote.")
      }
      await cargar()
      onCambio()
      toast.success(method === "DELETE" ? "Lote descartado" : "Lote guardado")
      if (method === "POST") { setFecha(""); setCantidad(1) }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error de conexión")
    } finally { setGuardando(false) }
  }

  const hoy = new Date().toISOString().slice(0, 10)
  const limite = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10)
  const sinFecha = datos?.sin_fecha.find((fila) => (fila.variante_id ?? "__producto__") === varianteId)?.cantidad ?? 0

  return <div className="space-y-4">
    <div className="rounded-lg border bg-muted/20 p-3">
      <p className="text-sm font-semibold">Stock sin fecha asignada</p>
      <p className="mt-1 text-xs text-muted-foreground">
        {datos?.sin_fecha.map((fila) => `${fila.variante ?? "Producto"}: ${fila.cantidad}`).join(" · ") ?? "Cargando..."}
      </p>
    </div>
    <div className="space-y-3 rounded-lg border p-3">
      <p className="text-sm font-semibold">Registrar lote</p>
      <Select value={modo} onValueChange={(valor) => setModo(valor as "entrada" | "asignar")}>
        <SelectTrigger aria-label="Tipo de registro"><SelectValue /></SelectTrigger>
        <SelectContent>
          <SelectItem value="entrada">Nueva entrada de stock</SelectItem>
          <SelectItem value="asignar">Asignar fecha a stock existente</SelectItem>
        </SelectContent>
      </Select>
      {producto.variantes.length > 0 && <Select value={varianteId} onValueChange={setVarianteId}>
        <SelectTrigger aria-label="Variante del lote"><SelectValue placeholder="Variante" /></SelectTrigger>
        <SelectContent>{producto.variantes.map((variante) => <SelectItem key={variante.id} value={variante.id}>{variante.talla}</SelectItem>)}</SelectContent>
      </Select>}
      <div className="grid grid-cols-2 gap-3">
        <label className="space-y-1 text-xs font-medium"><span>Fecha de vencimiento</span>
          <Input type="date" value={fecha} onChange={(evento) => setFecha(evento.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium"><span>Cantidad</span>
          <Input type="number" min="1" max={modo === "asignar" ? sinFecha : undefined} value={cantidad}
            onChange={(evento) => setCantidad(Number(evento.target.value))} />
        </label>
      </div>
      <Button type="button" disabled={guardando || !fecha || !Number.isInteger(cantidad) || cantidad <= 0 || (modo === "asignar" && cantidad > sinFecha)}
        onClick={() => void enviar("POST", { modo, variante_id: varianteId === "__producto__" ? null : varianteId, fecha_vencimiento: fecha, cantidad })}>
        {modo === "entrada" ? "Guardar entrada" : "Asignar fecha"}
      </Button>
    </div>
    <div className="space-y-2">
      <p className="text-sm font-semibold">Lotes con stock</p>
      {datos?.lotes.filter((lote) => lote.stock_actual > 0).map((lote) => {
        const estado = lote.fecha_vencimiento < hoy ? "Vencido" : lote.fecha_vencimiento <= limite ? "Próximo a vencer" : "Vigente"
        return <div key={lote.id} className="space-y-2 rounded-lg border p-3">
          <div className="flex justify-between gap-2 text-sm">
            <span className="font-medium">{lote.variante ?? "Producto"} · {lote.stock_actual} unidades</span>
            <span className={estado === "Vigente" ? "text-muted-foreground" : "font-semibold text-destructive"}>{estado}</span>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="space-y-1 text-xs font-medium"><span>Vence el</span>
              <Input type="date" value={fechasEditadas[lote.id] ?? lote.fecha_vencimiento}
                onChange={(evento) => setFechasEditadas((actual) => ({ ...actual, [lote.id]: evento.target.value }))} />
            </label>
            <Button type="button" size="sm" variant="outline" disabled={guardando || !fechasEditadas[lote.id] || fechasEditadas[lote.id] === lote.fecha_vencimiento}
              onClick={() => void enviar("PATCH", { lote_id: lote.id, fecha_vencimiento: fechasEditadas[lote.id] })}>Guardar fecha</Button>
            <Button type="button" size="sm" variant="destructive" disabled={guardando}
              onClick={() => { if (confirm(`¿Descartar las ${lote.stock_actual} unidades de este lote?`)) void enviar("DELETE", { lote_id: lote.id }) }}>Descartar stock</Button>
          </div>
        </div>
      })}
      {datos && !datos.lotes.some((lote) => lote.stock_actual > 0) && <p className="text-xs text-muted-foreground">Aún no hay lotes con stock.</p>}
    </div>
  </div>
}
