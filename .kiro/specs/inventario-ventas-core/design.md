# Design Document

> Documento de diseño técnico de la feature `inventario-ventas-core`.
> El encabezado raíz se mantiene en inglés por requisito del validador del spec.
> El cuerpo de la guía está en español, igual que la app InvenPro.

## Overview

`inventario-ventas-core` añade a InvenPro la capa de **persistencia real**, los **flujos
operativos** completos de Inventario y Ventas y la **integración con hardware**
periférico (lector USB-HID e impresora térmica). Hoy, la app es un cascarón con
secciones renderizadas a partir de datos en memoria (`components/sections/*-section.tsx`).
Esta feature transforma esa cáscara en un sistema operativo de mostrador conservando
intactos el shell de navegación de página única (`app/page.tsx`), el sistema de diseño
shadcn/ui (style new-york, base neutral) y la convención `components/sections/*` para
las secciones raíz.

Lo que se construye:

- **Base de datos MySQL 8** dentro de Docker, con esquema Prisma versionado para las
  entidades `productos`, `categorias`, `movimientos_stock`, `ventas`, `venta_items` y
  `configuracion`.
- **Capa API** sobre Route Handlers de Next.js 16 (`app/api/**/route.ts`), validada con
  Zod, con respuestas JSON tipadas y un envoltorio de error uniforme.
- **Ventanas flotantes shadcn** para todo el ciclo de vida de productos (alta,
  edición, baja, ajuste de stock, historial, impresión de etiqueta) y para el flujo de
  venta (Nueva Venta, Carrito, Pago, Ticket, Detalle), bajo `components/inventario/` y
  `components/ventas/`.
- **Hooks de cliente** reutilizables: `useBarcodeScanner` (detección por *timing*),
  `useDebouncedValue`, `useConfiguracion`, `useCarritoVenta`.
- **Generación, impresión y lectura de códigos de barras** EAN-13 / Code128 con
  `jsbarcode` (SVG offline) y CSS `@media print` específico por documento (etiqueta y
  ticket).
- **Atomicidad de venta**: una sola transacción inserta la venta, sus líneas, los
  movimientos de stock y descuenta inventario. Si algo falla, nada cambia.
- **Configuración parametrizable** (impuesto, tamaños, sobreventa, impresión
  automática) leída en boot de cliente y cacheada para la sesión.
- **Testing por propiedades** con `fast-check`: todas las funciones puras críticas
  (códigos de barras, redondeo bancario, totales del carrito, folio diario) se
  verifican como propiedades universales.

Cómo encaja: el shell `app/page.tsx` no cambia. `inventario-section.tsx` y
`ventas-section.tsx` pasan de listar datos hard-coded a consumir la API y a montar
las nuevas ventanas flotantes. Las nuevas dependencias (`prisma`, `@prisma/client`,
`jsbarcode`, `fast-check`, `@hookform/resolvers`, `date-fns-tz`) se añaden vía pnpm
respetando el lockfile existente.


## Architecture

### Diagrama de capas

```mermaid
flowchart LR
    subgraph Cliente["Navegador (Next.js 16 RSC + Client Components)"]
        UI["components/sections/*<br/>+ components/inventario/*<br/>+ components/ventas/*"]
        Hooks["hooks/*<br/>(useBarcodeScanner,<br/>useCarritoVenta,<br/>useConfiguracion,<br/>useDebouncedValue)"]
        LibCli["lib/codigo-barras.ts<br/>lib/money.ts"]
        Print["@media print<br/>etiqueta / ticket"]
        UI --> Hooks --> LibCli
        UI --> Print
    end

    subgraph Server["Servidor Next.js (Node)"]
        RH["Route Handlers<br/>app/api/**/route.ts"]
        Dom["lib/dominio/*<br/>(inventario, ventas, folio)"]
        ApiUtil["lib/api/respuestas.ts<br/>lib/api/with-validation.ts"]
        Db["lib/db.ts<br/>(Prisma singleton)"]
        Log["lib/log.ts"]
        RH --> ApiUtil --> Dom --> Db
        RH --> Log
    end

    subgraph Infra["Docker Compose"]
        Mysql[("MySQL 8<br/>volumen invenpro_mysql_data")]
    end

    Cliente -->|fetch JSON| RH
    Db -->|TCP 3306| Mysql
    Hardware1[["Lector USB-HID"]] -.keydown.-> Hooks
    Hardware2[["Impresora térmica"]] -.window.print().-> Print
```

Capas:

1. **UI client** (React 19, Client Components con `"use client"`). Consume la API por
   `fetch` y mantiene estado de UI (carrito, foco del lector, formulario). Aquí viven
   los componentes shadcn flotantes nuevos.
2. **Hooks de cliente** que encapsulan lógica reusable (escaneo, debounce,
   configuración cacheada, carrito).
3. **Utilidades puras de cliente** (`lib/codigo-barras.ts`, `lib/money.ts`). Sin
   *side effects* y por lo tanto candidatas naturales a *property-based testing*.
4. **Route Handlers** validan, orquestan y devuelven JSON. No contienen reglas de
   negocio.
5. **Capa de dominio** (`lib/dominio/*`) implementa transacciones, validaciones de
   negocio y generación de folio. Es la única que llama a Prisma.
6. **Prisma** (`lib/db.ts`) expone un singleton de `PrismaClient` para evitar fugas de
   conexiones durante hot-reload.
7. **MySQL 8** corriendo en Docker. Sin acceso desde el cliente: todo pasa por la API.

### Flujos de datos clave

#### Flujo A — Alta de producto

```mermaid
sequenceDiagram
    actor U as Usuario
    participant UI as ProductoFormDialog
    participant API as POST /api/productos
    participant DOM as lib/dominio/inventario
    participant DB as Prisma + MySQL

    U->>UI: Click "Nuevo Producto"
    UI->>UI: react-hook-form + zodResolver
    U->>UI: Submit form
    UI->>API: POST {nombre, sku, codigo_barras?, ...}
    API->>API: zod.parse(payload)
    alt codigo_barras vacío
        API->>DOM: generarCodigoBarrasUnico()
        DOM->>DB: SELECT codigo_barras WHERE codigo=?
        DB-->>DOM: hit/miss
    end
    API->>DOM: crearProducto(input)
    DOM->>DB: INSERT productos
    alt P2002 unique violation
        DB-->>DOM: error
        DOM-->>API: ConflictoSku | ConflictoCodigo
        API-->>UI: 409 {error:{codigo}}
    else ok
        DB-->>DOM: producto
        DOM-->>API: producto
        API-->>UI: 201 {producto}
        UI->>UI: toast "Producto creado", cerrar dialog, refetch tabla
    end
```

#### Flujo B — Escaneo durante venta

```mermaid
sequenceDiagram
    actor C as Cajero
    participant Lec as Lector USB-HID
    participant H as useBarcodeScanner
    participant Q as Cola FIFO
    participant API as GET /api/productos/por-codigo/:c
    participant Carrito as useCarritoVenta

    Lec->>H: keydown(d1) ... keydown(dN) keydown(Enter)
    Note over H: Δt entre teclas ≤ 80 ms ⇒ escaneo
    H->>Q: encolar(codigo)
    loop mientras la cola no esté vacía
        Q->>API: GET por-codigo
        alt 200
            API-->>Q: {producto}
            Q->>Carrito: agregarOIncrementar(producto)
        else 404
            API-->>Q: PRODUCTO_NO_ENCONTRADO
            Q->>Carrito: toast.error("Código no encontrado")
        end
    end
    Carrito->>Carrito: refocus campo oculto (<100 ms)
```

#### Flujo C — Cobro atómico

```mermaid
sequenceDiagram
    actor C as Cajero
    participant UI as PagoForm
    participant API as POST /api/ventas
    participant Dom as lib/dominio/ventas
    participant Tx as Prisma $transaction
    participant Db as MySQL

    C->>UI: Click Cobrar
    UI->>API: POST {items, metodo_pago, monto_recibido?, fiador_id?}
    API->>API: Zod.parse + validar totales recalculados
    API->>Dom: registrarVenta(input)
    Dom->>Tx: $transaction(async tx => { ... })
    Tx->>Db: SELECT productos FOR UPDATE (lock)
    Tx->>Tx: validar stock por ítem
    Tx->>Tx: generar folio (lib/dominio/folio)
    Tx->>Db: INSERT ventas
    Tx->>Db: INSERT venta_items (N filas)
    Tx->>Db: UPDATE productos SET stock_actual -= cantidad
    Tx->>Db: INSERT movimientos_stock (N filas, tipo='venta')
    alt cualquier paso falla
        Db-->>Tx: error
        Tx-->>Dom: rollback
        Dom-->>API: VentaFallidaError
        API-->>UI: 500 {error: VENTA_FALLIDA}
    else commit
        Db-->>Tx: ok
        Tx-->>Dom: venta + items
        Dom-->>API: venta
        API-->>UI: 201 {venta}
        UI->>UI: abrir TicketDialog → window.print()
    end
```

#### Flujo D — Impresión

```mermaid
sequenceDiagram
    actor U as Usuario
    participant Dlg as ImprimirEtiquetaDialog
    participant Pre as EtiquetaPreview
    participant Win as window.print()

    U->>Dlg: cantidad N (1..100), Imprimir
    Dlg->>Pre: render N copias dentro de .imprimir-etiqueta
    Dlg->>Win: invocar print()
    Note over Win: @media print oculta todo<br/>excepto .imprimir-etiqueta
    Win-->>U: Diálogo nativo del SO con impresora térmica
```


## Components and Interfaces

### Jerarquía y composición

