"use client"

import { StatCard } from "@/components/stat-card"
import {
  Package,
  ShoppingCart,
  Users,
  DollarSign,
  TrendingUp,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"

const recentSales = [
  { id: 1, customer: "Carlos Martinez", product: "Laptop HP", amount: "$1,250.00", time: "Hace 5 min" },
  { id: 2, customer: "Ana Garcia", product: "Monitor LG 27\"", amount: "$450.00", time: "Hace 15 min" },
  { id: 3, customer: "Luis Rodriguez", product: "Teclado Mecanico", amount: "$120.00", time: "Hace 30 min" },
  { id: 4, customer: "Maria Lopez", product: "Mouse Inalambrico", amount: "$45.00", time: "Hace 1 hora" },
  { id: 5, customer: "Pedro Sanchez", product: "Audifonos Sony", amount: "$180.00", time: "Hace 2 horas" },
]

const lowStockItems = [
  { id: 1, name: "Laptop Dell XPS", stock: 3, minStock: 10 },
  { id: 2, name: "Monitor Samsung 24\"", stock: 5, minStock: 15 },
  { id: 3, name: "Cable HDMI 2m", stock: 8, minStock: 25 },
  { id: 4, name: "Cargador USB-C", stock: 4, minStock: 20 },
]

export function DashboardSection() {
  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <StatCard
          title="Ventas del Dia"
          value="$4,520"
          change="+12.5% vs ayer"
          changeType="positive"
          icon={DollarSign}
        />
        <StatCard
          title="Productos en Stock"
          value="1,234"
          change="32 bajo minimo"
          changeType="negative"
          icon={Package}
        />
        <StatCard
          title="Ventas del Mes"
          value="$45,230"
          change="+8.2% vs mes anterior"
          changeType="positive"
          icon={TrendingUp}
        />
        <StatCard
          title="Clientes Activos"
          value="156"
          change="+5 nuevos esta semana"
          changeType="positive"
          icon={Users}
        />
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Sales */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Ventas Recientes</h3>
              <p className="text-sm text-muted-foreground">Ultimas transacciones del dia</p>
            </div>
            <Button variant="outline" size="sm">
              Ver todas
            </Button>
          </div>
          <div className="divide-y divide-border">
            {recentSales.map((sale) => (
              <div key={sale.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <ShoppingCart className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{sale.customer}</p>
                    <p className="text-sm text-muted-foreground">{sale.product}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-foreground">{sale.amount}</p>
                  <p className="text-xs text-muted-foreground">{sale.time}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low Stock Alert */}
        <div className="bg-card rounded-xl border border-border shadow-sm">
          <div className="flex items-center justify-between p-6 border-b border-border">
            <div>
              <h3 className="text-lg font-semibold text-foreground">Alertas de Stock</h3>
              <p className="text-sm text-muted-foreground">Productos bajo minimo</p>
            </div>
            <Button variant="outline" size="sm">
              Ver inventario
            </Button>
          </div>
          <div className="divide-y divide-border">
            {lowStockItems.map((item) => (
              <div key={item.id} className="flex items-center justify-between p-4 hover:bg-muted/50 transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                    <Package className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{item.name}</p>
                    <p className="text-sm text-muted-foreground">Min: {item.minStock} unidades</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-primary">{item.stock} uds</p>
                  <div className="w-20 h-2 bg-muted rounded-full mt-1">
                    <div 
                      className="h-full bg-primary rounded-full" 
                      style={{ width: `${(item.stock / item.minStock) * 100}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="bg-card rounded-xl border border-border shadow-sm p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Acciones Rapidas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button className="h-auto py-4 flex-col gap-2 bg-primary hover:bg-primary/90 text-primary-foreground">
            <ShoppingCart className="w-6 h-6" />
            <span>Nueva Venta</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2">
            <Package className="w-6 h-6" />
            <span>Agregar Producto</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2">
            <Users className="w-6 h-6" />
            <span>Nuevo Cliente</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex-col gap-2">
            <TrendingUp className="w-6 h-6" />
            <span>Ver Reportes</span>
          </Button>
        </div>
      </div>
    </div>
  )
}
