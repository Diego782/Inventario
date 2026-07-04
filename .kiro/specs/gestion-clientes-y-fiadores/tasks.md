# Implementation Plan: Gestión de Clientes y Fiadores

## Overview

Plan de implementación incremental para `gestion-clientes-y-fiadores`. Cada tarea hoja es autocontenida, pequeña y verificable, y se apoya en las tareas previas hasta terminar cableando la UI con los endpoints. El orden respeta las dependencias técnicas de `design.md`: primero la migración aditiva del esquema, luego los bug fixes de bajo riesgo, después la lógica de dominio (funciones puras y módulos nuevos), a continuación los endpoints/serializadores/schemas, y finalmente la UI. Las pruebas basadas en propiedades (PBT) se escriben junto a la implementación que validan para detectar errores temprano.

Se construye **sobre** el core existente (`inventario-ventas-core`, `dashboard-metricas-notificaciones`): se reutilizan `redondearBancario`, los helpers de `lib/api/respuestas.ts`, `withValidation`, `mapPrismaError`, el singleton `prisma`, `resolverContexto` y los patrones de `__tests__/property/` y `__tests__/integration/`. No se introducen librerías nuevas.

Stack: **Next.js 16 + React 19 + TypeScript 5.7 + Prisma + MySQL + Zod + react-hook-form + shadcn/ui + react-day-picker + date-fns + sonner + fast-check + vitest**.

Convenciones de este plan:

- `_Requirements: X.Y_` referencia criterios de aceptación de `requirements.md`.
- `_Properties: N_` referencia una propiedad de `design.md` § Correctness Properties.
- Las sub-tareas marcadas con `*` son opcionales (tests de ejemplo, integración, smoke, render); pueden saltarse para un MVP más rápido.
- Las **PBT (Property N) son obligatorias** (no llevan `*`) porque `design.md` exige cubrir las 24 propiedades canónicas.
- Cada PBT usa **fast-check** con **mínimo 100 iteraciones** (`{ numRuns: 100 }`) y una cabecera con el formato: `// Feature: gestion-clientes-y-fiadores, Property N: {texto}`.
- Rutas TypeScript usan los aliases `@/lib`, `@/components`, `@/components/ui`, `@/hooks`.

## Tasks

## Fase 1 — Migración Prisma aditiva y retrocompatible (Req 11)

- [x] 1. Esquema Prisma y migración de Clientes y Deuda
  - [x] 1.1 Añadir modelos `Cliente`, `MovimientoDeuda`, enum y columnas nullable en `Venta`
    - En `prisma/schema.prisma` añade el `enum TipoMovimientoDeuda { cargo abono }` y los modelos `Cliente` y `MovimientoDeuda` exactamente como en `design.md` § Data Models: `Cliente` con `@@unique([organizacion_id, cedula])`, `@@index([organizacion_id])`, `@@map("clientes")`, campos `cedula @db.VarChar(20)`, `nombre @db.VarChar(100)`, `telefono @db.VarChar(15)`, `correo String? @db.VarChar(254)`, `direccion String? @db.VarChar(240)`; `MovimientoDeuda` con `monto @db.Decimal(12,2)`, `venta_id String? @db.Char(36)`, `plazo_deuda DateTime?`, `fecha`, y los `@@index([organizacion_id])`, `@@index([cliente_id, fecha])`, `@@index([venta_id])`, `@@map("movimientos_deuda")`.
    - En `Venta` añade **solo de forma aditiva** las columnas nullable `cliente_id String? @db.Char(36)`, `cliente Cliente? @relation(...)`, `plazo_deuda DateTime?` y `@@index([cliente_id])`, sin eliminar ni volver obligatoria ninguna columna existente. En `Organizacion` añade las back-relations `clientes Cliente[]` y `movimientos_deuda MovimientoDeuda[]`.
    - Aceptación: `pnpm exec prisma format` no corrige errores y `pnpm exec prisma validate` retorna OK.
    - _Requirements: 11.2, 11.4, 11.5, 11.6, 4.11, 6.4_

  - [x] 1.2 Generar y aplicar la migración `clientes-y-deuda`
    - Con MySQL levantado, ejecuta `pnpm exec prisma migrate dev --name clientes_y_deuda --create-only` y verifica que el SQL sea puramente aditivo: `CREATE TABLE clientes` con `UNIQUE KEY (organizacion_id, cedula)`, `CREATE TABLE movimientos_deuda`, y `ALTER TABLE ventas ADD COLUMN cliente_id ... NULL`, `ADD COLUMN plazo_deuda DATETIME NULL` con su `FOREIGN KEY` a `clientes(id)`. Confirma que no hay `DROP` ni `MODIFY` de columnas existentes. Aplica con `pnpm exec prisma migrate deploy` y regenera el cliente con `pnpm exec prisma generate`.
    - Aceptación: `pnpm exec prisma migrate status` reporta `Database schema is up to date` y los tipos `Cliente` y `MovimientoDeuda` están disponibles en `@prisma/client`.
    - _Requirements: 11.1, 11.4, 11.7, 11.8_

  - [x] 1.3 Smoke test de la migración aditiva y retrocompatible
    - Crea `__tests__/integration/migracion-clientes-deuda-smoke.test.ts` siguiendo el patrón de `migracion-multitenant-smoke.test.ts`: siembra Productos, Ventas (incluyendo una en estado "fiado" sin `cliente_id`), ítems de venta, movimientos de stock y notificaciones; captura los conteos, aplica/verifica la migración y confirma que los conteos son idénticos y que la venta fiada histórica sigue existiendo, válida y con `cliente_id` NULL (Req 11.1, 11.3). Marca `describe.skip` si `SKIP_DB_TESTS=1`.
    - Aceptación: `pnpm test:run __tests__/integration/migracion-clientes-deuda-smoke.test.ts` pasa con BD activa.
    - _Requirements: 11.1, 11.3, 11.5_

  - [x] 1.4 Test de verificación de esquema e idempotencia
    - En el mismo archivo (o `__tests__/integration/esquema-clientes-deuda.test.ts`) verifica vía `information_schema` que `ventas.cliente_id` y `ventas.plazo_deuda` son nullable, que `clientes` y `movimientos_deuda` tienen columna `organizacion_id` indexada y el índice único `(organizacion_id, cedula)`; y que reaplicar `prisma migrate deploy` sobre la BD ya migrada no duplica tablas ni altera datos (idempotencia).
    - Aceptación: el test pasa con BD activa (`describe.skip` si `SKIP_DB_TESTS=1`).
    - _Requirements: 11.2, 11.4, 11.5, 11.6, 11.8_