```mermaid
graph TD
    Page["app/page.tsx (shell)"] --> InvSec["components/sections/inventario-section.tsx"]
    Page --> VtaSec["components/sections/ventas-section.tsx"]
    Page --> CfgSec["components/sections/configuracion-section.tsx"]

    InvSec --> InvTable["components/inventario/inventario-table.tsx"]
    InvSec --> InvDlg1["producto-form-dialog.tsx"]
    InvSec --> InvDlg2["eliminar-producto-dialog.tsx"]
    InvSec --> InvDlg3["ajustar-stock-dialog.tsx"]
    InvSec --> InvDlg4["historial-movimientos-dialog.tsx"]
    InvSec --> InvDlg5["imprimir-etiqueta-dialog.tsx"]
    InvDlg5 --> EtPrev["etiqueta-preview.tsx"]

    VtaSec --> VtaTable["components/ventas/ventas-table.tsx"]
    VtaSec --> VtaDlg1["nueva-venta-dialog.tsx"]
    VtaDlg1 --> Carrito["carrito-table.tsx"]
    VtaDlg1 --> PagoF["pago-form.tsx"]
    VtaSec --> VtaDlg2["ticket-dialog.tsx"]
    VtaDlg2 --> TicketP["ticket-preview.tsx"]
    VtaSec --> VtaDlg3["detalle-venta-dialog.tsx"]
```

### Componentes nuevos de Inventario (`components/inventario/`)

| Archivo | Responsabilidad | shadcn/ui que reutiliza |
| --- | --- | --- |
| `inventario-table.tsx` | Tabla principal del catálogo, paginada, con búsqueda *debounced*, filtros, badges de Estado_Stock y menú de acciones por fila. Reemplaza el array hardcoded actual. | `Table`, `Badge`, `Button`, `Input`, `Select`, `DropdownMenu` |
| `producto-form-dialog.tsx` | Diálogo flotante de alta/edición. Hosts `react-hook-form` + `zodResolver(productoSchema)`. Modo dual (`crear` \| `editar`) por prop. | `Dialog`, `Form`, `Input`, `Select`, `Button`, `Label` |
| `eliminar-producto-dialog.tsx` | Confirmación de baja lógica. Muestra `nombre` y `sku`. | `AlertDialog`, `Button` |
| `ajustar-stock-dialog.tsx` | Captura de `tipo` (entrada/salida/merma/devolución/ajuste), `cantidad` y `motivo`. Llama a `POST /api/productos/{id}/ajuste-stock`. | `Dialog`, `Form`, `Select`, `Input`, `Textarea` |
| `historial-movimientos-dialog.tsx` | Listado paginado de `Movimiento_Stock` ordenado por `creado_en DESC`. Renderiza referencia a folio cuando aplica. | `Dialog`, `Table`, `Badge`, `ScrollArea` |
| `imprimir-etiqueta-dialog.tsx` | Selecciona cantidad (1–100) y dispara `window.print()`. Lee `useConfiguracion()` para tamaño. | `Dialog`, `Form`, `Input`, `Button` |
| `etiqueta-preview.tsx` | Render SVG del código de barras con `jsbarcode`. Reutilizable; se renderiza N veces para imprimir N etiquetas. | — (componente puro) |

### Componentes nuevos de Ventas (`components/ventas/`)

| Archivo | Responsabilidad | shadcn/ui que reutiliza |
| --- | --- | --- |
| `ventas-table.tsx` | Tabla histórica de ventas con búsqueda, filtro de fecha y acciones (ver detalle, reimprimir). | `Table`, `Badge`, `Button`, `Calendar`, `Popover`, `Input` |
| `nueva-venta-dialog.tsx` | Diálogo full-screen (con `Dialog` + `max-w-5xl`). Aloja el campo oculto del lector, el carrito y el formulario de pago. | `Dialog`, `Sheet` (alternativa móvil), `Button` |
| `carrito-table.tsx` | Tabla del carrito con cantidad editable (`Input` numérico), botón eliminar, totales pegajosos. Suscrita a `useCarritoVenta`. | `Table`, `Input`, `Button`, `Badge` |
| `pago-form.tsx` | Selector de método de pago, captura de monto recibido, selector de fiador (si `metodo === 'fiado'`). Botón "Cobrar". | `Form`, `RadioGroup`, `Input`, `Select`, `Button`, `Alert` |
| `ticket-dialog.tsx` | Abre el ticket persistido y dispara `window.print()`. Si `imprimir_automaticamente`, se lanza al montar. | `Dialog`, `Button` |
| `ticket-preview.tsx` | Render imprimible del ticket dentro de `.imprimir-ticket`. | — (componente puro) |
| `detalle-venta-dialog.tsx` | Vista de solo lectura del detalle de la venta (ítems, totales, movimientos). | `Dialog`, `Table`, `Badge`, `ScrollArea` |

### Integración con secciones existentes

`inventario-section.tsx` y `ventas-section.tsx` cambian así:

- Se elimina el array de mock data del top del archivo.
- Se vuelven *Server Components* siempre que sea posible para el render inicial,
  marcando como `"use client"` solo los hijos interactivos. Si necesitan estado en
  el shell (filtros), se quedan como Client Components.
- Cada sección importa su tabla principal (`InventarioTable`, `VentasTable`) y los
  diálogos correspondientes y los monta condicionalmente con un estado local
  (`{ tipo: 'crear' | 'editar' | 'eliminar' | ..., productoId?: string }`).
- El handler del botón "Nuevo Producto" / "Nueva Venta" abre el diálogo
  correspondiente. Toda navegación interna sigue siendo *single-page*; las URL no
  cambian.
- Los toasts viajan por `sonner` (ya en `package.json`). Se monta `<Toaster />`
  global en `app/layout.tsx` (única edición global del shell).

### CSS de impresión

Reglas `@media print` específicas se añaden a `app/globals.css`. Se usan dos
*scopes* basados en clases de raíz:

```css
@media print {
  body * { visibility: hidden; }

  .imprimir-etiqueta, .imprimir-etiqueta * { visibility: visible; }
  .imprimir-etiqueta {
    position: absolute; inset: 0;
    width: var(--etiqueta-ancho, 50mm);
    height: var(--etiqueta-alto, 30mm);
  }

  .imprimir-ticket, .imprimir-ticket * { visibility: visible; }
  .imprimir-ticket {
    position: absolute; inset: 0;
    width: var(--ticket-ancho, 80mm);
  }

  @page { margin: 0; }
}

@page etiqueta { size: 50mm 30mm; }
@page ticket   { size: 80mm auto; }
```

`useConfiguracion()` actualiza las CSS vars `--etiqueta-ancho`, `--etiqueta-alto`,
`--ticket-ancho` en el `<html>` cuando cambian en configuración. Esta estrategia
mantiene el resto de la app intacta y evita filtrar estilos a otras vistas.


## Data Models

### Esquema Prisma

Archivo `prisma/schema.prisma`. Se usan UUIDs string (CUIDs sirven igual; aquí
se eligen UUIDv4 vía `@default(uuid())` por compatibilidad con la decisión de
diseño y por simplicidad de depuración).

```prisma
// prisma/schema.prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = []
}

datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}

// ---------- Enums ----------

enum TipoMovimiento {
  entrada
  salida
  merma
  devolucion
  ajuste
  venta
}

enum MetodoPago {
  efectivo
  tarjeta
  transferencia
  fiado
}

enum EstadoVenta {
  completada
  pendiente
  cancelada
}

// ---------- Tablas ----------

model Categoria {
  id         String     @id @default(uuid()) @db.Char(36)
  nombre     String     @unique @db.VarChar(80)
  creado_en  DateTime   @default(now())
  productos  Producto[]

  @@map("categorias")
}

model Producto {
  id              String             @id @default(uuid()) @db.Char(36)
  sku             String             @unique @db.VarChar(32)
  // codigo_barras es UNIQUE pero ADMITE NULL múltiples (MySQL permite NULLs
  // repetidos en índice único). El requisito 2.6 lo formaliza.
  codigo_barras   String?            @unique @db.VarChar(48)
  nombre          String             @db.VarChar(160)
  categoria_id    String?            @db.Char(36)
  categoria       Categoria?         @relation(fields: [categoria_id], references: [id])
  precio_compra   Decimal            @default(0) @db.Decimal(12, 2)
  precio_venta    Decimal            @db.Decimal(12, 2)
  stock_actual    Int                @default(0)
  stock_minimo    Int                @default(0)
  unidad          String             @default("unidad") @db.VarChar(16)
  activo          Boolean            @default(true)
  creado_en       DateTime           @default(now())
  actualizado_en  DateTime           @updatedAt

  movimientos     MovimientoStock[]
  venta_items     VentaItem[]

  @@index([categoria_id])
  @@index([activo, stock_actual])
  @@map("productos")
}

model MovimientoStock {
  id                String         @id @default(uuid()) @db.Char(36)
  producto_id       String         @db.Char(36)
  producto          Producto       @relation(fields: [producto_id], references: [id])
  tipo              TipoMovimiento
  cantidad          Int            // con signo: positivo entrada, negativo salida
  stock_resultante  Int
  motivo            String?        @db.VarChar(240)
  usuario_id        String?        @db.Char(36)
  referencia_id     String?        @db.Char(36) // venta.id cuando tipo='venta'
  creado_en         DateTime       @default(now())

  @@index([producto_id, creado_en])
  @@index([referencia_id])
  @@map("movimientos_stock")
}

model Venta {
  id           String       @id @default(uuid()) @db.Char(36)
  folio        String       @unique @db.VarChar(24)
  subtotal     Decimal      @db.Decimal(12, 2)
  impuesto     Decimal      @db.Decimal(12, 2)
  total        Decimal      @db.Decimal(12, 2)
  metodo_pago  MetodoPago
  fiador_id    String?      @db.Char(36)
  usuario_id   String?      @db.Char(36)
  estado       EstadoVenta  @default(completada)
  creado_en    DateTime     @default(now())

  items        VentaItem[]

  @@index([creado_en])
  @@index([metodo_pago, creado_en])
  @@index([fiador_id])
  @@map("ventas")
}

model VentaItem {
  id              String   @id @default(uuid()) @db.Char(36)
  venta_id        String   @db.Char(36)
  venta           Venta    @relation(fields: [venta_id], references: [id], onDelete: Cascade)
  producto_id     String   @db.Char(36)
  producto        Producto @relation(fields: [producto_id], references: [id])
  cantidad        Int
  precio_unitario Decimal  @db.Decimal(12, 2)
  subtotal_linea  Decimal  @db.Decimal(12, 2)

  @@index([venta_id])
  @@index([producto_id])
  @@map("venta_items")
}

model Configuracion {
  clave           String   @id @db.VarChar(64)
  valor           String   @db.VarChar(255) // se guarda como string, parseo por tipo
  actualizado_en  DateTime @updatedAt

  @@map("configuracion")
}
```

