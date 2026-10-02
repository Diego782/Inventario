"use client"

import { useEffect, useState } from "react"
import { useForm, useFieldArray } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { toast } from "sonner"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { crearProductoSchema, editarProductoSchema } from "@/lib/schemas/producto"
import type { ProductoDTO } from "@/lib/api/serializadores"
import { toastDeError } from "@/lib/mensajes-error"
import { GestionarCategoriasDialog } from "@/components/inventario/gestionar-categorias-dialog"
import { GestionarUnidadesDialog } from "@/components/inventario/gestionar-unidades-dialog"
import { GestionarTallasDialog } from "@/components/inventario/gestionar-tallas-dialog"
import { CircleHelp, Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { z } from "zod"

type CrearInput = z.infer<typeof crearProductoSchema>
type EditarInput = z.infer<typeof editarProductoSchema>
type FormInput = CrearInput & Pick<EditarInput, "precios_variantes" | "minimos_variantes">

interface ProductoFormDialogProps {
  open: boolean
  modo: "crear" | "editar"
  producto?: ProductoDTO
  onClose: () => void
  onGuardado: () => void
}

type Categoria = { id: string; nombre: string }

export function ProductoFormDialog({
  open,
  modo,
  producto,
  onClose,
  onGuardado,
}: ProductoFormDialogProps) {
  const [categorias, setCategorias] = useState<Categoria[]>([])
  const [unidades, setUnidades] = useState<string[]>([])
  const [tallas, setTallas] = useState<string[]>([])
  const [guardando, setGuardando] = useState(false)
  const [gestionarCategorias, setGestionarCategorias] = useState(false)
  const [gestionarUnidades, setGestionarUnidades] = useState(false)
  const [gestionarTallas, setGestionarTallas] = useState(false)
  // Tallas seleccionadas para el stock por talla (solo en modo crear)
  const [tallasSeleccionadas, setTallasSeleccionadas] = useState<string[]>([])

  const schema = modo === "crear" ? crearProductoSchema : editarProductoSchema
  const form = useForm<FormInput>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      nombre: "",
      codigo_barras: "",
      categoria_id: undefined,
      precio_compra: 0,
      precio_venta: 0,
      precio_por_variante: false,
      stock_actual: 0,
      stock_minimo: 0,
      unidad: "unidad",
      talla: null,
      variantes_stock: [],
      precios_variantes: [],
      minimos_variantes: [],
    },
  })
  const { reset } = form

  // useFieldArray para manejar el stock por talla dinámicamente
  const { fields: variantesFields, replace: replaceVariantes } = useFieldArray({
    control: form.control,
    name: "variantes_stock" as any,
  })

  // Sincroniza variantes_stock cuando cambian las tallas seleccionadas
  useEffect(() => {
    if (modo !== "crear") return
    const nuevasVariantes = tallasSeleccionadas.map((t) => {
      // Preservar el stock ya ingresado si la talla estaba antes
      const existente = form.getValues("variantes_stock")?.find((v: any) => v.talla === t)
      return { talla: t, stock: existente?.stock ?? 0, stock_minimo: existente?.stock_minimo ?? 0, precio_compra: existente?.precio_compra ?? null, precio_venta: existente?.precio_venta ?? null }
    })
    replaceVariantes(nuevasVariantes as any)
    // Si hay tallas seleccionadas, limpiar el campo talla simple
    if (tallasSeleccionadas.length > 0) {
      form.setValue("talla", null)
    } else {
      form.setValue("precio_por_variante", false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tallasSeleccionadas, modo])

  // Precargar valores en modo editar
  useEffect(() => {
    if (modo === "editar" && producto) {
      reset({
        nombre: producto.nombre,
        codigo_barras: producto.codigo_barras ?? "",
        categoria_id: producto.categoria_id ?? undefined,
        precio_compra: producto.precio_compra,
        precio_venta: producto.precio_venta,
        precio_por_variante: producto.precio_por_variante ?? false,
        precios_variantes: producto.variantes.map((v) => ({
          variante_id: v.id,
          precio_compra: v.precio_compra ?? producto.precio_compra,
          precio_venta: v.precio_venta ?? producto.precio_venta,
        })),
        minimos_variantes: producto.variantes.map((v) => ({
          variante_id: v.id,
          stock_minimo: v.stock_minimo,
        })),
        stock_minimo: producto.stock_minimo,
        unidad: producto.unidad,
        talla: producto.talla ?? null,
      })
    } else if (modo === "crear") {
      setTallasSeleccionadas([])
      reset({
        nombre: "",
        codigo_barras: "",
        categoria_id: undefined,
        precio_compra: 0,
        precio_venta: 0,
        precio_por_variante: false,
        stock_actual: 0,
        stock_minimo: 0,
        unidad: "unidad",
        talla: null,
        variantes_stock: [],
        precios_variantes: [],
        minimos_variantes: [],
      })
    }
  }, [modo, producto, reset, open])

  // Cargar categorías
  function cargarCategorias() {
    fetch("/api/categorias")
      .then((r) => r.json())
      .then((data) => setCategorias(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  // Cargar unidades
  function cargarUnidades() {
    fetch("/api/unidades")
      .then((r) => r.json())
      .then((data) => setUnidades(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  // Cargar tallas
  function cargarTallas() {
    fetch("/api/tallas")
      .then((r) => r.json())
      .then((data) => setTallas(Array.isArray(data) ? data : []))
      .catch(() => {})
  }

  useEffect(() => {
    if (!open) return
    cargarCategorias()
    cargarUnidades()
    cargarTallas()
  }, [open])

  // Togglear una talla en la selección
  function toggleTalla(talla: string) {
    setTallasSeleccionadas((prev) =>
      prev.includes(talla) ? prev.filter((t) => t !== talla) : [...prev, talla]
    )
  }

  async function onSubmit(values: FormInput) {
    setGuardando(true)
    try {
      const url = modo === "crear" ? "/api/productos" : `/api/productos/${producto?.id}`
      const method = modo === "crear" ? "POST" : "PATCH"

      // Si no hay variantes seleccionadas, no enviar el campo
      const payload = { ...values }
      if (modo === "crear" && payload.precio_por_variante) {
        payload.precio_compra = Math.min(...(payload.variantes_stock ?? []).map((v) => v.precio_compra ?? Infinity))
        payload.precio_venta = Math.min(...(payload.variantes_stock ?? []).map((v) => v.precio_venta ?? Infinity))
      }
      if (modo === "crear") delete payload.precios_variantes
      if (modo === "crear") delete payload.minimos_variantes
      if (modo === "editar") delete payload.variantes_stock
      if (!payload.precio_por_variante) delete payload.precios_variantes
      if (!payload.variantes_stock || payload.variantes_stock.length === 0) {
        delete (payload as any).variantes_stock
      }

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })

      const data = await res.json()

      if (!res.ok) {
        const codigo = data?.error?.codigo ?? "DESCONOCIDO"
        if (res.status === 422 && data?.error?.detalles?.errores) {
          for (const err of data.error.detalles.errores) {
            form.setError(err.campo as any, { message: err.mensaje })
          }
          return
        }
        toast.error(toastDeError(codigo))
        return
      }

      toast.success(modo === "crear" ? "Producto creado" : "Producto actualizado")
      onGuardado()
    } catch {
      toast.error(toastDeError("RED"))
    } finally {
      setGuardando(false)
    }
  }

  const usandoVariantes = modo === "crear" && tallasSeleccionadas.length > 0
  const tieneVariantes = usandoVariantes || (modo === "editar" && (producto?.variantes.length ?? 0) > 0)
  const precioPorVariante = !!form.watch("precio_por_variante") && tieneVariantes

  function cambiarModoPrecio(activado: boolean) {
    const compraComun = form.getValues("precio_compra") ?? 0
    const precioComun = form.getValues("precio_venta") ?? 0
    if (activado) {
      if (modo === "crear") {
        form.getValues("variantes_stock")?.forEach((variante, index) => {
          form.setValue(`variantes_stock.${index}.precio_compra`, variante.precio_compra ?? compraComun)
          form.setValue(`variantes_stock.${index}.precio_venta`, variante.precio_venta ?? precioComun)
        })
      } else {
        const preciosActuales = form.getValues("precios_variantes") ?? []
        form.setValue("precios_variantes", producto?.variantes.map((variante) => ({
          variante_id: variante.id,
          precio_compra: preciosActuales.find((p) => p.variante_id === variante.id)?.precio_compra ?? variante.precio_compra ?? compraComun,
          precio_venta: preciosActuales.find((p) => p.variante_id === variante.id)?.precio_venta ?? variante.precio_venta ?? precioComun,
        })) ?? [])
      }
    } else {
      const preciosCompra = modo === "crear"
        ? form.getValues("variantes_stock")?.map((v) => v.precio_compra).filter((v): v is number => v != null)
        : form.getValues("precios_variantes")?.map((v) => v.precio_compra).filter((v): v is number => v != null)
      const preciosVenta = modo === "crear"
        ? form.getValues("variantes_stock")?.map((v) => v.precio_venta).filter((v): v is number => v != null)
        : form.getValues("precios_variantes")?.map((v) => v.precio_venta)
      if (preciosCompra?.length) form.setValue("precio_compra", Math.min(...preciosCompra))
      if (preciosVenta?.length) form.setValue("precio_venta", Math.min(...preciosVenta))
    }
    form.setValue("precio_por_variante", activado)
  }

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {modo === "crear" ? "Nuevo Producto" : "Editar Producto"}
          </DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="nombre"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Nombre *</FormLabel>
                    <FormControl>
                      <Input placeholder="Nombre del producto" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="codigo_barras"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código de Barras</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Dejar vacío para generar automáticamente"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="categoria_id"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel>Categoría</FormLabel>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-full"
                        onClick={() => setGestionarCategorias(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? ""}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar categoría" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {categorias.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id}>
                            {cat.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unidad"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center gap-1">
                      <FormLabel>Unidad</FormLabel>
                      <Button
                        type="button"
                        size="icon"
                        variant="ghost"
                        className="h-5 w-5 rounded-full"
                        onClick={() => setGestionarUnidades(true)}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value ?? "unidad"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Seleccionar unidad" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {unidades.map((u) => (
                          <SelectItem key={u} value={u}>
                            {u}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Selector de tallas — en modo crear usa toggles múltiples; en editar usa select simple */}
              {modo === "crear" ? (
                <FormItem className="col-span-2">
                  <div className="flex items-center gap-1">
                    <FormLabel>Variantes</FormLabel>
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      className="h-5 w-5 rounded-full"
                      onClick={() => setGestionarTallas(true)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {tallas.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      No hay variantes configuradas.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setGestionarTallas(true)}
                      >
                        Agregar variantes
                      </button>
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {tallas.map((t) => {
                        const activa = tallasSeleccionadas.includes(t)
                        return (
                          <button
                            key={t}
                            type="button"
                            onClick={() => toggleTalla(t)}
                            className={cn(
                              "px-3 py-1 rounded-md border text-sm font-medium transition-colors",
                              activa
                                ? "bg-primary text-primary-foreground border-primary"
                                : "bg-background text-foreground border-border hover:bg-accent"
                            )}
                          >
                            {t}
                          </button>
                        )
                      })}
                    </div>
                  )}
                  {tallasSeleccionadas.length > 0 && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {tallasSeleccionadas.length} variante{tallasSeleccionadas.length > 1 ? "s" : ""} seleccionada{tallasSeleccionadas.length > 1 ? "s" : ""}. Ingresa el stock inicial para cada una.
                    </p>
                  )}
                </FormItem>
              ) : (producto?.variantes.length ?? 0) === 0 ? (
                <FormField
                  control={form.control}
                  name="talla"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1">
                        <FormLabel>Variante</FormLabel>
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          className="h-5 w-5 rounded-full"
                          onClick={() => setGestionarTallas(true)}
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                      <Select
                        onValueChange={(v) => field.onChange(v === "__none__" ? null : v)}
                        value={field.value ?? "__none__"}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Sin variante" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Sin variante</SelectItem>
                          {tallas.map((t) => (
                            <SelectItem key={t} value={t}>
                              {t}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              ) : null}

              {tieneVariantes && (
                <div className="col-span-2 flex items-center gap-2 rounded-md border p-3">
                  <Switch
                    id="precio-por-variante"
                    checked={precioPorVariante}
                    onCheckedChange={cambiarModoPrecio}
                    aria-label="Precios por variante"
                  />
                  <label htmlFor="precio-por-variante" className="text-sm font-medium cursor-pointer">
                    Precios por variante
                  </label>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label="Ayuda sobre precios por variante" className="text-muted-foreground">
                        <CircleHelp className="size-4" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-60">
                      Actívalo para asignar precios de compra y venta a cada variante. Si está apagado, todas usan los precios del producto.
                    </TooltipContent>
                  </Tooltip>
                </div>
              )}

              {!precioPorVariante && <FormField
                control={form.control}
                name="precio_compra"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio Compra</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />}

              {!precioPorVariante && <FormField
                control={form.control}
                name="precio_venta"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Precio Venta *</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />}

              {tieneVariantes && (
                <section className="col-span-2 space-y-3" aria-label="Detalles por variante">
                  <div>
                    <h3 className="text-sm font-semibold">Detalles por variante</h3>
                    <p className="text-xs text-muted-foreground">
                      {precioPorVariante
                        ? "Configura compra, venta y stock de cada variante."
                        : "Configura el stock de cada variante."}
                    </p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {modo === "crear" ? variantesFields.map((variante, index) => (
                      <div key={variante.id} className="space-y-3 rounded-xl border bg-muted/20 p-4">
                        <Badge variant="secondary">{form.getValues("variantes_stock")?.[index]?.talla}</Badge>
                        {precioPorVariante && (
                          <div className="grid grid-cols-2 gap-3">
                            {(["precio_compra", "precio_venta"] as const).map((campo) => (
                              <FormField key={campo} control={form.control} name={`variantes_stock.${index}.${campo}`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>{campo === "precio_compra" ? "Compra *" : "Venta *"}</FormLabel>
                                    <FormControl>
                                      <Input type="number" step="0.01" min="0" value={field.value ?? ""}
                                        onChange={(e) => field.onChange(e.target.value === "" ? null : Number(e.target.value))} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )} />
                            ))}
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          {(["stock", "stock_minimo"] as const).map((campo) => (
                            <FormField key={campo} control={form.control} name={`variantes_stock.${index}.${campo}`}
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel>{campo === "stock" ? "Stock inicial" : "Stock mínimo"}</FormLabel>
                                  <FormControl>
                                    <Input type="number" min="0" value={field.value ?? 0}
                                      onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )} />
                          ))}
                        </div>
                      </div>
                    )) : producto?.variantes.map((variante, index) => (
                      <div key={variante.id} className="space-y-3 rounded-xl border bg-muted/20 p-4">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary">{variante.talla}</Badge>
                          <span className="text-xs text-muted-foreground">Stock actual: {variante.stock_actual}</span>
                        </div>
                        {precioPorVariante && (
                          <div className="grid grid-cols-2 gap-3">
                            {(["precio_compra", "precio_venta"] as const).map((campo) => (
                              <FormField key={campo} control={form.control} name={`precios_variantes.${index}.${campo}`}
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel>{campo === "precio_compra" ? "Compra *" : "Venta *"}</FormLabel>
                                    <FormControl>
                                      <Input type="number" step="0.01" min="0" value={field.value ?? ""}
                                        onChange={(e) => field.onChange(e.target.value === "" ? undefined : Number(e.target.value))} />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )} />
                            ))}
                          </div>
                        )}
                        <FormField control={form.control} name={`minimos_variantes.${index}.stock_minimo`}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Stock mínimo</FormLabel>
                              <FormControl>
                                <Input type="number" min="0" value={field.value ?? 0}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )} />
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {modo === "crear" && !usandoVariantes && (
                <FormField control={form.control} name="stock_actual" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Inicial</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}

              {!tieneVariantes && (
                <FormField control={form.control} name="stock_minimo" render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Mínimo</FormLabel>
                    <FormControl>
                      <Input type="number" min="0" {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={onClose} disabled={guardando}>
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando..." : modo === "crear" ? "Crear Producto" : "Guardar Cambios"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    <GestionarCategoriasDialog
      open={gestionarCategorias}
      onClose={() => setGestionarCategorias(false)}
      onCambio={cargarCategorias}
    />

    <GestionarUnidadesDialog
      open={gestionarUnidades}
      onClose={() => setGestionarUnidades(false)}
      onCambio={cargarUnidades}
    />

    <GestionarTallasDialog
      open={gestionarTallas}
      onClose={() => setGestionarTallas(false)}
      onCambio={cargarTallas}
    />
    </>
  )
}