## Fase 2 — Bug fix: aislamiento multi-tenant en métricas y rankings (Req 1)

- [x] 2. Propagar `organizacion_id` a todas las agregaciones del dashboard
  - [x] 2.1 Corregir `lib/dominio/metricas.ts` para filtrar por `organizacion_id`
    - Modifica `agregarMetricas`/`calcularMetricas` para recibir `organizacion_id` como parámetro obligatorio y añadirlo al `where` de **todas** las consultas: `venta.findMany`, `ventaItem.findMany` (vía `venta: { organizacion_id }` o columna directa) y `movimientoStock.findMany` (devoluciones). Asegura que ganancia estimada, gastos y devoluciones se calculen solo con registros del tenant. Si no hay `organizacion_id`, la función asume que el guard de `resolverContexto` ya devolvió error antes (Req 1.4). Devuelve cero cuando el tenant no tiene registros (Req 1.6).
    - _Requirements: 1.1, 1.3, 1.5, 1.6_

  - [x] 2.2 Corregir `lib/dominio/rankings.ts` para filtrar por `organizacion_id`
    - Modifica `calcularRankings` para recibir `organizacion_id` y aplicarlo a `ventaItem.findMany`, `producto.findMany` (afecta `topMargin` y `lowRotation`) y `movimientoStock.findMany`. Sin registros del tenant → rankings vacíos y `lowRotation` con productos activos del tenant y cero salidas (Req 1.6).
    - _Requirements: 1.2, 1.5, 1.6_

  - [x] 2.3 Tests de ejemplo de aislamiento y guard sin organización
    - Añade tests que siembren dos organizaciones y verifiquen que las métricas/rankings de una no incluyen registros de la otra, y que una petición sin organización activa resuelta responde con error de autorización sin devolver métricas (Req 1.4).
    - _Requirements: 1.4_

## Fase 3 — Bug fix: filtro por talla en Inventario (Req 3)

- [x] 3. Corregir el filtro por talla en `lib/dominio/inventario.ts`
  - [x] 3.1 Normalizar talla y buscar en raíz + variantes sin duplicados
    - Añade un helper `normalizarTalla(valor)` (`trim().toLowerCase()`) y valida que la longitud tras `trim` no exceda 20 caracteres, lanzando un error de validación en caso contrario (Req 3.7). En `listarProductos`, reemplaza `where.talla = talla` por `where.OR = [{ talla: <insensitive> }, { variantes: { some: { talla: <insensitive> } } }]`, combinado con el resto de filtros mediante AND y acotado por `organizacion_id`. `findMany` sobre `Producto` devuelve cada producto una sola vez (el `some` no multiplica filas). Sin filtro de talla → sin restricción (Req 3.6); sin coincidencias → lista vacía sin error (Req 3.3).
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7_

  - [x] 3.2 Escribir el PBT del filtro por talla (Property 4)
    - Crea `__tests__/property/clientes-fiadores-filtro-talla.test.ts` con `fc.assert(..., { numRuns: 100 })`: genera un catálogo aleatorio (productos con `talla` de raíz y/o variantes con distintos casing y espacios) y un valor de talla; verifica que el resultado contiene exactamente los productos del tenant cuya talla de raíz o alguna variante coincide tras `trim` e ignorando mayúsculas, y que cada producto aparece una sola vez.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 4: Filtro por talla devuelve el conjunto exacto sin duplicados`.
    - _Properties: 4_
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 3.3 Tests de ejemplo de bordes del filtro por talla
    - Verifica que talla > 20 caracteres tras `trim` se rechaza con error de validación sin alterar el resultado previo (Req 3.7) y que limpiar el filtro devuelve todos los productos activos del tenant (Req 3.6).
    - _Requirements: 3.6, 3.7_

## Fase 4 — Módulo de descuentos (funciones puras) (Req 7)

- [x] 4. Cálculo de totales de venta con descuentos
  - [x] 4.1 Implementar `lib/dominio/descuentos.ts` — `calcularTotalesVenta`
    - Crea el módulo puro con los tipos `LineaVenta`, `ResultadoTotales` y la función `calcularTotalesVenta(lineas, descuentoTotal, porcentajeImpuesto)` como en `design.md`. Reglas: subtotal de línea = `redondearBancario(precio_unitario × cantidad − descuento_producto)` (permite 0), base imponible = `Σ subtotales_linea − descuento_total`, impuesto sobre la base (cero si no hay impuesto configurado), total = `redondearBancario(base + impuesto)`. Lanza `DescuentoInvalidoError` si algún descuento es negativo, un `Descuento_Producto` excede el subtotal de su línea, o el `Descuento_Total` excede la suma de subtotales. Sin BD.
    - _Requirements: 7.1, 7.2, 7.3, 7.7, 7.8_

  - [x] 4.2 Escribir el PBT del cálculo de totales con descuentos (Property 16)
    - Crea `__tests__/property/clientes-fiadores-descuentos-totales.test.ts` con `{ numRuns: 100 }`: genera líneas y descuentos válidos (no negativos, cada `Descuento_Producto` ≤ subtotal de su línea, `Descuento_Total` ≤ suma de subtotales) y verifica que cada subtotal de línea es `redondearBancario(precio_unitario × cantidad − descuento_producto)` (pudiendo ser 0) y el total es `redondearBancario((Σ subtotales − descuento_total) + impuesto)`.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 16: Cálculo de totales de venta con descuentos`.
    - _Properties: 16_
    - _Requirements: 7.1, 7.2, 7.3, 7.7_

  - [x] 4.3 Escribir el PBT de descuentos inválidos (Property 17)
    - Crea `__tests__/property/clientes-fiadores-descuentos-invalidos.test.ts` con `{ numRuns: 100 }`: genera casos donde algún descuento es negativo, un `Descuento_Producto` excede el subtotal de su línea, o el `Descuento_Total` excede la suma de subtotales, y verifica que `calcularTotalesVenta` lanza `DescuentoInvalidoError` sin aplicar ningún descuento.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 17: Descuentos inválidos se rechazan`.
    - _Properties: 17_
    - _Requirements: 7.4, 7.5, 7.6_

  - [x] 4.4 Escribir el PBT de retrocompatibilidad sin descuentos (Property 18)
    - Crea `__tests__/property/clientes-fiadores-descuentos-retrocompat.test.ts` con `{ numRuns: 100 }`: para líneas arbitrarias con `Descuento_Producto` y `Descuento_Total` ausentes o cero, verifica que el total es igual a `redondearBancario(Σ (precio_unitario × cantidad) + impuesto)`, idéntico al cálculo previo.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 18: Ausencia de descuentos es retrocompatible`.
    - _Properties: 18_
    - _Requirements: 7.8_