### Mapeo a TypeScript

`Decimal` de Prisma se serializa como string. Antes de salir por la API se convierte
a `number` con `Number(prismaDecimal)` y se redondea con `redondearBancario`. Los
clientes nunca operan con `Decimal`, sólo con `number`. Se centraliza en
`lib/api/serializadores.ts`:

```ts
// lib/api/serializadores.ts
import type { Producto as PProducto, Venta as PVenta } from "@prisma/client"

export type ProductoDTO = {
  id: string
  sku: string
  codigo_barras: string | null
  nombre: string
  categoria_id: string | null
  precio_compra: number
  precio_venta: number
  stock_actual: number
  stock_minimo: number
  unidad: string
  activo: boolean
  creado_en: string  // ISO 8601
  actualizado_en: string
  estado_stock: "En Stock" | "Bajo Stock" | "Crítico"
}

export function toProductoDTO(p: PProducto): ProductoDTO { /* ... */ }
```

`estado_stock` se calcula en backend siguiendo R7 para evitar duplicar la lógica.

### Variables de entorno y `docker-compose.yml`

`.env.example`:

```dotenv
# Conexión Prisma
DATABASE_URL="mysql://invenpro:invenpro@localhost:3306/invenpro?charset=utf8mb4"

# Variables consumidas por docker compose
MYSQL_ROOT_PASSWORD=root_password
MYSQL_DATABASE=invenpro
MYSQL_USER=invenpro
MYSQL_PASSWORD=invenpro

# Zona horaria (R18.6 — folio diario)
TZ=America/Mexico_City
```

`docker-compose.yml`:

```yaml
services:
  mysql:
    image: mysql:8.0
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: ${MYSQL_ROOT_PASSWORD}
      MYSQL_DATABASE: ${MYSQL_DATABASE}
      MYSQL_USER: ${MYSQL_USER}
      MYSQL_PASSWORD: ${MYSQL_PASSWORD}
      TZ: ${TZ:-America/Mexico_City}
    ports:
      - "3306:3306"
    volumes:
      - invenpro_mysql_data:/var/lib/mysql
    healthcheck:
      test: ["CMD", "mysqladmin", "ping", "-h", "localhost", "-u", "root",
             "-p${MYSQL_ROOT_PASSWORD}"]
      interval: 5s
      timeout: 3s
      retries: 12
      start_period: 20s

volumes:
  invenpro_mysql_data:
```

El `start_period: 20s` + `retries: 12` cubren los 30 s del SLA de R1.3.


## API Design

### Envoltorio de respuesta

Toda respuesta sigue uno de dos shapes:

```ts
// Éxito
type Ok<T> = T // 200 / 201

// Error uniforme (4xx / 5xx)
type ApiError = {
  error: {
    codigo: string          // p.ej. SKU_DUPLICADO
    mensaje: string         // mensaje en español
    detalles?: unknown      // para 422 incluye errores por campo
  }
}
```

Específicamente para 422 (validación Zod) — exigido por R21.7 y R25.2:

```ts
type ValidationError = {
  error: {
    codigo: "VALIDACION"
    mensaje: "Los datos enviados no son válidos."
    detalles: { errores: Array<{ campo: string; mensaje: string }> }
  }
}
```

Todos los Route Handlers responden con
`Content-Type: application/json; charset=utf-8` (R21.8) y siempre pasan por
`lib/api/respuestas.ts`.

### Catálogo completo de endpoints

| Método | Path | Request shape (Zod) | Respuesta éxito | Errores definidos | Requisitos |
| --- | --- | --- | --- | --- | --- |
| `GET` | `/api/inventario/resumen` | — | `200 { total, en_stock, bajo_stock, critico }` | `BD_NO_DISPONIBLE` 503 | R8.2 |
| `GET` | `/api/productos` | query `{ q?, categoria_id?, estado?, take=20, skip=0 }` validados | `200 { items: ProductoDTO[], total }` | `VALIDACION` 422, `BD_NO_DISPONIBLE` 503 | R6, R21.1, R24.2 |
| `POST` | `/api/productos` | `crearProductoSchema` | `201 ProductoDTO` | `SKU_DUPLICADO` 409, `CODIGO_BARRAS_DUPLICADO` 409, `CODIGO_BARRAS_INVALIDO` 400, `VALIDACION` 422 | R3, R9 |
| `GET` | `/api/productos/{id}` | path `id: uuid` | `200 ProductoDTO` | `PRODUCTO_NO_ENCONTRADO` 404 | R21.1 |
| `PATCH` | `/api/productos/{id}` | `editarProductoSchema` (sin `stock_actual`) | `200 ProductoDTO` | `USAR_AJUSTE_STOCK` 400, `SKU_DUPLICADO` 409, `CODIGO_BARRAS_DUPLICADO` 409, `CODIGO_BARRAS_INVALIDO` 400, `VALIDACION` 422 | R4 |
| `DELETE` | `/api/productos/{id}` | — | `200 { id, activo: false }` | `PRODUCTO_NO_ENCONTRADO` 404 | R5 |
| `GET` | `/api/productos/por-codigo/{codigo}` | path `codigo` ≤ 48 chars | `200 ProductoDTO` | `PRODUCTO_NO_ENCONTRADO` 404, `CODIGO_BARRAS_INVALIDO` 400 | R11.2, R14, R24.2 |
| `POST` | `/api/productos/{id}/ajuste-stock` | `{ tipo, cantidad>0, motivo? ≤240 }` | `201 { producto, movimiento }` | `STOCK_NEGATIVO` 400, `PRODUCTO_NO_ENCONTRADO` 404, `VALIDACION` 422 | R12 |
| `GET` | `/api/productos/{id}/movimientos` | query `{ take=50, skip=0 }` | `200 { items, total }` | `PRODUCTO_NO_ENCONTRADO` 404 | R13 |
| `GET` | `/api/categorias` | — | `200 Categoria[]` | — | R21.4 |
| `POST` | `/api/categorias` | `{ nombre: 1..80 }` | `201 Categoria` | `VALIDACION` 422, conflicto unique → 409 `CATEGORIA_DUPLICADA` | R21.4 |
| `GET` | `/api/ventas` | query `{ q?, desde?, hasta?, take=20, skip=0 }` | `200 { items: VentaDTO[], total }` | `VALIDACION` 422 | R20 |
| `POST` | `/api/ventas` | `crearVentaSchema` | `201 VentaDTO` | `STOCK_NEGATIVO` 400, `VENTA_FALLIDA` 500, `VENTA_TIMEOUT` 504, `LIMITE_FOLIO_DIARIO` 409, `BD_NO_DISPONIBLE` 503, `VALIDACION` 422 | R14, R15, R16, R17, R18, R25.1 |
| `GET` | `/api/ventas/{id}` | path `id: uuid` | `200 VentaDTO` | 404 | R20.5 |
| `GET` | `/api/configuracion` | — | `200 ConfiguracionMap` | — | R26 |
| `PUT` | `/api/configuracion` | `actualizarConfiguracionSchema` (parcial) | `200 ConfiguracionMap` | `VALIDACION` 422 | R26.3 |

### Esquemas Zod representativos

```ts
// lib/schemas/producto.ts
import { z } from "zod"

export const crearProductoSchema = z.object({
  nombre: z.string().min(1).max(160),
  sku: z.string().min(1).max(32),
  codigo_barras: z.string().max(48).optional().nullable(),
  categoria_id: z.string().uuid().optional().nullable(),
  precio_compra: z.number().nonnegative().default(0),
  precio_venta: z.number().nonnegative(),
  stock_actual: z.number().int().nonnegative().default(0),
  stock_minimo: z.number().int().nonnegative().default(0),
  unidad: z.string().min(1).max(16).default("unidad"),
})

// editar = mismo shape, sin stock_actual y todo opcional
export const editarProductoSchema = crearProductoSchema
  .omit({ stock_actual: true })
  .partial()

// lib/schemas/venta.ts
export const crearVentaSchema = z.object({
  items: z.array(z.object({
    producto_id: z.string().uuid(),
    cantidad: z.number().int().positive(),
    precio_unitario: z.number().nonnegative(),
  })).min(1),
  metodo_pago: z.enum(["efectivo", "tarjeta", "transferencia", "fiado"]),
  monto_recibido: z.number().nonnegative().optional(),
  fiador_id: z.string().uuid().optional(),
}).superRefine((v, ctx) => {
  if (v.metodo_pago === "fiado" && !v.fiador_id) {
    ctx.addIssue({ code: "custom", path: ["fiador_id"],
      message: "Se requiere fiador para venta fiada" })
  }
  if (v.metodo_pago === "efectivo" && v.monto_recibido === undefined) {
    ctx.addIssue({ code: "custom", path: ["monto_recibido"],
      message: "El monto recibido es obligatorio en efectivo" })
  }
})
```

### Manejador centralizado de errores Prisma → HTTP

```ts
// lib/api/errores.ts
import { Prisma } from "@prisma/client"
import { errorConflicto, errorServidor, errorBdNoDisponible } from "./respuestas"

export function mapPrismaError(e: unknown) {
  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    if (e.code === "P2002") {
      // unique constraint failed → 409
      const target = (e.meta?.target as string[] | undefined)?.[0] ?? ""
      if (target.includes("sku")) return errorConflicto("SKU_DUPLICADO")
      if (target.includes("codigo_barras")) return errorConflicto("CODIGO_BARRAS_DUPLICADO")
      if (target.includes("folio")) return errorConflicto("LIMITE_FOLIO_DIARIO")
      return errorConflicto("CONFLICTO")
    }
    if (e.code === "P2025") return errorConflicto("PRODUCTO_NO_ENCONTRADO", 404)
  }
  if (e instanceof Prisma.PrismaClientInitializationError) {
    return errorBdNoDisponible()
  }
  if (e instanceof Prisma.PrismaClientRustPanicError) {
    return errorBdNoDisponible()
  }
  return errorServidor("VENTA_FALLIDA")
}
```

