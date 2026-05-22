"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Search,
  Filter,
  Eye,
  Phone,
  Mail,
  MapPin,
  AlertTriangle,
  CheckCircle,
  Clock,
} from "lucide-react"

const fiadores = [
  { 
    id: 1, 
    name: "Roberto Hernandez", 
    phone: "+52 555 123 4567", 
    email: "roberto@email.com",
    address: "Calle Principal #123, Col. Centro",
    debtorCount: 3,
    totalGuaranteed: "$4,500.00",
    status: "Activo"
  },
  { 
    id: 2, 
    name: "Patricia Gomez", 
    phone: "+52 555 987 6543", 
    email: "patricia@email.com",
    address: "Av. Reforma #456, Col. Juarez",
    debtorCount: 2,
    totalGuaranteed: "$2,800.00",
    status: "Activo"
  },
  { 
    id: 3, 
    name: "Miguel Torres", 
    phone: "+52 555 456 7890", 
    email: "miguel@email.com",
    address: "Blvd. Americas #789, Col. Norte",
    debtorCount: 5,
    totalGuaranteed: "$8,200.00",
    status: "En Riesgo"
  },
  { 
    id: 4, 
    name: "Sandra Vargas", 
    phone: "+52 555 321 0987", 
    email: "sandra@email.com",
    address: "Calle Hidalgo #234, Col. Sur",
    debtorCount: 1,
    totalGuaranteed: "$1,200.00",
    status: "Activo"
  },
  { 
    id: 5, 
    name: "Fernando Castro", 
    phone: "+52 555 654 3210", 
    email: "fernando@email.com",
    address: "Av. Independencia #567, Col. Este",
    debtorCount: 4,
    totalGuaranteed: "$6,500.00",
    status: "Inactivo"
  },
]

export function FiadoresSection() {
  const [searchTerm, setSearchTerm] = useState("")

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Activo":
        return "bg-green-100 text-green-700"
      case "En Riesgo":
        return "bg-red-100 text-red-700"
      case "Inactivo":
        return "bg-green-100 text-green-700"
      default:
        return "bg-muted text-muted-foreground"
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Activo":
        return <CheckCircle className="w-4 h-4" />
      case "En Riesgo":
        return <AlertTriangle className="w-4 h-4" />
      case "Inactivo":
        return <Clock className="w-4 h-4" />
      default:
        return null
    }
  }

  return (
    <div className="space-y-6">
      {/* Header Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
        <div className="relative w-full sm:w-96">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar fiador..."
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
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Fiadores</p>
          <p className="text-2xl font-bold text-foreground">45</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Activos</p>
          <p className="text-2xl font-bold text-green-600">38</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">Total Garantizado</p>
          <p className="text-2xl font-bold text-foreground">$45,600</p>
        </div>
        <div className="bg-card rounded-lg border border-border p-4">
          <p className="text-sm text-muted-foreground">En Riesgo</p>
          <p className="text-2xl font-bold text-primary">5</p>
        </div>
      </div>

      {/* Fiadores Table */}
      <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="font-semibold">Fiador</TableHead>
              <TableHead className="font-semibold">Contacto</TableHead>
              <TableHead className="font-semibold text-center">Deudores</TableHead>
              <TableHead className="font-semibold">Total Garantizado</TableHead>
              <TableHead className="font-semibold">Estado</TableHead>
              <TableHead className="font-semibold text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {fiadores.map((fiador) => (
              <TableRow key={fiador.id} className="hover:bg-muted/30">
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                      <span className="text-sm font-bold text-primary">
                        {fiador.name.split(" ").map(n => n[0]).join("")}
                      </span>
                    </div>
                    <div>
                      <p className="font-medium">{fiador.name}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="w-3 h-3" />
                        {fiador.address}
                      </p>
                    </div>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <p className="text-sm flex items-center gap-1">
                      <Phone className="w-3 h-3 text-muted-foreground" />
                      {fiador.phone}
                    </p>
                    <p className="text-sm flex items-center gap-1">
                      <Mail className="w-3 h-3 text-muted-foreground" />
                      {fiador.email}
                    </p>
                  </div>
                </TableCell>
                <TableCell className="text-center font-semibold">{fiador.debtorCount}</TableCell>
                <TableCell className="font-semibold">{fiador.totalGuaranteed}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${getStatusColor(fiador.status)}`}>
                    {getStatusIcon(fiador.status)}
                    {fiador.status}
                  </span>
                </TableCell>
                <TableCell className="text-right">
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <Eye className="w-4 h-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