- [x] 5. Checkpoint — Bug fixes y funciones puras
  - Ejecuta `pnpm test:run` de las PBT y tests implementados hasta ahora (fases 1–4) y confirma que pasan sin regresiones del core. Asegura que todos los tests pasen; consulta al usuario si surgen dudas.

## Fase 5 — Gestión de Clientes (CRUD) (Req 4)

- [x] 6. Dominio y validación de Clientes
  - [x] 6.1 Errores de dominio y schemas Zod de Cliente
    - En `lib/api/errores.ts` añade `CedulaDuplicadaError` (`CEDULA_DUPLICADA`, 409), `ClienteNoEncontradoError` (`CLIENTE_NO_ENCONTRADO`, 404) y `ClienteConHistorialError` (`CLIENTE_CON_HISTORIAL`, 409) con su mapeo HTTP. Crea `lib/schemas/cliente.ts` con `crearClienteSchema` (cédula `^[a-zA-Z0-9]{5,20}$`, nombre `min(1).max(100)`, teléfono `^\d{7,15}$`, correo `email().max(254).optional().nullable()`, dirección `max(240).optional().nullable()`) y `editarClienteSchema = crearClienteSchema.partial()`.
    - _Requirements: 4.2, 4.10, 4.11, 4.13_

  - [x] 6.2 Implementar `lib/dominio/clientes.ts` (CRUD con aislamiento)
    - Crea `crearCliente`, `editarCliente`, `eliminarCliente`, `listarClientes` y `obtenerCliente` con las firmas de `design.md`, todas recibiendo `organizacion_id` obligatorio. Unicidad de cédula por organización vía `@@unique([organizacion_id, cedula])`, mapeando `P2002` a `CedulaDuplicadaError` (Req 4.3, 4.4). `eliminarCliente` cuenta `Venta` y `MovimientoDeuda` asociados y lanza `ClienteConHistorialError` si hay historial (Req 4.9) o `ClienteNoEncontradoError` si el cliente no pertenece al tenant (Req 4.7). `listarClientes` pagina con `take` por defecto 50 y máximo 50 (Req 4.14) filtrando por `organizacion_id`.
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.14_

  - [x] 6.3 Escribir el PBT de round-trip de Cliente (Property 6)
    - Crea `__tests__/property/clientes-fiadores-cliente-roundtrip.test.ts` con `{ numRuns: 100 }`: para clientes con datos válidos aleatorios, crear y recuperar devuelve los mismos valores de negocio; tras editar con nuevos valores válidos, recuperar devuelve los valores editados.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 6: Round-trip de creación y edición de Cliente`.
    - _Properties: 6_
    - _Requirements: 4.1, 4.6_

  - [x] 6.4 Escribir el PBT de unicidad de cédula por organización (Property 7)
    - Crea `__tests__/property/clientes-fiadores-cedula-unica.test.ts` con `{ numRuns: 100 }`: verifica que dentro de una organización no puede haber dos clientes con la misma cédula (segundo intento rechazado con conflicto) y que la misma cédula sí puede existir en organizaciones distintas.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 7: Unicidad de cédula acotada por organización`.
    - _Properties: 7_
    - _Requirements: 4.3, 4.4_

  - [x] 6.5 Escribir el PBT de validación de campos de Cliente (Property 8)
    - Crea `__tests__/property/clientes-fiadores-cliente-validacion.test.ts` con `{ numRuns: 100 }`: genera combinaciones válidas e inválidas de cédula, nombre, teléfono y correo y verifica que la creación/edición se acepta si y solo si cédula 5–20 alfanuméricos, nombre no vacío ≤100, teléfono 7–15 dígitos y correo (si se da) formato `usuario@dominio.tld` ≤254; en otro caso error de validación.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 8: Validación de campos de Cliente`.
    - _Properties: 8_
    - _Requirements: 4.2, 4.10, 4.11, 4.13_

  - [x] 6.6 Escribir el PBT de borrado protegido por historial (Property 9)
    - Crea `__tests__/property/clientes-fiadores-borrado-protegido.test.ts` con `{ numRuns: 100 }`: verifica que la eliminación tiene éxito si y solo si el cliente no tiene ninguna `Venta` ni `MovimientoDeuda`; con historial se rechaza y el cliente permanece.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 9: Borrado de Cliente protegido por historial`.
    - _Properties: 9_
    - _Requirements: 4.8, 4.9_

  - [x] 6.7 Escribir el PBT de paginación de clientes (Property 10)
    - Crea `__tests__/property/clientes-fiadores-paginacion.test.ts` con `{ numRuns: 100 }`: para organizaciones con cualquier cantidad de clientes, verifica que cada página devuelta contiene a lo sumo 50 clientes.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 10: Paginación de clientes acotada a 50`.
    - _Properties: 10_
    - _Requirements: 4.14_

## Fase 6 — Módulo de deuda (Fiadores) (Req 5)

- [x] 7. Saldos, historial, abonos y totales de deuda
  - [x] 7.1 Implementar `lib/dominio/deuda.ts` y schema de abono
    - Crea el módulo con `saldoCliente`, `crearCargoDeuda(tx, ...)`, `registrarAbono`, `listarFiadores`, `historialDeuda` y `totalesDeuda` (firmas de `design.md`), agregando solo `MovimientoDeuda` con `organizacion_id` coincidente (Req 5.12). `saldoCliente = redondearBancario(Σ cargos − Σ abonos)` (Req 5.3). `registrarAbono` valida que el cliente exista en el tenant (Req 5.11), `monto >= 0.01` (Req 5.9) y `monto <= saldo_actual` (Req 5.8), y recalcula el saldo (Req 5.7); lanza `AbonoInvalidoError` (422) en los casos inválidos. `historialDeuda` ordena cronológicamente ascendente por `fecha` con desempate por orden de registro y anota el saldo corrido (Req 5.2). `totalesDeuda` devuelve `totalClientesConDeuda` y `totalDeudaPendiente` (redondeo bancario, Req 5.6) usando solo el tenant. Añade `AbonoInvalidoError` en `lib/api/errores.ts` y `registrarAbonoSchema` en `lib/schemas/deuda.ts`.
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13_

  - [x] 7.2 Escribir el PBT de saldo, fiadores y totales (Property 11)
    - Crea `__tests__/property/clientes-fiadores-saldo-totales.test.ts` con `{ numRuns: 100 }`: para conjuntos de `MovimientoDeuda` aleatorios de una organización, verifica que el saldo de cada cliente es `redondearBancario(Σ cargos − Σ abonos)`, que la lista de fiadores contiene exactamente los clientes con saldo > 0, que `Total_Clientes_Con_Deuda` es su cardinalidad y `Total_Deuda_Pendiente` es el `redondearBancario` de la suma de esos saldos.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 11: Definición de saldo y conjunto de fiadores`.
    - _Properties: 11_
    - _Requirements: 5.1, 5.3, 5.4, 5.5, 5.6, 5.10, 5.13_

  - [x] 7.3 Escribir el PBT del historial ordenado con saldo corrido (Property 12)
    - Crea `__tests__/property/clientes-fiadores-historial-orden.test.ts` con `{ numRuns: 100 }`: verifica que el historial se devuelve en orden cronológico ascendente por fecha (desempate por orden de registro) y que el saldo resultante anotado en cada movimiento es el acumulado de cargos menos abonos hasta ese movimiento inclusive.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 12: Historial de deuda ordenado con saldo corrido`.
    - _Properties: 12_
    - _Requirements: 5.2_

  - [x] 7.4 Escribir el PBT de abonos válidos e inválidos (Property 13)
    - Crea `__tests__/property/clientes-fiadores-abono.test.ts` con `{ numRuns: 100 }`: para clientes con saldo positivo y montos de abono arbitrarios, verifica que si `monto ∈ [0.01, saldo_actual]` con ≤2 decimales el abono se registra y el nuevo saldo es exactamente `saldo_actual − monto`; en otro caso se rechaza con error de validación y el saldo permanece igual.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 13: Abono válido decrementa el saldo; inválido no altera nada`.
    - _Properties: 13_
    - _Requirements: 5.7, 5.8, 5.9_