Cada Route Handler envuelve su lógica con `try/catch` y delega:

```ts
// app/api/productos/route.ts
export async function POST(req: Request) {
  return withValidation(crearProductoSchema, req, async (input) => {
    try {
      const producto = await dominio.crearProducto(input)
      return creado(toProductoDTO(producto))
    } catch (e) {
      return mapPrismaError(e)
    }
  })
}
```


## Error Handling

### Catálogo de códigos de error

| Código | HTTP | Origen | Mensaje toast (es) |
| --- | --- | --- | --- |
| `VALIDACION` | 422 | Zod en cualquier endpoint | "Revise los campos marcados." |
| `SKU_DUPLICADO` | 409 | `productos.sku` único | "Ya existe un producto con ese SKU." |
| `CODIGO_BARRAS_DUPLICADO` | 409 | `productos.codigo_barras` único | "Ese código de barras ya pertenece a otro producto." |
| `CODIGO_BARRAS_INVALIDO` | 400 | `validarEan13` / `validarCode128` | "El código de barras no es válido (EAN-13 o Code128)." |
| `STOCK_NEGATIVO` | 400 | Ajuste o venta que dejaría `stock_actual<0` con `permitir_sobreventa=false` | "Stock insuficiente para completar la operación." |
| `USAR_AJUSTE_STOCK` | 400 | PATCH producto con `stock_actual` | "Use Ajuste de stock para modificar inventario." |
| `PRODUCTO_NO_ENCONTRADO` | 404 | Cualquier ruta `{id}` o `por-codigo` sin match | "Producto no encontrado." |
| `VENTA_FALLIDA` | 500 | Excepción dentro de `$transaction` venta | "No se pudo registrar la venta. Intente de nuevo." |
| `VENTA_TIMEOUT` | 504 | `$transaction` que excede `tx.timeout` | "La operación tardó demasiado. Intente nuevamente." |
| `LIMITE_FOLIO_DIARIO` | 409 | Más de 9999 ventas en un día (consecutivo `NNNN`) | "Se alcanzó el límite diario de folios." |
| `BD_NO_DISPONIBLE` | 503 | `PrismaClientInitializationError` o `Rust panic` | "Base de datos no disponible. Revise el servidor." |
| `MISSING_DATABASE_URL` | n/a (boot) | `lib/db.ts` valida en boot | "Configuración inválida: falta DATABASE_URL." |
| `CATEGORIA_DUPLICADA` | 409 | `categorias.nombre` único | "Ya existe una categoría con ese nombre." |
| `CONFLICTO` | 409 | Cualquier P2002 sin clasificar | "Conflicto al guardar." |
| `RED` | n/a (cliente) | `fetch` rechazado | "Error de conexión. Revise el servidor." |

Mapa cliente → toast vive en `lib/mensajes-error.ts`:

```ts
// lib/mensajes-error.ts
export const MENSAJES_ERROR: Record<string, string> = {
  VALIDACION: "Revise los campos marcados.",
  SKU_DUPLICADO: "Ya existe un producto con ese SKU.",
  // ...
  RED: "Error de conexión. Revise el servidor.",
}

export function toastDeError(codigo: string, fallback?: string) {
  return MENSAJES_ERROR[codigo] ?? fallback ?? "Ocurrió un error inesperado."
}
```

### Reglas de manejo

- Toda excepción dentro de un Route Handler pasa por `mapPrismaError`. Nunca se
  filtran stack traces al cliente.
- Errores de validación Zod retornan 422 con `{ errores: [{ campo, mensaje }] }`
  derivado de `error.issues`.
- Errores de red en cliente: `fetchJson()` lanza `RedError` y los componentes hacen
  `toast.error(MENSAJES_ERROR.RED)` conservando el formulario abierto (R25.4).
- Pérdida de conexión durante venta: la transacción se aborta y `mapPrismaError`
  emite `BD_NO_DISPONIBLE`. `lib/log.ts` registra `{ ts, folio_intentado, codigo }`
  en consola servidor (R25.1). El cliente muestra toast y deja el carrito intacto
  para reintentar.
- Cada venta exitosa se registra con `log.info({ folio, total, metodo_pago })` —
  sin datos personales del fiador más allá de `fiador_id` (R25.3).


## Testing Strategy

### Resumen del enfoque dual

- **Pruebas por propiedades** (`fast-check`) para toda la lógica pura crítica:
  generación/validación de códigos de barras, redondeo bancario, totales del
  carrito, atomicidad de venta (con BD de prueba), invariante de stock, folio
  único.
- **Pruebas ejemplares** (Vitest + Testing Library + Mock Service Worker) para
  flujos de UI, integración de Route Handlers y casos específicos.
- **Pruebas de integración** contra una instancia MySQL de prueba (Docker
  ephemeral) para los escenarios donde la atomicidad real importa (R18) y la
  latencia del escaneo (R24).
- **Smoke tests** para configuración de IaC (`docker-compose.yml`,
  `.env.example`, migraciones) y boot del servidor.

### Stack de testing

- `fast-check` para PBT (se añade a `devDependencies`).
- `vitest` como runner.
- `@testing-library/react` + `@testing-library/user-event` para UI.
- `msw` para mockear fetch en tests de cliente.
- `@prisma/client` apuntando a un MySQL ephemeral de Docker (CI) o a un
  schema de prueba local; alternativa: `pg-mem` no aplica (es Postgres),
  por lo que para PBT con BD se usa una BD MySQL nombrada `invenpro_test`
  reseteada con `prisma migrate reset --force` entre suites.

### Convenciones

- Cada propiedad de diseño se implementa con **un único** `test()` por propiedad
  usando `fc.assert(fc.property(...), { numRuns: 100 })`. 100 iteraciones es el
  mínimo (configurable a 1 000 en CI).
- Cada test PBT lleva un comentario de cabecera con la etiqueta:
  `// Feature: inventario-ventas-core, Property N: <título>`
- Los tests viven en `__tests__/property/*.test.ts` (PBT) y
  `__tests__/unit/*.test.ts` / `__tests__/integration/*.test.ts` para el resto.
- `next.config.mjs` no se altera; vitest tiene su propio entorno
  (`vitest.config.ts`).

### Aplicabilidad de PBT

PBT **sí** aplica para esta feature porque hay funciones puras con espacio de
entrada amplio (códigos, números, listas de ítems) y una transacción cuyas
post-condiciones se pueden enunciar universalmente. PBT **no** aplica para los
componentes de UI (Dialogs, Forms) ni para la configuración de IaC; esos se
cubren con unit tests + smoke tests.

### Tabla de propiedades vs. archivo de test

| Propiedad | Archivo |
| --- | --- |
| P1 Round-trip código de barras | `__tests__/property/codigo-barras.test.ts` |
| P2 Idempotencia del DV EAN-13 | `__tests__/property/codigo-barras.test.ts` |
| P3 Suma del carrito | `__tests__/property/carrito.test.ts` |
| P4 Atomicidad de venta | `__tests__/property/venta-atomicidad.test.ts` |
| P5 No-stock-negativo | `__tests__/property/inventario-invariantes.test.ts` |
| P6 Redondeo bancario | `__tests__/property/money.test.ts` |
| P7 Folio único por día | `__tests__/property/folio.test.ts` |
| P8 Validación cantidad de etiquetas | `__tests__/property/etiqueta-cantidad.test.ts` |

## Correctness Properties

*Una propiedad es una característica o comportamiento que debe mantenerse a través de
todas las ejecuciones válidas del sistema; en esencia, una declaración formal de qué
debe hacer el software. Las propiedades sirven como puente entre las especificaciones
legibles para humanos y las garantías de corrección verificables por máquina.*

### Property 1: Round-trip de código de barras

*For all* productos generados por el sistema sin `codigo_barras` explícito, el
código emitido por `generarEan13(prefijo='200')` cumple `validarEan13(codigo) === true`
y, una vez persistido el producto, una consulta a
`GET /api/productos/por-codigo/{codigo}` resuelve al mismo producto que lo originó.
Adicionalmente, para todo `s` alfanumérico con `1 ≤ |s| ≤ 48`,
`validarCode128(s) === true`; para todo `s` con `|s| > 48` o caracteres fuera del
charset Code128, `validarCode128(s) === false`.

**Validates: Requirements 9.1, 9.2, 9.3, 11.1, 11.2**

Generadores fast-check sugeridos:

```ts
const arbProducto = fc.record({
  nombre: fc.string({ minLength: 1, maxLength: 160 }),
  sku: fc.string({ minLength: 1, maxLength: 32 }).filter(s => /^[A-Z0-9-]+$/i.test(s)),
  precio_venta: fc.float({ min: 0.01, max: 1e6, noNaN: true }),
})
const arbCode128 = fc.string({ minLength: 1, maxLength: 48 })
  .filter(s => /^[\x20-\x7E]+$/.test(s))
```

### Property 2: Idempotencia del dígito verificador EAN-13

*For all* secuencias de exactamente 12 dígitos `d ∈ "0..9"^12`,
`validarEan13(d + dvEan13(d)) === true`. Equivalentemente, recalcular el dígito
verificador sobre los primeros 12 dígitos de un EAN-13 generado por el sistema
produce el mismo decimo-tercer dígito.

**Validates: Requirements 9.1, 9.3**

Generador:

```ts
const arb12digits = fc.stringMatching(/^[0-9]{12}$/)
// fast-check actual: fc.string({ minLength: 12, maxLength: 12 })
//                    .filter(s => /^[0-9]{12}$/.test(s))
```

### Property 3: Suma del carrito y unicidad de filas por producto

*For all* listas no vacías `items` con `items[i].cantidad > 0` y
`items[i].precio_unitario ≥ 0`, el cálculo del carrito cumple las tres condiciones
simultáneamente:

1. `subtotal === redondearBancario(Σ precio_unitario × cantidad)`.
2. `|total − (subtotal + impuestos)| < 0.005` con
   `impuestos === redondearBancario(subtotal × porcentaje_impuesto / 100)`.
3. Para toda secuencia de N escaneos sobre un carrito vacío con un conjunto
   `P` de productos distintos, el carrito resultante tiene a lo más `|P|` filas
   y `Σ cantidades === N`.

