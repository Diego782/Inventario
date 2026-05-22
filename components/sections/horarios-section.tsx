"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  Download,
  Filter,
} from "lucide-react"
import { cn } from "@/lib/utils"

const weekDays = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"]

const employees = [
  { id: 1, name: "Juan Carlos M.", role: "Gerente" },
  { id: 2, name: "Maria Elena R.", role: "Vendedor Sr." },
  { id: 3, name: "Roberto Silva", role: "Almacenista" },
  { id: 4, name: "Ana Lucia F.", role: "Cajera" },
  { id: 5, name: "Carlos Alberto V.", role: "Contador" },
  { id: 6, name: "Diana Patricia L.", role: "Vendedor" },
]

const scheduleData: Record<number, Record<number, { start: string; end: string; type: string } | null>> = {
  1: {
    0: { start: "09:00", end: "18:00", type: "normal" },
    1: { start: "09:00", end: "18:00", type: "normal" },
    2: { start: "09:00", end: "18:00", type: "normal" },
    3: { start: "09:00", end: "18:00", type: "normal" },
    4: { start: "09:00", end: "18:00", type: "normal" },
    5: null,
    6: null,
  },
  2: {
    0: { start: "08:00", end: "16:00", type: "normal" },
    1: { start: "08:00", end: "16:00", type: "normal" },
    2: { start: "08:00", end: "16:00", type: "normal" },
    3: { start: "08:00", end: "16:00", type: "normal" },
    4: { start: "08:00", end: "16:00", type: "normal" },
    5: { start: "08:00", end: "14:00", type: "normal" },
    6: null,
  },
  3: {
    0: { start: "07:00", end: "15:00", type: "normal" },
    1: { start: "07:00", end: "15:00", type: "normal" },
    2: { start: "07:00", end: "15:00", type: "normal" },
    3: { start: "07:00", end: "15:00", type: "normal" },
    4: { start: "07:00", end: "15:00", type: "normal" },
    5: null,
    6: null,
  },
  4: {
    0: null,
    1: { start: "10:00", end: "18:00", type: "normal" },
    2: { start: "10:00", end: "18:00", type: "normal" },
    3: { start: "10:00", end: "18:00", type: "normal" },
    4: { start: "10:00", end: "18:00", type: "normal" },
    5: { start: "10:00", end: "18:00", type: "normal" },
    6: null,
  },
  5: {
    0: { start: "09:00", end: "17:00", type: "vacation" },
    1: { start: "09:00", end: "17:00", type: "vacation" },
    2: { start: "09:00", end: "17:00", type: "vacation" },
    3: { start: "09:00", end: "17:00", type: "vacation" },
    4: { start: "09:00", end: "17:00", type: "vacation" },
    5: null,
    6: null,
  },
  6: {
    0: null,
    1: null,
    2: { start: "11:00", end: "19:00", type: "normal" },
    3: { start: "11:00", end: "19:00", type: "normal" },
    4: { start: "11:00", end: "19:00", type: "normal" },
    5: { start: "11:00", end: "19:00", type: "normal" },
    6: { start: "11:00", end: "19:00", type: "normal" },
  },
}