## Fase 7 — Valor de Inventario y filtros de stock (Req 2, 10)

- [x] 8. Valor de Inventario y filtros de stock crítico y rango
  - [x] 8.1 Implementar `calcularValorInventario` en `lib/dominio/inventario.ts`
    - Añade `calcularValorInventario(organizacion_id)` que suma sobre `Producto` activos del tenant `inversion += precio_compra × stock_actual` y `recaudacion += precio_venta × stock_actual`, tratando nulos como 0 (Req 2.2, 2.3), usando el `stock_actual` de raíz (ya mantenido como suma de variantes) y contando cada producto una sola vez (Req 2.4). Aplica `redondearBancario` a 2 decimales antes de devolver (Req 2.8). Sin productos → 0,00 (Req 2.6). Solo tenant activo (Req 2.5).
    - _Requirements: 2.2, 2.3, 2.4, 2.5, 2.6, 2.8_

  - [x] 8.2 Añadir filtros de stock crítico y rango a `listarProductos`
    - Extiende `listarProductos` con `stock_min?`/`stock_max?` (enteros 0–999.999.999) que mapean a `where.stock_actual = { gte?, lte? }` (Req 10.3–10.5) y `solo_critico?: boolean` que aplica el criterio de `esCritico(stock_actual, stock_minimo)` (`stock_actual = 0 OR stock_actual <= stock_minimo × 0.3`) con el helper reutilizado del glosario/`estadoStock`. Combina todos los filtros con AND y acota por `organizacion_id` (Req 10.9, 10.10); sin coincidencias → lista vacía (Req 10.8). Añade/extiende el schema Zod del listado de productos con `stock_min`/`stock_max` enteros 0–999.999.999, `superRefine` de min ≤ máx (Req 10.6, 10.7) y `solo_critico` boolean, reemplazando el filtro "Stock inicial".
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 10.10_

  - [x] 8.3 Escribir el PBT de Valor de Inventario (Property 3)
    - Crea `__tests__/property/clientes-fiadores-valor-inventario.test.ts` con `{ numRuns: 100 }`: para catálogos aleatorios (con `precio_compra`/`precio_venta`/`stock_actual` posiblemente nulos y con o sin variantes), verifica que Inversión = Σ `precio_compra × stock_actual` y Recaudación potencial = Σ `precio_venta × stock_actual` sobre productos activos del tenant, tratando nulos como 0, usando la suma de stock de variantes y contando cada producto una sola vez.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 3: Valor de Inventario suma correctamente sin doble conteo`.
    - _Properties: 3_
    - _Requirements: 2.2, 2.3, 2.4_

  - [x] 8.4 Escribir el PBT de filtro por rango de stock y estado crítico (Property 24)
    - Crea `__tests__/property/clientes-fiadores-filtro-stock.test.ts` con `{ numRuns: 100 }`: para catálogos y rangos aleatorios, verifica que el filtro de rango contiene exactamente los productos del tenant cuyo `stock_actual` está dentro del rango (inclusivo, mínimo/máximo opcionales), y que "solo stock crítico" contiene exactamente los productos del tenant cuyo `Estado_Stock` es "Crítico" según el glosario.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 24: Filtro por rango de stock e igualdad de estado crítico`.
    - _Properties: 24_
    - _Requirements: 10.1, 10.3, 10.4, 10.5_

  - [x] 8.5 Escribir el PBT de combinación AND de filtros (Property 5)
    - Crea `__tests__/property/clientes-fiadores-filtros-and.test.ts` con `{ numRuns: 100 }`: aplica simultáneamente varios filtros del listado (talla, stock crítico, rango de stock y demás) y verifica que cada producto del resultado satisface todos y cada uno de los filtros aplicados.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 5: Combinación de filtros del listado es conjunción AND`.
    - _Properties: 5_
    - _Requirements: 3.4, 10.9_

## Fase 8 — Cambios en Ventas: cliente, plazo, cargo transaccional y descuentos (Req 6, 7)

- [x] 9. Venta con cliente/plazo y cargo de deuda transaccional
  - [x] 9.1 Extender el schema de venta y errores de dominio
    - Extiende el schema Zod de venta (`lib/schemas/venta.ts`) con `cliente_id` opcional, `plazo_deuda` opcional, `descuento_total >= 0` y `descuento_producto >= 0` por ítem; añade un `superRefine` que exige `cliente_id` y `plazo_deuda >= hoy` cuando `metodo_pago === "fiado"`. Añade `ClienteRequeridoError` (`CLIENTE_REQUERIDO`, 422) y `PlazoDeudaInvalidoError` (`PLAZO_DEUDA_INVALIDO`, 422) en `lib/api/errores.ts`.
    - _Requirements: 6.3, 6.4, 6.5, 7.6_

  - [x] 9.2 Modificar `registrarVenta` en `lib/dominio/ventas.ts`
    - Sustituye el cálculo inline de subtotal/impuesto/total por `calcularTotalesVenta` (Req 7). Dentro de la `$transaction`: si `metodo_pago === "fiado"`, valida que `cliente_id` exista y pertenezca al tenant (lanza `ClienteNoEncontradoError` si no, Req 6.9) y que `plazo_deuda >= fecha de la venta` (Req 6.4); si falta cliente/plazo o el plazo es anterior, lanza error de validación sin persistir (Req 6.5). Persiste `Venta` con `cliente_id` y `plazo_deuda`, e invoca `crearCargoDeuda(tx, { cliente_id, organizacion_id, monto: total, venta_id, plazo })` en la misma transacción (Req 6.6); si el cargo falla, la transacción revierte toda la venta (Req 6.10). Para métodos no fiados, `cliente_id` es opcional y las ventas sin cliente permanecen válidas (Req 6.1, 6.2, 6.7).
    - _Requirements: 6.1, 6.2, 6.3, 6.6, 6.7, 6.8, 6.9, 6.10_

  - [x] 9.3 Escribir el PBT de persistencia de venta fiada (Property 14)
    - Crea `__tests__/property/clientes-fiadores-venta-fiada-persistencia.test.ts` con `{ numRuns: 100 }`: para ventas con `metodo_pago = "fiado"`, verifica que la venta se persiste si y solo si tiene un cliente existente del tenant y `plazo_deuda >= fecha de registro`; en otro caso (sin cliente, cliente de otra org, sin plazo o plazo anterior) se rechaza y no se persiste ninguna venta.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 14: Persistencia de venta fiada condicionada a cliente y plazo válidos`.
    - _Properties: 14_
    - _Requirements: 6.3, 6.4, 6.5, 6.8, 6.9_

  - [x] 9.4 Escribir el PBT del cargo por el total (Property 15)
    - Crea `__tests__/property/clientes-fiadores-venta-fiada-cargo.test.ts` con `{ numRuns: 100 }`: para ventas fiadas válidas, verifica que al completarse existe exactamente un `Cargo_Deuda` asociado a esa venta y su cliente cuyo monto es igual al total tras descuentos e impuestos, y que el saldo del cliente aumenta en ese monto.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 15: Venta fiada válida genera un cargo por el total`.
    - _Properties: 15_
    - _Requirements: 6.6_

  - [x] 9.5 Tests de ejemplo de rollback y ventas no fiadas
    - Verifica con fallo inyectado que si `crearCargoDeuda` falla la venta fiada no queda registrada (Req 6.10), que una venta no fiada con cliente del tenant se asocia correctamente (Req 6.2), y que las ventas sin cliente permanecen válidas (Req 6.1, 6.7).
    - _Requirements: 6.1, 6.2, 6.7, 6.10_

## Fase 9 — Notificaciones accionables (Req 8)

- [x] 10. Notificaciones de stock cero, crítico y vencimiento con dedupe
  - [x] 10.1 Extender `lib/dominio/notificaciones.ts` y schema de extensión
    - Añade generación de notificación `stock_cero` cuando `stock_actual` llega a 0, dentro de la transacción de `ajustarStock`/`registrarVenta`, con clave de dedupe `stock_cero:{producto_id}` (Req 8.1, 8.11, 8.12). Conserva `stock_critico` con clave `stock_critico:{producto_id}` (Req 8.5). Implementa `generarNotificacionesVencimiento(organizacion_id)` que, para ventas fiadas con `plazo_deuda <= now` y saldo del cliente > 0, crea `vencimiento_deuda` con clave `vencimiento_deuda:{venta_id}` (Req 8.7, 8.11), evaluada de forma perezosa desde el listado de notificaciones. Implementa `extenderDeuda(venta_id, nuevaFecha, organizacion_id)` que valida `nuevaFecha > plazo_deuda` vigente (lanza `PlazoExtensionInvalidoError` 422 en caso contrario, Req 8.9) y asigna el nuevo plazo (Req 8.8). Evita duplicados cuando ya existe una notificación no leída con la misma clave (Req 8.12). Añade `PlazoExtensionInvalidoError` en `lib/api/errores.ts` y `extenderDeudaSchema` en `lib/schemas/deuda.ts`.
    - _Requirements: 8.1, 8.5, 8.7, 8.8, 8.9, 8.10, 8.11, 8.12_

  - [x] 10.2 Exponer acciones rápidas por tipo en el DTO de notificación
    - En el serializador de notificaciones, determina el conjunto de `Accion_Rapida` según el `tipo`: `stock_cero` → {"Ajustar stock", "Eliminar producto"}; `stock_critico` → {"Ajustar stock"}; `vencimiento_deuda` → {"Extender deuda"}. Expón los metadatos (`tipo`, `producto_id`, `venta_id`) para que la UI renderice los botones. El dominio no ejecuta la acción.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x] 10.3 Escribir el PBT de acciones rápidas por tipo (Property 19)
    - Crea `__tests__/property/clientes-fiadores-notif-acciones.test.ts` con `{ numRuns: 100 }`: para notificaciones de tipo arbitrario, verifica que el conjunto de acciones expuesto es exactamente el determinado por su tipo (`stock_cero`, `stock_critico`, `vencimiento_deuda`).
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 19: Acciones rápidas por tipo de notificación`.
    - _Properties: 19_
    - _Requirements: 8.2, 8.5, 8.6, 8.7_

  - [x] 10.4 Escribir el PBT de dedupe idempotente (Property 20)
    - Crea `__tests__/property/clientes-fiadores-notif-dedupe.test.ts` con `{ numRuns: 100 }`: para condiciones que disparan notificaciones (stock cero, crítico, vencimiento), verifica que evaluarlas repetidamente mientras exista una notificación no leída con la misma clave de dedupe (`organizacion_id` + tipo + id de producto/deuda) no crea duplicados.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 20: Generación de notificaciones idempotente por clave de deduplicación`.
    - _Properties: 20_
    - _Requirements: 8.1, 8.11, 8.12_

  - [x] 10.5 Escribir el PBT de extender deuda (Property 21)
    - Crea `__tests__/property/clientes-fiadores-extender-deuda.test.ts` con `{ numRuns: 100 }`: para deudas con un plazo vigente y fechas propuestas arbitrarias, verifica que si la fecha es estrictamente posterior al plazo vigente el plazo se actualiza; en otro caso se rechaza con error de validación y el plazo vigente se conserva.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 21: Extender deuda valida fecha posterior`.
    - _Properties: 21_
    - _Requirements: 8.8, 8.9_

