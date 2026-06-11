"use client"

/**
 * components/horarios/asignar-horario-dialog.tsx
 * Diálogo para asignar un horario a una membresía.
 * Captura: membresía, día, tipo, hora_inicio, hora_fin.
 * Llama POST /api/organizaciones/{id}/horarios.
 *
 * Validates: Requirements R14.1, R14.2, R14.6
 */

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import type { MiembroDTO } from "@/lib/api/serializadores-auth"

const DIAS = [
  { value: 0, label: "Lunes" },
  { value: 1, label: "Martes" },
  { value: 2, label: "Miércoles" },
  { value: 3, label: "Jueves" },
  { value: 4, label: "Viernes" },
  { value: 5, label: "Sábado" },
  { value: 6, label: "Domingo" },
]

const TIPOS = [
  { value: "normal", label: "Normal" },
  { value: "vacaciones", label: "Vacaciones" },
  { value: "incapacidad", label: "Incapacidad" },
  { value: "descanso", label: "Descanso" },
] as const

const horaRegex = /^([01]\d|2[0-3]):[0-5]\d$/

const formSchema = z.object({
  membresia_id: z.string().min(1, "Selecciona un miembro"),
  dia: z.coerce.number().int().min(0).max(6),
  tipo: z.enum(["normal", "vacaciones", "incapacidad", "descanso"]),
  hora_inicio: z
    .string()
    .regex(horaRegex, "Formato HH:MM")
    .optional()
    .or(z.literal("")),
  hora_fin: z
    .string()
    .regex(horaRegex, "Formato HH:MM")
    .optional()
    .or(z.literal("")),
})

type FormValues = z.infer<typeof formSchema>

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  organizacionId: string
  miembros: MiembroDTO[]
  onCreado: () => void
}

export function AsignarHorarioDialog({
  open,
  onOpenChange,
  organizacionId,
  miembros,
  onCreado,
}: Props) {
  const [guardando, setGuardando] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      membresia_id: "",
      dia: 0,
      tipo: "normal",
      hora_inicio: "",
      hora_fin: "",
    },
  })

  const onSubmit = async (values: FormValues) => {
    setGuardando(true)
    try {
      const body: Record<string, unknown> = {
        membresia_id: values.membresia_id,
        dia: values.dia,
        tipo: values.tipo,
      }
      if (values.hora_inicio) body.hora_inicio = values.hora_inicio
      if (values.hora_fin) body.hora_fin = values.hora_fin

      const res = await fetch(
        `/api/organizaciones/${organizacionId}/horarios`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      )

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        const mensaje =
          data?.error?.mensaje ?? "No se pudo asignar el horario"
        toast.error(mensaje)
        return
      }

      toast.success("Horario asignado correctamente")
      form.reset()
      onOpenChange(false)
      onCreado()
    } catch {
      toast.error("Error al asignar el horario")
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Asignar Horario</DialogTitle>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {/* Miembro */}
            <FormField
              control={form.control}
              name="membresia_id"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Miembro</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un miembro" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {miembros.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.usuario.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Día */}
            <FormField
              control={form.control}
              name="dia"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Día</FormLabel>
                  <Select
                    onValueChange={(v) => field.onChange(Number(v))}
                    value={String(field.value)}
                  >
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un día" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {DIAS.map((d) => (
                        <SelectItem key={d.value} value={String(d.value)}>
                          {d.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Tipo */}
            <FormField
              control={form.control}
              name="tipo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona un tipo" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TIPOS.map((t) => (
                        <SelectItem key={t.value} value={t.value}>
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Hora inicio */}
            <FormField
              control={form.control}
              name="hora_inicio"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hora inicio</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Hora fin */}
            <FormField
              control={form.control}
              name="hora_fin"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Hora fin</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={guardando}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={guardando}>
                {guardando ? "Guardando…" : "Asignar"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  )
}