export function HorariosSection() {
  const [currentWeek, setCurrentWeek] = useState(new Date())

  const getWeekDates = (date: Date) => {
    const week = []
    const start = new Date(date)
    start.setDate(start.getDate() - start.getDay() + 1)
    
    for (let i = 0; i < 7; i++) {
      const day = new Date(start)
      day.setDate(start.getDate() + i)
      week.push(day)
    }
    return week
  }

  const weekDates = getWeekDates(currentWeek)

  const goToPreviousWeek = () => {
    const newDate = new Date(currentWeek)
    newDate.setDate(newDate.getDate() - 7)
    setCurrentWeek(newDate)
  }

  const goToNextWeek = () => {
    const newDate = new Date(currentWeek)
    newDate.setDate(newDate.getDate() + 7)
    setCurrentWeek(newDate)
  }

  const getScheduleStyle = (type: string) => {
    switch (type) {
      case "normal":
        return "bg-primary/10 border-primary/30 text-foreground"
      case "vacation":
        return "bg-blue-100 border-blue-300 text-foreground"
      case "sick":
        return "bg-yellow-100 border-yellow-300 text-foreground"
      default:
        return "bg-muted text-foreground"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" onClick={goToPreviousWeek}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <div className="text-center">
            <h3 className="font-semibold text-foreground">
              {weekDates[0].toLocaleDateString("es-ES", { month: "long", year: "numeric" })}
            </h3>
            <p className="text-sm text-muted-foreground">
              {weekDates[0].toLocaleDateString("es-ES", { day: "numeric", month: "short" })} - {weekDates[6].toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </p>
          </div>
          <Button variant="outline" size="icon" onClick={goToNextWeek}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Filter className="w-4 h-4 mr-2" />
            Filtrar
          </Button>
          <Button variant="outline" size="sm">
            <Download className="w-4 h-4 mr-2" />
            Exportar
          </Button>
          <Button size="sm" className="bg-primary hover:bg-primary/90 text-primary-foreground">
            <Plus className="w-4 h-4 mr-2" />
            Asignar Horario
          </Button>
        </div>
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-primary/10 border border-primary/30" />
          <span className="text-sm text-muted-foreground">Turno Normal</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-blue-100 border border-blue-300" />
          <span className="text-sm text-muted-foreground">Vacaciones</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-yellow-100 border border-yellow-300" />
          <span className="text-sm text-muted-foreground">Incapacidad</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 rounded bg-muted border border-border" />
          <span className="text-sm text-muted-foreground">Descanso</span>
        </div>
      </div>

      {/* Schedule Grid */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[800px]">
            <thead>
              <tr className="bg-muted/50">
                <th className="p-4 text-left font-semibold text-foreground w-48 border-r border-border">
                  Empleado
                </th>
                {weekDates.map((date, index) => (
                  <th 
                    key={index} 
                    className={cn(
                      "p-4 text-center font-semibold text-foreground border-r border-border last:border-r-0",
                      date.toDateString() === new Date().toDateString() && "bg-primary/5"
                    )}
                  >
                    <div className="text-sm">{weekDays[index]}</div>
                    <div className={cn(
                      "text-lg",
                      date.toDateString() === new Date().toDateString() && "text-primary"
                    )}>
                      {date.getDate()}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id} className="border-t border-border hover:bg-muted/30">
                  <td className="p-4 border-r border-border">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <span className="text-sm font-bold text-primary">
                          {employee.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
                        </span>
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{employee.name}</p>
                        <p className="text-xs text-muted-foreground">{employee.role}</p>
                      </div>
                    </div>
                  </td>
                  {weekDates.map((_, dayIndex) => {
                    const schedule = scheduleData[employee.id]?.[dayIndex]
                    return (
                      <td 
                        key={dayIndex} 
                        className={cn(
                          "p-2 border-r border-border last:border-r-0 text-center",
                          weekDates[dayIndex].toDateString() === new Date().toDateString() && "bg-primary/5"
                        )}
                      >
                        {schedule ? (
                          <div className={cn(
                            "rounded-lg border p-2 text-xs font-medium",
                            getScheduleStyle(schedule.type)
                          )}>
                            <div>{schedule.start}</div>
                            <div className="text-[10px] opacity-70">a</div>
                            <div>{schedule.end}</div>
                          </div>
                        ) : (
                          <div className="rounded-lg bg-muted/50 border border-border p-2 text-xs text-muted-foreground">
                            Descanso
                          </div>
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Weekly Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Horas Semana</p>
          <p className="text-2xl font-bold text-foreground">248 hrs</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Empleados Activos</p>
          <p className="text-2xl font-bold text-green-600">5 de 6</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Turnos Asignados</p>
          <p className="text-2xl font-bold text-foreground">28</p>
        </div>
      </div>
    </div>
  )
}
