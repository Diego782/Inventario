"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
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
import { crearProductoSchema, editarProductoSchema } from "@/lib/schemas/producto"
import type { ProductoDTO } from "@/lib/api/serializadores"
import { toastDeError } from "@/lib/mensajes-error"
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
  const [guardando, setGuardando] = useState(false)

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
    },
  })

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
      })
    } else if (modo === "crear") {
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
      })
    }
  }, [modo, producto, form, open])

  // Cargar categorías
  useEffect(() => {
    if (!open) return
    fetch("/api/categorias")
      .then((r) => r.json())
      .then((data) => setCategorias(Array.isArray(data) ? data : []))
      .catch(() => {})
  }, [open])

  async function onSubmit(values: CrearInput) {
    setGuardando(true)
    try {
      const url = modo === "crear" ? "/api/productos" : `/api/productos/${producto?.id}`
      const method = modo === "crear" ? "POST" : "PATCH"

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
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

  return (
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
                    <FormLabel>Categoría</FormLabel>
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
                    <FormLabel>Unidad</FormLabel>
                    <FormControl>
                      <Input placeholder="unidad" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

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

              {modo === "crear" && (
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
  )
}