**Validates: Requirements 14.3, 14.4, 16.1, 16.2, 16.3, 16.4**

Generador:

```ts
const arbItem = fc.record({
  producto_id: fc.uuid(),
  cantidad: fc.integer({ min: 1, max: 999 }),
  precio_unitario: fc.float({ min: 0, max: 1e5, noNaN: true })
    .map(n => Math.round(n * 100) / 100),
})
const arbCarrito = fc.array(arbItem, { minLength: 1, maxLength: 50 })
```

### Property 4: Atomicidad de la venta

*For all* ventas válidas con `N ≥ 1` ítems sobre productos con stock suficiente,
después de un `POST /api/ventas` que retorna `201`:

- existe **exactamente 1** fila en `ventas` con el folio retornado;
- existen **N** filas en `venta_items` referenciando esa venta;
- existen **N** filas en `movimientos_stock` con `tipo='venta'` y
  `referencia_id === venta.id`;
- para cada producto `p` involucrado, `stock_actual_post = stock_actual_pre − cantidad_p`.

*For all* ventas donde se inyecta una falla en cualquier paso intermedio de la
transacción (mock que lanza error tras la N-ésima escritura), después de un
`POST /api/ventas` que retorna `5xx`:

- **0** filas creadas en `ventas`, `venta_items` y `movimientos_stock` para esa
  petición;
- `stock_actual` de cada producto involucrado **no cambia** respecto al snapshot
  pre-petición.

**Validates: Requirements 18.1, 18.4, 18.5**

Generador y estrategia:

```ts
const arbVenta = (productosEnBd: ProductoSeed[]) => fc.array(
  fc.record({
    producto_id: fc.constantFrom(...productosEnBd.map(p => p.id)),
    cantidad: fc.integer({ min: 1, max: 5 }),
  }),
  { minLength: 1, maxLength: 10 }
)
// Para el caso de fallo: usar un PrismaClient extendido cuyo $transaction
// llama a una función que `throw` después de M operaciones aleatorias.
```

### Property 5: Invariante de stock no negativo

*For all* secuencias `S` de operaciones `op ∈ {ajuste(±k), venta(items)}` aplicadas
a un producto `p` con `permitir_sobreventa === false`, partiendo de cualquier
`stock_inicial ≥ 0`, en cualquier estado intermedio o final
`p.stock_actual ≥ 0` y para toda operación que dejaría `stock_actual < 0` el
servidor responde con `400 STOCK_NEGATIVO` y no aplica el cambio.

**Validates: Requirements 12.3, 15.1, 15.2**

Generador:

```ts
const arbOp = fc.oneof(
  fc.record({ tipo: fc.constant("ajuste"), delta: fc.integer({ min: -10, max: 10 }) }),
  fc.record({ tipo: fc.constant("venta"), cantidad: fc.integer({ min: 1, max: 10 }) })
)
const arbHistoria = fc.array(arbOp, { minLength: 0, maxLength: 50 })
```

### Property 6: Redondeo bancario (half-to-even)

*For all* `x ∈ ℝ` con `decimales = 2`, `redondearBancario(x, 2)` cumple:

1. La diferencia con `x` es ≤ 0.005 en valor absoluto.
2. Cuando el dígito a descartar es exactamente 5 y los dígitos posteriores son 0,
   el resultado redondea **al par más cercano**: por ejemplo
   `redondearBancario(2.125) === 2.12` y `redondearBancario(2.135) === 2.14`.
3. La función es idempotente: `redondearBancario(redondearBancario(x)) === redondearBancario(x)`.

**Validates: Requirements 16.5**

Generador:

```ts
const arbHalfCase = fc.tuple(
  fc.integer({ min: -1e6, max: 1e6 }),     // parte entera × 100
  fc.integer({ min: 0, max: 9 })           // dígito centena
).map(([n, d]) => (n + d * 0.1) + 0.005)   // forzar caso half
const arbX = fc.float({ noNaN: true, min: -1e6, max: 1e6 })
```

### Property 7: Folio único e incremental por día

*For all* fechas `d` y para todo conjunto de `K ≥ 2` invocaciones (secuenciales
o concurrentes) a `generarFolio(d)`:

1. Los folios resultantes son **distintos dos a dos**.
2. La parte numérica `NNNN` es **estrictamente creciente** en orden de commit.
3. Todos los folios tienen el formato `VTA-AAAAMMDD-NNNN` con la fecha `d`.
4. Si `K > 9999`, las llamadas que excedan el cupo retornan
   `LIMITE_FOLIO_DIARIO`.

**Validates: Requirements 18.6**

Generador y estrategia:

```ts
const arbFecha = fc.date({ min: new Date("2024-01-01"), max: new Date("2030-12-31") })
const arbK = fc.integer({ min: 2, max: 200 })
// Lanzar K llamadas a generarFolio(d) con Promise.all + transacción Prisma.
```

### Property 8: Validación de cantidad de etiquetas

*For all* `n ∈ ℤ` con `n < 1` o `n > 100`, el formulario
`ImprimirEtiquetaDialog` rechaza el valor con error de validación Zod y no
invoca `window.print()`.

*For all* `n ∈ ℤ` con `1 ≤ n ≤ 100`, el formulario acepta el valor y, al
confirmar, el DOM contiene exactamente `n` instancias del subárbol
`.imprimir-etiqueta` antes de invocar `window.print()`.

**Validates: Requirements 10.4**

Generador:

```ts
const arbNValido = fc.integer({ min: 1, max: 100 })
const arbNInvalido = fc.oneof(
  fc.integer({ max: 0 }),
  fc.integer({ min: 101, max: 1e6 }),
)
```


## Hooks & Client Logic

### `hooks/use-barcode-scanner.ts`

Detección de escáner por *timing* entre teclas. Emite el código completo cuando
detecta `Enter` y todos los `Δt` previos son ≤ `umbralMs`. Mantiene una **cola
FIFO** para no perder escaneos durante un fetch en curso (R24.3).

```ts
// hooks/use-barcode-scanner.ts
"use client"
import { useEffect, useRef } from "react"

export type UseBarcodeScannerOptions = {
  enabled: boolean
  umbralMs?: number          // default 80
  longitudMin?: number       // default 4
  onScan: (codigo: string) => void | Promise<void>
}

export function useBarcodeScanner(opts: UseBarcodeScannerOptions): void {
  const buffer = useRef<string>("")
  const lastTs = useRef<number>(0)
  const cola = useRef<string[]>([])
  const procesando = useRef<boolean>(false)
  const umbral = opts.umbralMs ?? 80
  const min = opts.longitudMin ?? 4

  useEffect(() => {
    if (!opts.enabled) return
    const handler = (ev: KeyboardEvent) => {
      const now = performance.now()
      if (ev.key === "Enter") {
        const codigo = buffer.current
        buffer.current = ""
        const desdeUltima = now - lastTs.current
        lastTs.current = now
        if (codigo.length >= min && desdeUltima <= umbral) {
          cola.current.push(codigo)
          drenar()
        }
        return
      }
      if (ev.key.length === 1) {
        const desdeUltima = now - lastTs.current
        if (desdeUltima > umbral) buffer.current = ""  // reinicio si hay pausa humana
        buffer.current += ev.key
        lastTs.current = now
      }
    }
    async function drenar() {
      if (procesando.current) return
      procesando.current = true
      try {
        while (cola.current.length) {
          const c = cola.current.shift()!
          await opts.onScan(c)
        }
      } finally {
        procesando.current = false
      }
    }
    window.addEventListener("keydown", handler)
    return () => window.removeEventListener("keydown", handler)
  }, [opts.enabled, opts.onScan, umbral, min])
}
```

Foco persistente: `NuevaVentaDialog` mantiene un `<input ref aria-hidden tabIndex=-1>`
pegajoso y se llama `inputRef.current?.focus()` tras cada acción del carrito y al
hacer click en cualquier área del Dialog (`onClick` en el wrapper).

### `hooks/use-debounced-value.ts`

```ts
export function useDebouncedValue<T>(value: T, delay = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), delay)
    return () => clearTimeout(id)
  }, [value, delay])
  return v
}
```

Usado por `inventario-table.tsx` y `ventas-table.tsx` para R6.1 y R20.2.

### `hooks/use-configuracion.ts`

```ts
export type Configuracion = {
  porcentaje_impuesto: number
  etiqueta_ancho_mm: number
  etiqueta_alto_mm: number
  ticket_ancho_mm: number
  imprimir_automaticamente: boolean
  permitir_sobreventa: boolean
}

export const CONFIG_DEFAULTS: Configuracion = {
  porcentaje_impuesto: 0,
  etiqueta_ancho_mm: 50,
  etiqueta_alto_mm: 30,
  ticket_ancho_mm: 80,
  imprimir_automaticamente: false,
  permitir_sobreventa: false,
}

export function useConfiguracion(): { data: Configuracion; refetch: () => void } { /* ... */ }
```

Caché por sesión: el primer fetch popula un `useSyncExternalStore` global o un
`Context` mounted en `app/layout.tsx`. Las modificaciones por `PUT /api/configuracion`
disparan `refetch()`. No se usa SWR para evitar añadir dependencia: la caché casera
es suficiente porque la configuración cambia rara vez.

### `hooks/use-carrito-venta.ts`

Estado y operaciones del carrito en memoria del cliente.

```ts
export type ItemCarrito = {
  producto: ProductoDTO
  cantidad: number
}

export type CarritoTotales = {
  subtotal: number
  impuestos: number
  total: number
}

export type UseCarritoVenta = {
  items: ItemCarrito[]
  totales: CarritoTotales
  agregarOIncrementar(p: ProductoDTO): void
  setCantidad(producto_id: string, cantidad: number): void
  eliminar(producto_id: string): void
  limpiar(): void
  serializarParaApi(): { items: Array<{ producto_id: string; cantidad: number; precio_unitario: number }> }
}
```

`useMemo` recalcula totales en cada render. La complejidad por escaneo es O(N)
(N=ítems en carrito) bien por debajo del SLA de 50 ms (R16.1).
Validación de stock interna usa `producto.stock_actual` y respeta
`permitir_sobreventa`.

