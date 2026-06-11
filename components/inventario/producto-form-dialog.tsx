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
import { crearProductoSchema, editarProductoSchema } from "@/lib/schemas/producto"
import type { ProductoDTO } from "@/lib/api/serializadores"
import { toastDeError } from "@/lib/mensajes-error"
import { GestionarCategoriasDialog } from "@/components/inventario/gestionar-categorias-dialog"
import { GestionarUnidadesDialog } from "@/components/inventario/gestionar-unidades-dialog"
import { GestionarTallasDialog } from "@/components/inventario/gestionar-tallas-dialog"
import { Plus, X } from "lucide-react"
import { cn } from "@/lib/utils"
import type { z } from "zod"

type CrearInput = z.infer<typeof crearProductoSchema>
type EditarInput = z.infer<typeof editarProductoSchema>

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
  const form = useForm<CrearInput>({
    resolver: zodResolver(schema as any),
    defaultValues: {
      nombre: "",
      sku: "",
      codigo_barras: "",
      categoria_id: undefined,
      precio_compra: 0,
      precio_venta: 0,
      stock_actual: 0,
      stock_minimo: 0,
      unidad: "unidad",
      talla: null,
      variantes_stock: [],
    },
  })

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
      return { talla: t, stock: existente?.stock ?? 0 }
    })
    replaceVariantes(nuevasVariantes as any)
    // Si hay tallas seleccionadas, limpiar el campo talla simple
    if (tallasSeleccionadas.length > 0) {
      form.setValue("talla", null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tallasSeleccionadas, modo])

  // Precargar valores en modo editar
  useEffect(() => {
    if (modo === "editar" && producto) {
      form.reset({
        nombre: producto.nombre,
        sku: producto.sku,
        codigo_barras: producto.codigo_barras ?? "",
        categoria_id: producto.categoria_id ?? undefined,
        precio_compra: producto.precio_compra,
        precio_venta: producto.precio_venta,
        stock_minimo: producto.stock_minimo,
        unidad: producto.unidad,
        talla: producto.talla ?? null,
      })
    } else if (modo === "crear") {
      setTallasSeleccionadas([])
      form.reset({
        nombre: "",
        sku: "",
        codigo_barras: "",
        categoria_id: undefined,
        precio_compra: 0,
        precio_venta: 0,
        stock_actual: 0,
        stock_minimo: 0,
        unidad: "unidad",
        talla: null,
        variantes_stock: [],
      })
    }
  }, [modo, producto, form, open])

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

  async function onSubmit(values: CrearInput) {
    setGuardando(true)
    try {
      const url = modo === "crear" ? "/api/productos" : `/api/productos/${producto?.id}`
      const method = modo === "crear" ? "POST" : "PATCH"

      // Si no hay variantes seleccionadas, no enviar el campo
      const payload = { ...values }
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

  return (
    <>
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
                name="sku"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>SKU *</FormLabel>
                    <FormControl>
                      <Input placeholder="SKU-001" {...field} />
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
                    <FormLabel>Tallas</FormLabel>
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
                      No hay tallas configuradas.{" "}
                      <button
                        type="button"
                        className="underline"
                        onClick={() => setGestionarTallas(true)}
                      >
                        Agregar tallas
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
                      {tallasSeleccionadas.length} talla{tallasSeleccionadas.length > 1 ? "s" : ""} seleccionada{tallasSeleccionadas.length > 1 ? "s" : ""}. Ingresa el stock inicial para cada una.
                    </p>
                  )}
                </FormItem>
              ) : (
                <FormField
                  control={form.control}
                  name="talla"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center gap-1">
                        <FormLabel>Talla</FormLabel>
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
                            <SelectValue placeholder="Sin talla" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="__none__">Sin talla</SelectItem>
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
              )}

              <FormField
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
              />

              <FormField
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
              />

              {/* Stock Inicial — simple si no hay tallas, por talla si las hay */}
              {modo === "crear" && (
                usandoVariantes ? (
                  <div className="col-span-2 space-y-3">
                    <FormLabel>Stock Inicial por Talla</FormLabel>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {variantesFields.map((variante, index) => (
                        <FormField
                          key={variante.id}
                          control={form.control}
                          name={`variantes_stock.${index}.stock` as any}
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel className="text-sm font-normal">
                                <Badge variant="outline" className="mr-1">
                                  {(variantesFields[index] as any).talla}
                                </Badge>
                              </FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  {...field}
                                  onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      ))}
                    </div>
                  </div>
                ) : (
                  <FormField
                    control={form.control}
                    name="stock_actual"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Stock Inicial</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            {...field}
                            onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              )}

              <FormField
                control={form.control}
                name="stock_minimo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Stock Mínimo</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min="0"
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
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


