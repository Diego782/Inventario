# Elementos Ocultos en Producción Beta

> Este documento describe todos los elementos de UI que fueron comentados/ocultados
> para el despliegue de la versión beta de producción (`produccion-beta`).
> La rama `desarrollo` y `main` los conservan activos.

---

## Resumen de cambios

| Elemento | Archivo | Razón |
|---|---|---|
| Botón "Exportar" en Inventario | `components/sections/inventario-section.tsx` | Sin funcionalidad implementada |
| Módulo completo "Fiadores" | `components/sidebar.tsx`, `app/page.tsx` | Módulo incompleto, se lanza en próxima versión |
| Sección "Impuestos (IVA)" en Configuración | `components/sections/configuracion-section.tsx` | Funcionalidad sin backend listo |
| Sección "Ticket de Venta" en Configuración | `components/sections/configuracion-section.tsx` | Funcionalidad sin backend listo |
| Buscador global del Header (navbar) | `components/header.tsx` | Sin funcionalidad implementada |
| Grid de tarjetas de módulos (Configuración) | `components/sections/configuracion-section.tsx` | Módulos sin implementar (Negocio, Usuarios, Notificaciones, Seguridad, Base de Datos, Impresión, Métodos de Pago, Documentos) |

---

## Detalle por archivo

### 1. `components/sections/inventario-section.tsx`

**Qué se ocultó:** Botón "Exportar" con ícono `Download`.

**Cómo restaurarlo:**
1. Restaurar el import de `Download`:
   ```tsx
   import { Search, Plus, Download } from "lucide-react"
   ```
2. Descomentar el bloque del botón:
   ```tsx
   <Button variant="outline" size="sm">
     <Download className="w-4 h-4 mr-2" />
     Exportar
   </Button>
   ```

---

### 2. `components/sidebar.tsx`

**Qué se ocultó:** Item "Fiadores" del menú de navegación.

**Cómo restaurarlo:** Descomentar la línea en el array `menuItems`:
```tsx
{ icon: UserCheck, label: "Fiadores" },
```

---

### 3. `app/page.tsx`

**Qué se ocultó (dos lugares):**

**a) Array `ORDEN_SECCIONES`** — quitar el comentario:
```tsx
"Fiadores",
```

**b) Switch `renderSection()`** — descomentar el case:
```tsx
case "Fiadores":
  return <FiadoresSection />
```

> Nota: el import `FiadoresSection` ya está presente en el archivo y no fue tocado.

---

### 4. `components/sections/configuracion-section.tsx`

**Qué se ocultó:** Dos bloques dentro del `<form>`:

**a) Sección "Impuestos"** — bloque `FormField` con `name="porcentaje_impuesto"`.

**b) Sección "Ticket de Venta"** — dos `FormField`:
- `name="ticket_ancho_mm"`
- `name="imprimir_automaticamente"`

**Cómo restaurarlos:** Quitar los delimitadores de comentario JSX `{/* BETA: ... */}` que envuelven cada bloque. El código completo está conservado dentro del comentario.

---

### 5. `components/header.tsx`

**Qué se ocultó:** Buscador global `<Input placeholder="Buscar..." />` en la barra superior (visible en pantallas `md` y mayores).

**Cómo restaurarlo:**
1. Restaurar los imports:
   ```tsx
   import { Bell, Search, Menu } from "lucide-react"
   import { Input } from "@/components/ui/input"
   ```
2. Descomentar el bloque en el JSX:
   ```tsx
   <div className="relative hidden md:block">
     <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
     <Input
       placeholder="Buscar..."
       className="pl-10 w-64 bg-muted border-none"
     />
   </div>
   ```

---

### 6. `components/sections/configuracion-section.tsx` — Grid de módulos

**Qué se ocultó:** La grid completa de 8 tarjetas de módulos de configuración:
Negocio, Usuarios, Notificaciones, Seguridad, Base de Datos, Impresión, Métodos de Pago, Documentos.

**Cómo restaurarlo:** Quitar los delimitadores `{/* BETA: Grid de módulos ... */}` que envuelven el bloque `<div className="grid grid-cols-1 md:grid-cols-2 gap-6">`. El código completo está conservado dentro del comentario.

---

| Rama | Propósito | Estado de los elementos ocultos |
|---|---|---|
| `main` | Desarrollo activo | ✅ Todos visibles |
| `desarrollo` | Desarrollo activo (rama de trabajo) | ✅ Todos visibles |
| `produccion-beta` | Despliegue en producción beta | ❌ Todos ocultos (este doc aplica aquí) |

---

## Checklist para habilitar en la siguiente versión

Antes de descomentar cada elemento, verificar:

- [ ] **Exportar:** Implementar endpoint o lógica de exportación a CSV/Excel
- [ ] **Fiadores:** Completar CRUD, validaciones y conexión al backend
- [ ] **IVA / Impuestos:** Verificar que el cálculo se aplique correctamente en ventas
- [ ] **Ticket de Venta:** Validar integración con impresoras térmicas
- [ ] **Buscador global:** Implementar búsqueda cross-módulo (productos, ventas, clientes)
- [ ] **Grid de módulos (Configuración):** Implementar cada módulo antes de exponerlo:
  - [ ] Negocio — nombre, dirección, teléfono, logotipo
  - [ ] Usuarios — administradores, vendedores, roles y permisos
  - [ ] Notificaciones — alertas de stock, notificaciones de ventas, recordatorios
  - [ ] Seguridad — cambiar contraseña, autenticación, sesiones activas
  - [ ] Base de Datos — respaldos, restaurar datos, limpiar registros
  - [ ] Impresión — configuración de impresoras (tickets, reportes, etiquetas)
  - [ ] Métodos de Pago — efectivo, tarjetas, transferencias, fiado
  - [ ] Documentos — facturas, cotizaciones, contratos de fiador