## Fase 10 — Métricas de ventas, dinero en deuda y consolidación (Req 9, 1, 2)

- [x] 11. Ventas_Totales, dinero en deuda y propiedades transversales
  - [x] 11.1 Ajustar `Ventas_Totales` y "Total de dinero en deuda" en `lib/dominio/metricas.ts`
    - Excluye de `Ventas_Totales` el monto de toda venta fiada mientras el saldo del cliente asociado sea > 0 (incluidos abonos parciales), e inclúyelo cuando el saldo llega a 0 (Req 9.1–9.3). Añade la métrica "Total de dinero en deuda" obtenida de `totalesDeuda(organizacion_id).totalDeudaPendiente` (mismo origen que la sección Fiadores, Req 9.4, 9.5), cero si no hay deuda (Req 9.6), con `redondearBancario` y solo del tenant activo (Req 9.7).
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_

  - [x] 11.2 Escribir el PBT de contribución de ventas fiadas (Property 22)
    - Crea `__tests__/property/clientes-fiadores-ventas-fiadas-totales.test.ts` con `{ numRuns: 100 }`: para ventas fiadas arbitrarias, verifica que su contribución a `Ventas_Totales` es cero mientras el saldo del cliente sea > 0 (incluso con abonos parciales) y es igual al total de la venta cuando ese saldo llega a 0.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 22: Ventas fiadas contribuyen a Ventas_Totales solo al saldarse`.
    - _Properties: 22_
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 11.3 Escribir el PBT de consistencia del total en deuda (Property 23)
    - Crea `__tests__/property/clientes-fiadores-total-deuda-consistencia.test.ts` con `{ numRuns: 100 }`: para una organización en un instante dado, verifica que la métrica "Total de dinero en deuda" es igual al `Total_Deuda_Pendiente` calculado para la sección Fiadores de esa misma organización.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 23: Consistencia de "Total de dinero en deuda" con Total_Deuda_Pendiente`.
    - _Properties: 23_
    - _Requirements: 9.4, 9.5, 9.6_

  - [x] 11.4 Escribir el PBT de aislamiento multi-tenant de agregaciones (Property 1)
    - Crea `__tests__/property/clientes-fiadores-aislamiento-multitenant.test.ts` con `{ numRuns: 100 }`: genera varias organizaciones con datos de negocio aleatorios y verifica que el resultado de cualquier agregación de la organización activa (métricas, rankings, Valor de Inventario, listado de clientes, listado de fiadores, totales de deuda) depende únicamente de los registros de esa organización y no cambia al añadir o quitar registros de otras.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 1: Aislamiento multi-tenant de las agregaciones`.
    - _Properties: 1_
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 2.5, 3.5, 4.5, 4.7, 5.12, 8.10, 9.7, 10.10_

  - [x] 11.5 Escribir el PBT de redondeo bancario en montos de salida (Property 2)
    - Crea `__tests__/property/clientes-fiadores-redondeo-bancario.test.ts` con `{ numRuns: 100 }`: para todo monto monetario devuelto por el dominio (Inversión, Recaudación potencial, saldo de cliente, `Total_Deuda_Pendiente`, subtotales de línea, total de venta, `Ventas_Totales`, "Total de dinero en deuda"), verifica que el valor devuelto es igual a `redondearBancario` aplicado al valor crudo con 2 decimales.
    - Cabecera: `// Feature: gestion-clientes-y-fiadores, Property 2: Redondeo bancario en todo monto de salida`.
    - _Properties: 2_
    - _Requirements: 2.8, 5.3, 5.6, 7.7, 9.7_

