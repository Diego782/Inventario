"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Search,
  Plus,
  Filter,
  Download,
  Phone,
  Mail,
  Calendar,
  MoreVertical,
  Briefcase,
} from "lucide-react"

const employees = [
  { 
    id: 1, 
    name: "Juan Carlos Mendez", 
    role: "Gerente de Ventas",
    department: "Ventas",
    phone: "+52 555 111 2222", 
    email: "jc.mendez@empresa.com",
    startDate: "2020-03-15",
    status: "Activo",
    schedule: "Lun-Vie 9:00-18:00"
  },
  { 
    id: 2, 
    name: "Maria Elena Rios", 
    role: "Vendedor Senior",
    department: "Ventas",
    phone: "+52 555 333 4444", 
    email: "me.rios@empresa.com",
    startDate: "2021-06-01",
    status: "Activo",
    schedule: "Lun-Sab 8:00-16:00"
  },
  { 
    id: 3, 
    name: "Roberto Silva", 
    role: "Almacenista",
    department: "Inventario",
    phone: "+52 555 555 6666", 
    email: "r.silva@empresa.com",
    startDate: "2022-01-10",
    status: "Activo",
    schedule: "Lun-Vie 7:00-15:00"
  },
  { 
    id: 4, 
    name: "Ana Lucia Fernandez", 
    role: "Cajera",
    department: "Ventas",
    phone: "+52 555 777 8888", 
    email: "al.fernandez@empresa.com",
    startDate: "2023-02-20",
    status: "Activo",
    schedule: "Mar-Sab 10:00-18:00"
  },
  { 
    id: 5, 
    name: "Carlos Alberto Vega", 
    role: "Contador",
    department: "Administracion",
    phone: "+52 555 999 0000", 
    email: "ca.vega@empresa.com",
    startDate: "2019-08-05",
    status: "Vacaciones",
    schedule: "Lun-Vie 9:00-17:00"
  },
  { 
    id: 6, 
    name: "Diana Patricia Luna", 
    role: "Vendedor",
    department: "Ventas",
    phone: "+52 555 123 9876", 
    email: "dp.luna@empresa.com",
    startDate: "2023-09-01",
    status: "Activo",
    schedule: "Mie-Dom 11:00-19:00"
  },
]

export function EmpleadosSection() {
  const [searchTerm, setSearchTerm] = useState("")
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid")

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Activo":
        return "bg-green-100 text-green-700"
      case "Vacaciones":
        return "bg-blue-100 text-blue-700"
      case "Inactivo":
        return "bg-muted text-muted-foreground"
      case "Incapacidad":
        return "bg-yellow-100 text-yellow-700"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getDepartmentColor = (dept: string) => {
    switch (dept) {
      case "Ventas":
        return "bg-primary/10 text-primary"
      case "Inventario":
        return "bg-purple-100 text-purple-700"
      case "Administracion":
        return "bg-blue-100 text-blue-700"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar empleado..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10"
          />
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
            Nuevo Empleado
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Empleados</p>
          <p className="text-2xl font-bold text-foreground">24</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Activos Hoy</p>
          <p className="text-2xl font-bold text-green-600">21</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">En Vacaciones</p>
          <p className="text-2xl font-bold text-blue-600">2</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Incapacidad</p>
          <p className="text-2xl font-bold text-yellow-600">1</p>
        </div>
      </div>

      {/* Employee Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {employees.map((employee) => (
          <div 
            key={employee.id} 
            className="bg-card rounded-xl border border-border shadow-sm overflow-hidden hover:shadow-md transition-shadow"
          >
            {/* Header with gradient */}
            <div className="h-20 bg-primary/30 relative">
              <div className="absolute -bottom-8 left-6">
                <div className="w-16 h-16 rounded-full bg-card border-4 border-card flex items-center justify-center shadow-lg">
                  <span className="text-xl font-bold text-primary">
                    {employee.name.split(" ").slice(0, 2).map(n => n[0]).join("")}
                  </span>
                </div>
              </div>
              <button className="absolute top-3 right-3 p-2 rounded-lg bg-primary/20 hover:bg-primary/30 transition-colors">
                <MoreVertical className="w-4 h-4 text-primary" />
              </button>
            </div>

            {/* Content */}
            <div className="pt-12 pb-6 px-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-foreground">{employee.name}</h3>
                  <p className="text-sm text-muted-foreground">{employee.role}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(employee.status)}`}>
                  {employee.status}
                </span>
              </div>

              <div className="space-y-3 text-sm">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Briefcase className="w-4 h-4" />
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${getDepartmentColor(employee.department)}`}>
                    {employee.department}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Phone className="w-4 h-4" />
                  <span>{employee.phone}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Mail className="w-4 h-4" />
                  <span className="truncate">{employee.email}</span>
                </div>
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="w-4 h-4" />
                  <span>{employee.schedule}</span>
                </div>
              </div>

              <div className="mt-4 pt-4 border-t border-border flex gap-2">
                <Button variant="outline" size="sm" className="flex-1">
                  Ver Perfil
                </Button>
                <Button variant="outline" size="sm" className="flex-1">
                  Horarios
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