### `lib/money.ts`

```ts
// lib/money.ts
/**
 * Redondeo bancario (half-to-even). Para valores donde el dígito a descartar
 * es exactamente 5 y no hay restos, redondea al par más cercano.
 *
 * Implementación libre de FP-error a 2 decimales: trabaja con enteros×10^d.
 */
export function redondearBancario(valor: number, decimales = 2): number {
  if (!Number.isFinite(valor)) return valor
  const factor = 10 ** decimales
  const escalado = valor * factor
  const piso = Math.floor(escalado)
  const resto = escalado - piso
  const eps = 1e-9
  let r: number
  if (resto > 0.5 + eps) r = piso + 1
  else if (resto < 0.5 - eps) r = piso
  else r = piso % 2 === 0 ? piso : piso + 1   // half-to-even
  return r / factor
}
```

Se documenta en JSDoc su uso en `subtotal`, `impuestos`, `total` y en los DTO
serializados a la API.

### `lib/codigo-barras.ts`

```ts
const CHARSET_CODE128 = /^[\x20-\x7E]+$/  // ASCII imprimible

export function dvEan13(d12: string): string {
  // d12 = 12 dígitos
  let suma = 0
  for (let i = 0; i < 12; i++) {
    const n = d12.charCodeAt(i) - 48
    suma += i % 2 === 0 ? n : n * 3
  }
  const mod = suma % 10
  return String((10 - mod) % 10)
}

export function generarEan13(prefijo = "200", rng: () => number = Math.random): string {
  if (!/^\d{1,12}$/.test(prefijo)) throw new Error("Prefijo inválido")
  const restantes = 12 - prefijo.length
  let cuerpo = prefijo
  for (let i = 0; i < restantes; i++) cuerpo += String(Math.floor(rng() * 10))
  return cuerpo + dvEan13(cuerpo)
}

export function validarEan13(s: string): boolean {
  if (!/^\d{13}$/.test(s)) return false
  return dvEan13(s.slice(0, 12)) === s[12]
}

export function validarCode128(s: string): boolean {
  return s.length >= 1 && s.length <= 48 && CHARSET_CODE128.test(s)
}

export function detectarFormato(s: string): "EAN13" | "CODE128" | null {
  if (validarEan13(s)) return "EAN13"
  if (validarCode128(s)) return "CODE128"
  return null
}
```

`detectarFormato` se usa en el endpoint `POST /api/productos` y `PATCH` para
emitir `CODIGO_BARRAS_INVALIDO` cuando ninguno coincide.

## Backend Modules

### `lib/db.ts` — Singleton Prisma

```ts
// lib/db.ts
import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

if (!process.env.DATABASE_URL) {
  console.error("[boot] MISSING_DATABASE_URL: defina DATABASE_URL en el entorno")
  // No usamos throw aquí para que Next pueda iniciar y servir 503 en /api/*
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
```

### `lib/api/respuestas.ts`

```ts
const JSON_HEADERS = { "Content-Type": "application/json; charset=utf-8" } as const

export const ok = <T>(data: T) =>
  new Response(JSON.stringify(data), { status: 200, headers: JSON_HEADERS })

export const creado = <T>(data: T) =>
  new Response(JSON.stringify(data), { status: 201, headers: JSON_HEADERS })

export const errorValidacion = (errores: Array<{ campo: string; mensaje: string }>) =>
  new Response(JSON.stringify({
    error: { codigo: "VALIDACION", mensaje: "Los datos enviados no son válidos.",
             detalles: { errores } }
  }), { status: 422, headers: JSON_HEADERS })

export const errorConflicto = (codigo: string, status = 409, mensaje?: string) =>
  new Response(JSON.stringify({
    error: { codigo, mensaje: mensaje ?? mensajePorCodigo(codigo) }
  }), { status, headers: JSON_HEADERS })

export const errorServidor = (codigo: string, status = 500) =>
  new Response(JSON.stringify({
    error: { codigo, mensaje: mensajePorCodigo(codigo) }
  }), { status, headers: JSON_HEADERS })

export const errorBdNoDisponible = () =>
  errorServidor("BD_NO_DISPONIBLE", 503)
```

### `lib/api/with-validation.ts`

```ts
import type { ZodSchema } from "zod"

export async function withValidation<T>(
  schema: ZodSchema<T>,
  req: Request,
  handler: (input: T) => Promise<Response>
): Promise<Response> {
  let body: unknown
  try { body = await req.json() } catch { body = {} }
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    const errores = parsed.error.issues.map(i => ({
      campo: i.path.join("."),
      mensaje: i.message,
    }))
    return errorValidacion(errores)
  }
  return handler(parsed.data)
}
```

### `lib/dominio/folio.ts`

```ts
// Genera VTA-AAAAMMDD-NNNN dentro de una transacción.
// Usa una columna auxiliar de Configuracion (clave="folio_seq:AAAAMMDD") con
// SELECT ... FOR UPDATE (Prisma `findUnique` + `update` dentro de tx) para
// asegurar atomicidad.

export async function generarFolio(tx: Prisma.TransactionClient, fecha: Date): Promise<string> {
  const yyyymmdd = formatearFechaTz(fecha, "yyyyMMdd", process.env.TZ ?? "America/Mexico_City")
  const clave = `folio_seq:${yyyymmdd}`

  // upsert + increment atómico
  const fila = await tx.configuracion.upsert({
    where: { clave },
    create: { clave, valor: "1" },
    update: { valor: { /* MySQL no soporta increment string; emulamos con select+update */ } },
  })
  // Implementación real: SELECT ... FOR UPDATE seguido de UPDATE.
  // Pseudo-implementación segura con CTE/UPDATE returning:
  //   UPDATE configuracion SET valor = CAST(valor AS UNSIGNED) + 1
  //   WHERE clave = :clave
  // y luego SELECT valor.
  const valor = Number(fila.valor)
  if (valor > 9999) {
    throw new LimiteFolioDiarioError()
  }
  return `VTA-${yyyymmdd}-${String(valor).padStart(4, "0")}`
}
```

Nota: la implementación real usa `tx.$queryRaw` con un `UPDATE ... SET valor = valor + 1`
y un `SELECT ... FOR UPDATE` para evitar carreras. La transacción de venta
llama a `generarFolio(tx, new Date())` dentro del mismo `$transaction`, garantizando
que el folio se asigne junto con la inserción de la venta o se revierta con ella.

### `lib/dominio/inventario.ts`

```ts
export async function crearProducto(input: CrearProductoInput): Promise<Producto> { ... }
export async function editarProducto(id: string, input: EditarProductoInput): Promise<Producto> { ... }
export async function bajaLogica(id: string): Promise<{ id: string; activo: false }> { ... }
export async function ajustarStock(
  id: string,
  input: { tipo: TipoMovimiento; cantidad: number; motivo?: string; usuario_id?: string }
): Promise<{ producto: Producto; movimiento: MovimientoStock }> {
  return prisma.$transaction(async (tx) => {
    const p = await tx.producto.findUniqueOrThrow({ where: { id } })
    const delta = signoPorTipo(input.tipo) * input.cantidad
    const nuevo = p.stock_actual + delta
    if (nuevo < 0) throw new StockNegativoError()
    const actualizado = await tx.producto.update({
      where: { id }, data: { stock_actual: nuevo }
    })
    const movimiento = await tx.movimientoStock.create({
      data: {
        producto_id: id,
        tipo: input.tipo,
        cantidad: delta,
        stock_resultante: nuevo,
        motivo: input.motivo?.slice(0, 240),
        usuario_id: input.usuario_id ?? null,
      }
    })
    return { producto: actualizado, movimiento }
  })
}
```

### `lib/dominio/ventas.ts`

```ts
export async function registrarVenta(input: CrearVentaInput): Promise<Venta> {
  return prisma.$transaction(async (tx) => {
    // 1) lock pesimista de los productos involucrados (evita carreras de stock)
    const productos = await tx.$queryRaw<Producto[]>`
      SELECT * FROM productos
       WHERE id IN (${Prisma.join(input.items.map(i => i.producto_id))})
       FOR UPDATE
    `
    const cfg = await leerConfiguracionTx(tx)

    // 2) validar stock por ítem
    for (const it of input.items) {
      const p = productos.find(x => x.id === it.producto_id)
      if (!p) throw new ProductoNoEncontradoError()
      const restante = p.stock_actual - it.cantidad
      if (restante < 0 && !cfg.permitir_sobreventa) throw new StockNegativoError()
    }

    // 3) calcular totales con redondeo bancario en servidor (defensa en profundidad)
    const subtotal = redondearBancario(
      input.items.reduce((acc, it) => acc + it.cantidad * it.precio_unitario, 0)
    )
    const impuesto = redondearBancario(subtotal * cfg.porcentaje_impuesto / 100)
    const total = redondearBancario(subtotal + impuesto)

    // 4) folio único atómico
    const folio = await generarFolio(tx, new Date())

    // 5) insertar venta + items + movimientos + actualizar stock
    const venta = await tx.venta.create({
      data: {
        folio, subtotal, impuesto, total,
        metodo_pago: input.metodo_pago,
        fiador_id: input.fiador_id ?? null,
        usuario_id: input.usuario_id ?? null,
        estado: "completada",
        items: {
          create: input.items.map(it => ({
            producto_id: it.producto_id,
            cantidad: it.cantidad,
            precio_unitario: it.precio_unitario,
            subtotal_linea: redondearBancario(it.cantidad * it.precio_unitario),
          }))
        }
      },
      include: { items: true },
    })

    for (const it of input.items) {
      const p = productos.find(x => x.id === it.producto_id)!
      const nuevo = p.stock_actual - it.cantidad
      await tx.producto.update({
        where: { id: p.id }, data: { stock_actual: nuevo }
      })
      await tx.movimientoStock.create({
        data: {
          producto_id: p.id,
          tipo: "venta",
          cantidad: -it.cantidad,
          stock_resultante: nuevo,
          motivo: `Venta ${folio}`,
          referencia_id: venta.id,
          usuario_id: input.usuario_id ?? null,
        }
      })
    }

    return venta
  }, { timeout: 5_000 })
}
```