- [x] 12. Checkpoint — Dominio completo
  - Ejecuta `pnpm test:run` de todas las PBT (Property 1–24) y tests de dominio implementados y confirma que pasan sin regresiones del core. Asegura que todos los tests pasen; consulta al usuario si surgen dudas.

## Fase 11 — Route Handlers, serializadores, schemas y errores

- [x] 13. Endpoints y serialización
  - [x] 13.1 Serializadores y DTOs
    - En `lib/api/serializadores.ts` añade `toClienteDTO`, `toMovimientoDeudaDTO`, `toFiadorDTO` (cliente + saldo) y `toValorInventarioDTO`, convirtiendo `Decimal` a `number` con montos ya redondeados. Extiende `toVentaDTO` con `cliente_id`, `plazo_deuda` y los desgloses de descuento.
    - _Requirements: 2.9, 5.2, 5.3, 6.7_

  - [x] 13.2 Endpoints de Clientes
    - Crea los Route Handlers `GET /api/clientes`, `POST /api/clientes`, `GET /api/clientes/[id]`, `PATCH /api/clientes/[id]`, `DELETE /api/clientes/[id]`, cada uno con `resolverContexto({ seccion: "clientes", accion })`, `withValidation` con los schemas de Cliente y los helpers de `respuestas.ts`. Propagan `ctx.organizacionActiva.id` al dominio y mapean los errores (`CEDULA_DUPLICADA` 409, `CLIENTE_NO_ENCONTRADO` 404, `CLIENTE_CON_HISTORIAL` 409).
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 4.13, 4.14_

  - [x] 13.3 Endpoints de Deuda / Fiadores
    - Crea `GET /api/deuda/fiadores` (clientes con saldo > 0 + totales, Req 5.1, 5.4–5.6, 5.13), `GET /api/deuda/[cliente_id]` (historial con saldo corrido, Req 5.2, 5.3) y `POST /api/deuda/[cliente_id]/abono` (registra abono, Req 5.7–5.11) con `resolverContexto`, validación Zod y mapeo de `ABONO_INVALIDO` (422) y `CLIENTE_NO_ENCONTRADO` (404).
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.11, 5.13_

  - [x] 13.4 Endpoint de Valor de Inventario y productos con filtros
    - Crea `GET /api/inventario/valor` (Req 2, con guard de organización activa Req 2.7) y modifica `GET /api/productos` para aceptar los filtros corregidos de talla y de stock/crítico, aplicando el schema Zod extendido y devolviendo error de validación en tallas > 20 y rangos inválidos sin alterar el listado previo.
    - _Requirements: 2.1, 2.5, 2.7, 3.7, 10.6, 10.7_

  - [x] 13.5 Endpoints de Dashboard (métricas y rankings)
    - Modifica `GET /api/dashboard/metricas` y `GET /api/dashboard/rankings` para pasar `ctx.organizacionActiva.id` a `calcularMetricas`/`calcularRankings` y exponer la métrica "Total de dinero en deuda". Reutiliza el guard de `resolverContexto` para responder error de autorización si no hay organización activa (Req 1.4, 2.7).
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 9.4_

  - [x] 13.6 Endpoint de extender deuda y listado de notificaciones
    - Crea `POST /api/notificaciones/[id]/extender-deuda` (valida fecha posterior con `extenderDeudaSchema`, mapea `PLAZO_EXTENSION_INVALIDO` 422, Req 8.8, 8.9) y engancha `generarNotificacionesVencimiento` en el listado de notificaciones (evaluación perezosa, Req 8.7). Muestra a cada usuario solo notificaciones de su organización activa (Req 8.10).
    - _Requirements: 8.7, 8.8, 8.9, 8.10_

  - [x] 13.7 Tests de integración de endpoints
    - Crea tests de integración con 1–3 ejemplos por handler para `/api/clientes`, `/api/deuda/*` y `/api/inventario/valor`, verificando códigos de estado, aislamiento por tenant y validaciones. Marca `describe.skip` si `SKIP_DB_TESTS=1`.
    - _Requirements: 4.1, 4.5, 5.1, 5.7, 2.1_