**Cómo se asegura atomicidad**:
- Todo va dentro de `prisma.$transaction(async tx => ...)` con `timeout: 5000` ms.
  Si excede, Prisma aborta y se mapea a `VENTA_TIMEOUT` (504).
- `SELECT ... FOR UPDATE` sobre los productos bloquea sus filas durante toda la
  transacción, evitando que dos cajeros vendan la última unidad simultáneamente.
- Cualquier `throw` (incluido `StockNegativoError`, `LimiteFolioDiarioError`)
  fuerza rollback de toda la transacción: ni la venta, ni los items, ni los
  movimientos, ni el cambio de stock se persisten.
- La generación de folio comparte la misma `tx`, por lo que el contador
  `folio_seq:AAAAMMDD` también se revierte si la venta falla.

**Manejo del límite diario de folio**:
- El generador eleva `LimiteFolioDiarioError` cuando el contador supera 9999.
- `mapPrismaError` no aplica aquí (es un dominio error). El handler superior
  hace `errorConflicto("LIMITE_FOLIO_DIARIO", 409)`.
- En la práctica esto es un escenario de saturación; el operador deberá
  esperar al siguiente día o el sistema puede ampliar a `NNNNNN` con migración.


## Hardware Integration

### Lector de código de barras (USB-HID)

El lector emula un teclado y emite los caracteres del código seguido de `Enter`.
La detección y disambiguación humano vs. escáner se hace **íntegramente en el
cliente**:

- Hook responsable: `useBarcodeScanner` (definido arriba).
- **Disambiguación por timing**: si todos los `keydown` consecutivos tienen
  `Δt ≤ 80 ms` y la secuencia termina en `Enter`, se trata como un escaneo. Una
  pausa > 80 ms reinicia el buffer (el humano nunca alcanza esa cadencia).
- **Buffer global**: el listener vive en `window` y sólo se activa cuando
  `enabled === true` (es decir, cuando `NuevaVentaDialog` está abierto). Otros
  inputs del dialog (`Input` de monto recibido, `Select` de método de pago) no
  lo afectan porque su lógica usa el evento sintético de React; el listener
  global lee del `keydown` nativo y no interfiere con los inputs visibles.
- **Foco persistente del campo oculto**: `NuevaVentaDialog` mantiene un
  `<input className="sr-only" tabIndex={-1} aria-hidden ref={hiddenRef} />`. Tras
  cualquier interacción (agregar al carrito, cambiar cantidad, error de
  escaneo, click en cualquier área del Dialog), el dialog refoca con
  `requestAnimationFrame(() => hiddenRef.current?.focus())`. La asignación de
  foco se cumple en menos de 100 ms (R14.6) — generalmente en el siguiente frame
  (~16 ms).
- **Cola FIFO**: la propiedad `cola.current` retiene los códigos escaneados
  mientras un `fetch` previo está en vuelo, garantizando R24.3.
- **Configuración**: `umbralMs` y `longitudMin` son props del hook; en
  `NuevaVentaDialog` se pasan los valores por defecto (80 ms, 4 caracteres).

### Impresora térmica (etiquetas y tickets)

InvenPro no integra un driver nativo: delega en el cuadro de diálogo de impresión
del sistema operativo, que el usuario ya configurará para usar la impresora
térmica conectada. Esto cubre etiquetas (50×30 mm) y tickets (80 mm).

- **Renderización del código de barras como SVG**:
  Elegimos **`jsbarcode`** (instalado vía `pnpm add jsbarcode`).
  Razones:
  - Mantenido y estable (>1M downloads/semana).
  - Genera SVG/Canvas en cliente, sin red, sin servicios externos (cumple R10.2).
  - Soporta EAN-13 y Code128 nativamente.
  - Tipos vía `@types/jsbarcode`.
  - Alternativa considerada: `bwip-js`. Es más completa (más simbologías) pero
    pesa más y aporta poco para nuestros dos formatos. Se descarta para
    minimizar el bundle.

  Wrapper:

  ```tsx
  // components/inventario/etiqueta-preview.tsx
  "use client"
  import { useEffect, useRef } from "react"
  import JsBarcode from "jsbarcode"

  export function EtiquetaPreview({ producto }: { producto: ProductoDTO }) {
    const ref = useRef<SVGSVGElement>(null)
    useEffect(() => {
      if (!ref.current || !producto.codigo_barras) return
      JsBarcode(ref.current, producto.codigo_barras, {
        format: producto.codigo_barras.length === 13 ? "EAN13" : "CODE128",
        height: 40, displayValue: true, fontSize: 10, margin: 2,
      })
    }, [producto.codigo_barras])
    return (
      <div className="imprimir-etiqueta">
        <p className="text-xs font-medium truncate">{producto.nombre}</p>
        <svg ref={ref} />
        <p className="text-sm font-bold">${producto.precio_venta.toFixed(2)}</p>
      </div>
    )
  }
  ```

- **CSS de impresión**: descrito en la sección Components and Interfaces > "CSS de impresión".
  Para imprimir N etiquetas, `ImprimirEtiquetaDialog` renderiza N copias de
  `EtiquetaPreview` dentro de un contenedor `.imprimir-etiqueta-grid`, y el
  estilo de impresión hace `page-break-after: always` después de cada una.

- **Ticket**: `TicketPreview` envuelve su contenido en `.imprimir-ticket`, y la
  hoja de impresión usa `@page { size: 80mm auto; margin: 0; }`. Si
  `imprimir_automaticamente === true`, `TicketDialog` invoca `window.print()`
  desde `useEffect` al montar.

## Configuration & Bootstrapping

### Migraciones

```bash
pnpm prisma migrate dev --name init     # genera prisma/migrations/<ts>_init/
pnpm prisma migrate deploy              # aplica en producción
```

### Seed

`prisma/seed.ts`:

```ts
import { prisma } from "@/lib/db"

async function main() {
  // Categorías base
  for (const nombre of ["General", "Bebidas", "Alimentos", "Limpieza", "Otros"]) {
    await prisma.categoria.upsert({
      where: { nombre }, create: { nombre }, update: {},
    })
  }
  // Configuración por defecto
  const cfg: Record<string, string> = {
    porcentaje_impuesto: "0",
    etiqueta_ancho_mm: "50",
    etiqueta_alto_mm: "30",
    ticket_ancho_mm: "80",
    imprimir_automaticamente: "false",
    permitir_sobreventa: "false",
  }
  for (const [clave, valor] of Object.entries(cfg)) {
    await prisma.configuracion.upsert({
      where: { clave }, create: { clave, valor }, update: {},
    })
  }
}
main().finally(() => prisma.$disconnect())
```

Registrado en `package.json`:

```json
"prisma": { "seed": "tsx prisma/seed.ts" }
```

### Comando único

```bash
pnpm db:setup
```

equivalente a:

```jsonc
// package.json scripts
{
  "db:up": "docker compose up -d",
  "db:migrate": "prisma migrate deploy",
  "db:seed": "prisma db seed",
  "db:setup": "pnpm db:up && pnpm db:migrate && pnpm db:seed"
}
```

## Performance Considerations

### Índices Prisma

Ya declarados en el schema. Se añaden por motivo:

- `productos.sku` — `@unique`. Búsqueda directa por SKU.
- `productos.codigo_barras` — `@unique` (R24.4). Hot path de escaneo (R24.2).
- `productos(categoria_id)` — filtro de catálogo por categoría (R6.2).
- `productos(activo, stock_actual)` — composite para resumen (R8.2) y
  conteo por estado.
- `ventas.folio` — `@unique`. Lookup por folio.
- `ventas(creado_en)` — listado por rango de fechas (R20.3).
- `ventas(metodo_pago, creado_en)` — agregaciones por método.
- `ventas(fiador_id)` — listado por fiador.
- `movimientos_stock(producto_id, creado_en)` — historial por producto (R13).
- `movimientos_stock(referencia_id)` — lookup desde una venta para detalle.
- `venta_items(venta_id)` y `venta_items(producto_id)` — joins frecuentes.

### Paginación

Para 10k filas (R6.5, R24.2 mencionan ese tamaño), `take`/`skip` con `LIMIT/OFFSET`
es suficientemente rápido (`<50 ms`). No se introduce paginación por cursor
todavía; si el catálogo crece a 100k+ se migrará a `cursor` por `id`.

### Caché de configuración

`useConfiguracion` mantiene un único `Context` global con TTL infinito durante
la sesión. Las mutaciones (`PUT /api/configuracion`) lo invalidan localmente.
Esto evita 1 fetch por cada Dialog que necesita `etiqueta_*` o
`porcentaje_impuesto`.

### Pre-warm del cliente Prisma

`lib/db.ts` exporta el singleton; en desarrollo se cachea en `globalThis.prisma`
para soportar HMR sin reabrir conexiones.

### SLA de respuesta

- `GET /api/productos/por-codigo/{codigo}`: índice + Prisma single-row → p95 < 30 ms,
  cumple R24.2 (<150 ms p95).
- `POST /api/ventas`: p95 < 200 ms para un carrito de hasta 20 ítems.

## Security & Validation

- **Toda entrada externa pasa por Zod** dentro de `withValidation`. No hay
  acceso a `req.body` sin parseo. Esto incluye query params y path params
  (validados a mano con `z.string().uuid()` antes de la query a Prisma).
- **Sin SQL crudo en endpoints**. Las únicas excepciones son `SELECT ... FOR UPDATE`
  y el `UPDATE` atómico del contador de folio, ambos parametrizados con
  `Prisma.sql` y nunca interpolando string del usuario.
- **Sanitización**: `motivo` se trunca a 240 caracteres en el dominio antes de
  persistir (defensa frente a payloads que se pasen por Zod con un `max(240)`
  ausente). Strings de búsqueda (`q`) se pasan a Prisma con `contains` (que
  hace escaping interno).
- **Variables de entorno**: `DATABASE_URL` es **obligatoria**. Si falta:
  - en boot, `lib/db.ts` registra `MISSING_DATABASE_URL` en consola (R1.7);
  - cualquier endpoint que toque BD responde `503 BD_NO_DISPONIBLE`.
  - `TZ` por defecto `America/Mexico_City` si no está definida (ver Open
    Questions).