## Fase 12 — Componentes UI

- [x] 14. Interfaz de usuario en español (shadcn/ui + react-hook-form + sonner)
  - [x] 14.1 Sección Clientes
    - Crea `components/sections/clientes-section.tsx` (tabla paginada 50/página con `components/ui/pagination`, buscador, botón "Nuevo cliente"), `components/clientes/cliente-form-dialog.tsx` (react-hook-form + zod, cédula/nombre/teléfono obligatorios; correo/dirección opcionales; toasts `sonner`; muestra errores de validación y conflicto de cédula) y `components/clientes/eliminar-cliente-dialog.tsx` (`AlertDialog`, avisa si el cliente tiene historial). Registra la sección en `menuItems` de `components/sidebar.tsx` (icono `lucide-react`) y añade el `case "clientes"` en `renderSection()` de `app/page.tsx`. Consume los endpoints de la tarea 13.2.
    - _Requirements: 4.1, 4.6, 4.8, 4.9, 4.12, 4.14_

  - [x] 14.2 Rework de la sección Fiadores
    - Reescribe `components/sections/fiadores-section.tsx` para consumir `/api/deuda/fiadores` (reemplaza el mock): dos `stat-card` superiores (Total_Clientes_Con_Deuda y Total_Deuda_Pendiente) y tabla de clientes con deuda (nombre, teléfono, saldo). Crea `components/fiadores/detalle-deuda-dialog.tsx` (historial cronológico con saldo corrido) y `components/fiadores/registrar-abono-dialog.tsx` (validación de rango del abono con feedback `sonner`).
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.7, 5.8, 5.9, 5.13, 5.14_

  - [x] 14.3 Cambios en Ventas UI
    - En `components/ventas/` añade el selector de cliente (opcional en general; obligatorio si método = fiado) restringido al tenant, un date picker de `Plazo_Deuda` (`react-day-picker`) visible solo para fiado, y en `carrito-table.tsx` los campos de `Descuento_Producto` por línea y `Descuento_Total`, con recálculo en vivo usando `calcularTotalesVenta` y feedback de validación.
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 7.1, 7.2, 7.4, 7.5_

  - [x] 14.4 Filtros de Inventario y tarjetas de Valor de Inventario
    - En `components/inventario/filtros-inventario.tsx` reemplaza el rango "Stock inicial" por "Stock" (min/max) y añade un toggle "Solo stock crítico" (`Switch`/`Checkbox`), con validación cliente (min ≤ máx, enteros 0–999.999.999) que conserva el resultado previo si el filtro es inválido. Añade en la cabecera de `inventario-section.tsx` dos `stat-card` de Valor de Inventario (Inversión y Recaudación potencial) con formato de moneda en español, consumiendo `/api/inventario/valor`.
    - _Requirements: 2.1, 2.9, 10.1, 10.2, 10.6, 10.7_

  - [x] 14.5 Notificaciones accionables
    - En `components/notificaciones/notificacion-item.tsx` renderiza los botones de `Accion_Rapida` según `tipo`: `stock_cero` → "Ajustar stock" (abre el `Modal_Ajuste_Stock`) y "Eliminar producto" (abre el `Modal_Confirmacion_Eliminar`); `stock_critico` → solo "Ajustar stock"; `vencimiento_deuda` → "Extender deuda" (abre `components/fiadores/extender-deuda-dialog.tsx` con date picker que valida fecha posterior). Cablea los modales existentes y el endpoint de la tarea 13.6.
    - _Requirements: 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8, 8.9_

  - [x] 14.6 Render/smoke tests de UI
    - Añade render tests que verifiquen que la sección Clientes, el rework de Fiadores y las tarjetas de Valor de Inventario montan correctamente, y que `notificacion-item` muestra el conjunto correcto de botones por tipo de notificación.
    - _Requirements: 4.12, 5.14, 2.9, 8.2, 8.6_