- **Sin autenticación todavía**: `usuario_id` es nullable en `ventas` y
  `movimientos_stock`. Cuando se agregue auth, los handlers leerán el id de
  usuario del request y lo persistirán; el schema ya está preparado.
- **Headers de respuesta**: `Content-Type: application/json; charset=utf-8`
  forzado por `lib/api/respuestas.ts` (R21.8).

## Migration & Rollout Plan

1. **Instalar dependencias** (sin afectar el lockfile más allá de lo necesario):

   ```bash
   pnpm add prisma @prisma/client jsbarcode date-fns-tz
   pnpm add -D fast-check vitest @vitest/ui @testing-library/react \
                @testing-library/user-event msw @types/jsbarcode tsx
   ```

   `zod` y `@hookform/resolvers` ya están en `package.json`.

2. **Inicializar Prisma**:

   ```bash
   pnpm prisma init --datasource-provider mysql
   ```

   Reescribir `prisma/schema.prisma` con el bloque definido en *Data Models*.

3. **Levantar Docker**: copiar `.env.example` → `.env`, ejecutar `pnpm db:up`.

4. **Crear migración inicial**: `pnpm prisma migrate dev --name init`.

5. **Sembrar datos**: `pnpm db:seed`.

6. **Implementar capa lib** en orden:
   1. `lib/db.ts` (singleton Prisma).
   2. `lib/log.ts` (logger).
   3. `lib/money.ts` y `lib/codigo-barras.ts` (puros, con sus PBT P2/P6 desde el inicio).
   4. `lib/api/respuestas.ts`, `lib/api/with-validation.ts`, `lib/api/errores.ts`.
   5. `lib/dominio/folio.ts` (con su PBT P7).
   6. `lib/dominio/inventario.ts` (con PBT P5 una vez exista la BD de prueba).
   7. `lib/dominio/ventas.ts` (con PBT P4 al final).

7. **Endpoints**: implementar los Route Handlers en orden:
   1. `/api/productos`, `/api/productos/[id]`.
   2. `/api/productos/por-codigo/[codigo]` (asegura PBT P1).
   3. `/api/productos/[id]/ajuste-stock`, `/api/productos/[id]/movimientos`.
   4. `/api/categorias`, `/api/inventario/resumen`.
   5. `/api/ventas`, `/api/ventas/[id]`.
   6. `/api/configuracion`.

8. **UI por módulo, comenzando por Inventario**:
   1. Sustituir el array hardcoded de `inventario-section.tsx` por
      `inventario-table.tsx` consumiendo `/api/productos`.
   2. Añadir `producto-form-dialog.tsx`, `eliminar-producto-dialog.tsx`.
   3. Añadir `ajustar-stock-dialog.tsx`, `historial-movimientos-dialog.tsx`.
   4. Añadir `imprimir-etiqueta-dialog.tsx` + `etiqueta-preview.tsx`.
   5. Tarjetas resumen: cablear con `/api/inventario/resumen`.

9. **UI Ventas**:
   1. Sustituir el array hardcoded de `ventas-section.tsx` por
      `ventas-table.tsx`.
   2. Añadir `nueva-venta-dialog.tsx` + `carrito-table.tsx` + `pago-form.tsx`.
   3. Cablear `useBarcodeScanner` (con su test PBT del algoritmo de timing).
   4. `ticket-dialog.tsx` + `ticket-preview.tsx` con CSS de impresión.
   5. `detalle-venta-dialog.tsx`.

10. **Configuración**: extender `configuracion-section.tsx` con los seis
    parámetros de R26.2 cableados a `/api/configuracion`.

11. **Tests PBT** ya cubren P1..P8 al cierre de cada módulo. La suite corre con
    `pnpm test --run`.

12. **Smoke de boot**: verificar `MISSING_DATABASE_URL` y `pnpm db:setup` en
    máquina limpia.

## Open Questions / Assumptions

1. **Zona horaria**: el folio depende de la fecha local. Asumimos que el
   servidor exporta `TZ=America/Mexico_City` (definido en
   `docker-compose.yml` y en `.env.example`). Si el deploy se hace en Vercel,
   la TZ del runtime es UTC; el código de `lib/dominio/folio.ts` calcula la
   fecha local con `date-fns-tz` (`formatInTimeZone`) leyendo `process.env.TZ`
   con fallback a `America/Mexico_City`. Si el cliente requiere otra zona
   horaria, sólo cambia la variable.
2. **Single-tenant**: no hay concepto de "empresa" o "tienda". Todas las tablas
   son globales. Si se requiere multi-tenant en el futuro, habrá que añadir
   `tienda_id` a `productos`, `ventas` y `movimientos_stock` y a sus índices
   compuestos.
3. **Sin autenticación todavía**: `usuario_id` es nullable. Cuando se integre
   auth (NextAuth, Clerk u otra), los handlers extraerán el `id` y lo pasarán
   a la capa de dominio. El schema ya está listo.
4. **Impresora compartida del SO**: no hay integración nativa con la impresora.
   Confiamos en `window.print()` y en que el usuario configure su impresora
   térmica como predeterminada o seleccione la correcta en el cuadro de diálogo
   nativo. No se prevé soporte de WebUSB/WebHID en esta feature.
5. **Caché de cliente in-memory por sesión**: `useConfiguracion` no persiste en
   `localStorage`. Recargar la página vuelve a hacer el fetch inicial. Es
   intencional: la fuente de verdad es la BD y la latencia es despreciable.
6. **Decimal vs. number**: la API expone `number` (ya redondeado). Se acepta la
   pérdida de precisión a 2 decimales. Si el negocio requiere 4+ decimales en
   el futuro, se migrará a strings o `bigint` en centavos.
7. **`fast-check` en el cliente**: las propiedades de UI (P8) se ejecutan con
   `vitest` + `@testing-library/react` + `jsdom`; PBT del algoritmo de timing
   del lector usa `vi.useFakeTimers()` para simular `performance.now()`.
8. **Bordes del lector USB-HID**: algunos lectores configuran el sufijo como
   `Tab` en vez de `Enter`. Asumimos `Enter` por defecto. Si el cliente reporta
   un caso distinto, `useBarcodeScanner` puede aceptar un prop `sufijo`.

## Trazabilidad Requisitos → Diseño

| Requisito | Sección(es) de diseño que lo cubren |
| --- | --- |
| **R1** Infraestructura BD contenerizada | Data Models > `docker-compose.yml`, Configuration & Bootstrapping, Security & Validation (`MISSING_DATABASE_URL`) |
| **R2** Modelo de datos del producto | Data Models > schema Prisma, API Design (Zod schemas), Error Handling (SKU/CODIGO duplicados) |
| **R3** Crear producto desde dialog | Components and Interfaces > `producto-form-dialog.tsx`, API Design `POST /api/productos`, Architecture > Flujo A |
| **R4** Editar producto | Components and Interfaces > `producto-form-dialog.tsx` (modo editar), API Design `PATCH`, Error `USAR_AJUSTE_STOCK` |
| **R5** Eliminar con confirmación | Components and Interfaces > `eliminar-producto-dialog.tsx`, API `DELETE` (soft) |
| **R6** Búsqueda y filtrado | Hooks > `useDebouncedValue`, API `GET /api/productos`, Performance > Índices |
| **R7** Estado de stock | Data Models > `toProductoDTO.estado_stock`, Testing Strategy (cubierto por unit tests) |
| **R8** Tarjetas resumen | API `GET /api/inventario/resumen`, Components and Interfaces > `inventario-section.tsx` |
| **R9** Generación EAN-13 | `lib/codigo-barras.ts`, Property 1, Property 2 |
| **R10** Vista previa e impresión etiqueta | Components and Interfaces > `imprimir-etiqueta-dialog.tsx` + `etiqueta-preview.tsx`, Hardware Integration > Impresora, Property 8 |
| **R11** Round-trip código | API `GET /api/productos/por-codigo`, Property 1 |
| **R12** Ajuste manual de stock | `lib/dominio/inventario.ts > ajustarStock`, API `POST /ajuste-stock`, Property 5 |
| **R13** Historial movimientos | Components and Interfaces > `historial-movimientos-dialog.tsx`, API `GET /movimientos` |
| **R14** Carrito por escaneo | Hooks > `useBarcodeScanner`, `useCarritoVenta`, Components and Interfaces > `nueva-venta-dialog.tsx`, Property 3 (unicidad), Architecture > Flujo B |
| **R15** Validación de stock al agregar | `useCarritoVenta`, Property 5 |
| **R16** Cálculo subtotal/impuestos/total | `useCarritoVenta`, `lib/money.ts`, Property 3, Property 6 |
| **R17** Método de pago | Components and Interfaces > `pago-form.tsx`, Zod `crearVentaSchema.superRefine` |
| **R18** Persistencia atómica | `lib/dominio/ventas.ts > registrarVenta`, `lib/dominio/folio.ts`, Architecture > Flujo C, Property 4, Property 7 |
| **R19** Ticket | Components and Interfaces > `ticket-dialog.tsx` + `ticket-preview.tsx`, Hardware Integration > Impresora, CSS de impresión |
| **R20** Listado/búsqueda/reimpresión ventas | Components and Interfaces > `ventas-table.tsx`, `detalle-venta-dialog.tsx`, API `GET /api/ventas` |
| **R21** Endpoints API | API Design (tabla completa) |
| **R22** Sistema de diseño existente | Components and Interfaces (todas reutilizan shadcn/ui, sin nuevas libs UI) |
| **R23** Notificaciones, accesibilidad, i18n | Error Handling > toasts en español, Components and Interfaces (aria-labels), Hardware (foco persistente) |
| **R24** Rendimiento escaneo | Hooks > `useBarcodeScanner` (cola FIFO), Performance > Índices `codigo_barras` |
| **R25** Errores y observabilidad | Error Handling, `lib/log.ts`, `mapPrismaError` |
| **R26** Configuración parametrizable | Hooks > `useConfiguracion`, API `/api/configuracion`, Configuration & Bootstrapping > seed |