- [x] 15. Checkpoint final — Suite completa
  - Ejecuta `pnpm test:run` y confirma que las 24 PBT y los tests de ejemplo/integración implementados pasan, y que las pruebas del core no regresionan. Si surgen dudas o regresiones, consulta al usuario antes de cerrar el plan.

## Notes

- Las sub-tareas marcadas con `*` son opcionales (tests de ejemplo, integración, smoke, render) y pueden saltarse para un MVP más rápido. Las **PBT (Property 1–24) son obligatorias** porque `design.md` exige cubrir las 24 propiedades canónicas con fast-check y mínimo 100 iteraciones.
- La migración (Req 11) no tiene PBT: es esquema declarativo y se verifica con tests de integración/humo (conteos antes/después, columnas nullable, `organizacion_id`/índices e idempotencia), siguiendo el patrón `__tests__/integration/migracion-*-smoke.test.ts`.
- Las PBT se colocan cerca de la implementación que validan; las propiedades transversales (Property 1 aislamiento y Property 2 redondeo) se ejercitan en la Fase 10, después de que existan todas las agregaciones y montos de salida que cubren.
- Cada tarea hoja referencia los criterios de `requirements.md` que la justifican y, cuando aplica, la propiedad de `design.md`.
- No se introducen librerías nuevas: se reutiliza el stack existente (Next.js 16, Prisma, Zod, react-hook-form, shadcn/ui, react-day-picker, date-fns, sonner, fast-check, vitest) y los helpers del core (`redondearBancario`, `resolverContexto`, `withValidation`, `mapPrismaError`, `respuestas.ts`).
- La venta fiada y su `Cargo_Deuda` comparten `$transaction` (Req 6.10); las notificaciones de stock se generan dentro de las transacciones de `ajustarStock`/`registrarVenta` para garantizar atomicidad.
- Los checkpoints (tareas 5, 12, 15) son puntos de detención donde se verifican tests y se consulta al usuario si surgen dudas.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.2", "3.1", "4.1"] },
    { "id": 1, "tasks": ["1.2", "2.3", "3.2", "3.3", "4.2", "4.3", "4.4"] },
    { "id": 2, "tasks": ["1.3", "1.4", "6.1", "8.1"] },
    { "id": 3, "tasks": ["6.2", "8.2", "8.3", "9.1"] },
    { "id": 4, "tasks": ["6.3", "6.4", "6.5", "6.6", "6.7", "7.1", "8.4", "8.5"] },
    { "id": 5, "tasks": ["7.2", "7.3", "7.4", "9.2", "10.1", "10.2"] },
    { "id": 6, "tasks": ["9.3", "9.4", "9.5", "10.3", "10.4", "10.5", "11.1", "13.1"] },
    { "id": 7, "tasks": ["11.2", "11.3", "11.4", "11.5", "13.2", "13.3", "13.4", "13.5", "13.6"] },
    { "id": 8, "tasks": ["13.7", "14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 9, "tasks": ["14.6"] }
  ]
}
```
