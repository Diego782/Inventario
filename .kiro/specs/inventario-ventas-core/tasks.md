# Implementation Plan

## Overview

Plan de implementación atómico para `inventario-ventas-core`. Cada tarea hoja es **autocontenida**, **pequeña** y **completable por un subagente sin contexto adicional**, con criterio de aceptación verificable. El orden respeta las dependencias técnicas del rollout descrito en `design.md` y el TDD por propiedad para PBT (P1–P8). Convención: las sub-tareas marcadas con `*` son opcionales (tests); las no marcadas son obligatorias.

Stack: **Next.js 16 + React 19 + TypeScript 5.7 + Prisma + MySQL 8 + shadcn/ui + sonner + react-hook-form + zod + fast-check + vitest**.

Convenciones de nombres en este plan:

- `R<num>.<sub>` referencia un criterio de aceptación de `requirements.md`.
- `P<n>` referencia una propiedad canónica de `design.md` § Correctness Properties.
- Rutas en TypeScript usan los aliases `@/lib`, `@/hooks`, `@/components`, `@/components/ui`.

## Tasks

## Fase 1 — Scaffolding del proyecto

- [x] 1. Scaffolding de dependencias y herramientas
  - [x] 1.1 Añadir dependencias runtime con pnpm
    - Ejecuta `pnpm add prisma @prisma/client jsbarcode date-fns-tz` en la raíz del repo.
    - Verifica que `package.json` contenga las cuatro dependencias en `"dependencies"` y que `pnpm-lock.yaml` se haya actualizado.
    - Archivos: `package.json`, `pnpm-lock.yaml`.
    - Aceptación: `pnpm ls prisma @prisma/client jsbarcode date-fns-tz` lista las 4 sin errores.
    - _Requirements: R1.5, R9.1, R10.2, R18.6_

  - [x] 1.2 Añadir dependencias de testing y tooling con pnpm
    - Ejecuta `pnpm add -D fast-check vitest @vitest/ui @testing-library/react @testing-library/user-event jsdom msw @types/jsbarcode tsx`.
    - Verifica que aparezcan en `"devDependencies"` de `package.json`.
    - Archivos: `package.json`, `pnpm-lock.yaml`.
    - Aceptación: `pnpm ls fast-check vitest jsdom` lista los 3 sin errores.
    - _Requirements: R6.5, R24.1, R24.2_

  - [x] 1.3 Crear `vitest.config.ts` con entorno jsdom
    - Crea el archivo en la raíz con `defineConfig({ test: { environment: 'jsdom', globals: true, include: ['__tests__/**/*.test.ts', '__tests__/**/*.test.tsx'] } })`.
    - Configura el alias `@` apuntando a la raíz para resolver imports igual que `tsconfig.json`.
    - Archivos: `vitest.config.ts`.
    - Aceptación: `pnpm exec vitest --run --reporter=verbose` arranca y reporta "no test files" sin error.
    - _Requirements: R22.5_

  - [x] 1.4 Añadir scripts de pnpm para Docker, Prisma y tests
    - Modifica `package.json` para añadir: `"db:up": "docker compose up -d"`, `"db:down": "docker compose down"`, `"db:reset": "docker compose down -v && docker compose up -d"`, `"db:migrate": "prisma migrate dev"`, `"db:deploy": "prisma migrate deploy"`, `"db:seed": "tsx prisma/seed.ts"`, `"db:setup": "pnpm db:up && pnpm db:deploy && pnpm db:seed"`, `"test": "vitest"`, `"test:run": "vitest --run"`.
    - No alteres scripts existentes (`dev`, `build`, `start`, `lint`).
    - Archivos: `package.json`.
    - Aceptación: `pnpm run` lista los 9 nuevos scripts.
    - _Requirements: R1.3, R1.5, R1.6_

  - [x] 1.5 Crear `.env.example` con las variables del proyecto
    - Crea `.env.example` en la raíz con exactamente estas claves: `DATABASE_URL="mysql://invenpro:invenpro@localhost:3306/invenpro?charset=utf8mb4"`, `MYSQL_ROOT_PASSWORD=root_password`, `MYSQL_DATABASE=invenpro`, `MYSQL_USER=invenpro`, `MYSQL_PASSWORD=invenpro`, `TZ=America/Mexico_City`.
    - Archivos: `.env.example`.
    - Aceptación: `grep -c '=' .env.example` devuelve 6.
    - _Requirements: R1.2, R18.6_

  - [x] 1.6 Crear `docker-compose.yml` con servicio MySQL 8
    - Crea el archivo en la raíz con un servicio `mysql` basado en `mysql:8.0`, puerto host `3306:3306`, volumen nombrado `invenpro_mysql_data` montado en `/var/lib/mysql`, healthcheck con `mysqladmin ping` (interval 5s, retries 12, start_period 20s) y variables de entorno tomadas del `.env`.
    - Archivos: `docker-compose.yml`.
    - Aceptación: `docker compose config` valida la sintaxis sin errores.
    - _Requirements: R1.1, R1.3, R1.4_

  - [x] 1.7 Añadir entradas al `.gitignore`
    - Añade al final del `.gitignore` existente: `.env`, `prisma/migrations/migration_lock.toml` no (debe versionarse), `coverage/`, `*.log`. Verifica que `.env` quede ignorado y `.env.example` no.
    - Archivos: `.gitignore`.
    - Aceptación: `git check-ignore -v .env` reporta ignorado; `git check-ignore -v .env.example` reporta NO ignorado.
    - _Requirements: R1.2_

## Fase 2 — Esquema Prisma, migración y seed

- [x] 2. Esquema Prisma, migración inicial y datos semilla
  - [x] 2.1 Inicializar Prisma con datasource MySQL
    - Ejecuta `pnpm exec prisma init --datasource-provider mysql`.
    - Verifica que se cree `prisma/schema.prisma`.
    - Archivos: `prisma/schema.prisma`.
    - Aceptación: el archivo existe y contiene `provider = "mysql"` en la sección datasource.
    - _Requirements: R1.5_

  - [x] 2.2 Definir el esquema completo en `prisma/schema.prisma`
    - Reemplaza el contenido por los modelos `Categoria`, `Producto`, `MovimientoStock`, `Venta`, `VentaItem`, `Configuracion` y los enums `TipoMovimiento`, `MetodoPago`, `EstadoVenta` exactamente como aparecen en `design.md` § Data Models.
    - Incluye todos los `@@index`, `@@map`, `@db.Char(36)`, `@db.VarChar`, `@db.Decimal(12,2)` y `@@unique` declarados.
    - Archivos: `prisma/schema.prisma`.
    - Aceptación: `pnpm exec prisma format` no modifica el archivo y `pnpm exec prisma validate` retorna OK.
    - _Requirements: R2.1, R2.2, R2.6, R12.4, R18.2, R18.3, R24.4_

  - [x] 2.3 Generar la migración inicial `init`
    - Levanta MySQL (`pnpm db:up`) y ejecuta `pnpm exec prisma migrate dev --name init --create-only` para generar la migración sin aplicarla; revisa que el SQL generado contenga `CREATE TABLE productos`, `CREATE TABLE categorias`, `CREATE TABLE movimientos_stock`, `CREATE TABLE ventas`, `CREATE TABLE venta_items`, `CREATE TABLE configuracion`.
    - Aplica con `pnpm exec prisma migrate deploy`.
    - Archivos: `prisma/migrations/<ts>_init/migration.sql`, `prisma/migrations/migration_lock.toml`.
    - Aceptación: la migración existe en el directorio y `pnpm exec prisma migrate status` reporta `Database schema is up to date`.
    - _Requirements: R1.5, R1.6_

  - [x] 2.4 Crear `prisma/seed.ts` con datos semilla mínimos
    - Crea el archivo que inserta: 4 categorías (`Laptops`, `Monitores`, `Periféricos`, `Audio`), 6 productos de ejemplo con `codigo_barras` válidos EAN-13 calculados a mano (incluye un producto sin `codigo_barras` y otro con `stock_actual = 0`), y los 6 valores por defecto de `Configuracion` (`porcentaje_impuesto=0`, `etiqueta_ancho_mm=50`, `etiqueta_alto_mm=30`, `ticket_ancho_mm=80`, `imprimir_automaticamente=false`, `permitir_sobreventa=false`).
    - Usa `upsert` por `clave`/`nombre`/`sku` para que sea idempotente.
    - Archivos: `prisma/seed.ts`.
    - Aceptación: `pnpm db:seed` se ejecuta dos veces sin errores y la BD contiene 4 categorías, 6 productos y 6 entradas de configuración.
    - _Requirements: R1.5, R26.4_

  - [x] 2.5 Smoke test de migraciones contra BD limpia
    - Crea `__tests__/integration/migracion-smoke.test.ts` que: levanta una BD ephemeral con `pnpm db:reset`, ejecuta `prisma migrate deploy` y `prisma db seed`, y verifica con `prisma.producto.count()` que devuelve 6.
    - Marca el test con `describe.skip` si la variable `SKIP_DB_TESTS=1` está definida.
    - Archivos: `__tests__/integration/migracion-smoke.test.ts`.
    - Aceptación: `pnpm test:run __tests__/integration/migracion-smoke.test.ts` pasa con la BD activa.
    - _Requirements: R1.6_

## Fase 3 — Librerías puras: money y código de barras (con sus PBT)

- [x] 3. Librerías puras y sus property tests
  - [x] 3.1 Escribir el test PBT de redondeo bancario (Property 6)
    - Crea `__tests__/property/money.test.ts` con `fc.assert` y `numRuns: 100`. Cubre los tres sub-invariantes de P6: (a) `|redondearBancario(x) - x| <= 0.005`, (b) caso half exacto redondea al par (usa los ejemplos `2.125 → 2.12`, `2.135 → 2.14`), (c) idempotencia.
    - Anota cabecera: `// Feature: inventario-ventas-core, Property 6: Redondeo bancario`.
    - Archivos: `__tests__/property/money.test.ts`.
    - Aceptación: el archivo compila pero falla porque `lib/money.ts` aún no existe.
    - _PBT: Property 6 (`__tests__/property/money.test.ts`)_
    - _Requirements: R16.5_

  - [x] 3.2 Implementar `lib/money.ts` con `redondearBancario`
    - Crea `lib/money.ts` exportando `redondearBancario(valor: number, decimales = 2): number` siguiendo el algoritmo half-to-even del `design.md` (escala por `10^d`, compara resto contra `0.5 ± eps`, desempata al par).
    - Documenta con JSDoc.
    - Archivos: `lib/money.ts`.
    - Aceptación: `pnpm test:run __tests__/property/money.test.ts` pasa con 100 runs.
    - _Requirements: R16.5_

  - [x] 3.3 Escribir el test PBT del DV EAN-13 y Code128 (Property 2 + parte de Property 1)
    - Crea `__tests__/property/codigo-barras.test.ts` con dos `fc.assert`:
      - **P2 idempotencia DV**: `∀ d12 ∈ /^[0-9]{12}$/`, `validarEan13(d12 + dvEan13(d12)) === true`.
      - **P1 Code128**: `∀ s` ASCII imprimible con `1 ≤ |s| ≤ 48`, `validarCode128(s) === true`; y `∀ s` con `|s| > 48`, `validarCode128(s) === false`.
    - Anota cabecera con etiqueta `Property 2`.
    - Archivos: `__tests__/property/codigo-barras.test.ts`.
    - Aceptación: el archivo compila pero falla porque `lib/codigo-barras.ts` aún no existe.
    - _PBT: Property 2 + Property 1 (Code128) (`__tests__/property/codigo-barras.test.ts`)_
    - _Requirements: R9.1, R9.3_

  - [x] 3.4 Implementar `lib/codigo-barras.ts`
    - Crea el archivo con `dvEan13(d12)`, `generarEan13(prefijo='200', rng=Math.random)`, `validarEan13(s)`, `validarCode128(s)`, `detectarFormato(s)` exactamente como en `design.md`.
    - Archivos: `lib/codigo-barras.ts`.
    - Aceptación: `pnpm test:run __tests__/property/codigo-barras.test.ts` pasa con 100 runs.
    - _Requirements: R9.1, R9.2, R9.3, R9.4_

  - [x] 3.5 Escribir test unitario de `generarEan13` con RNG determinista
    - Añade en el mismo archivo `__tests__/property/codigo-barras.test.ts` un `describe('generarEan13')` con dos casos: (a) con `rng = () => 0` produce `'2000000000000' + dv'`, (b) con prefijo inválido `''` o `'abc'` lanza `Error("Prefijo inválido")`.
    - Archivos: `__tests__/property/codigo-barras.test.ts`.
    - Aceptación: ambos casos pasan.
    - _Requirements: R9.1, R9.2_

## Fase 4 — Capa de utilidades de backend (db, log, api)

- [x] 4. Utilidades transversales del backend
  - [x] 4.1 Crear `lib/db.ts` con singleton de Prisma
    - Implementa el singleton siguiendo `design.md`: `globalForPrisma.prisma ?? new PrismaClient(...)`. Si `process.env.DATABASE_URL` está vacío, escribe `console.error('[boot] MISSING_DATABASE_URL: ...')` SIN lanzar excepción.
    - Archivos: `lib/db.ts`.
    - Aceptación: importar `prisma` desde otro archivo TypeScript no rompe el build (`pnpm build` no añade errores nuevos).
    - _Requirements: R1.7_

  - [x] 4.2 Crear `lib/log.ts` con logger mínimo
    - Implementa `log.info(obj)` y `log.error(obj)` que prefijan con timestamp ISO-8601 y serializan el objeto a JSON. No depende de librerías externas.
    - Archivos: `lib/log.ts`.
    - Aceptación: un test unitario en `__tests__/unit/log.test.ts` que captura `console.log` verifica que `log.info({ a: 1 })` emite `{"ts":"...","level":"info","a":1}`.
    - _Requirements: R25.3_

  - [x] 4.3 Crear `lib/api/respuestas.ts` con helpers de Response
    - Exporta `ok`, `creado`, `errorValidacion`, `errorConflicto`, `errorServidor`, `errorBdNoDisponible` exactamente como en `design.md`. Todos usan `Content-Type: application/json; charset=utf-8`.
    - Incluye `mensajePorCodigo(codigo: string)` con la tabla del catálogo de errores del design.
    - Archivos: `lib/api/respuestas.ts`.
    - Aceptación: test unitario en `__tests__/unit/respuestas.test.ts` que verifica que `errorConflicto('SKU_DUPLICADO')` devuelve `Response` con `status === 409`, header correcto y mensaje en español "Ya existe un producto con ese SKU.".
    - _Requirements: R21.7, R21.8_

  - [x] 4.4 Crear `lib/api/with-validation.ts`
    - Implementa `withValidation<T>(schema, req, handler)` que parsea `req.json()`, intenta `schema.safeParse`, en caso de fallo retorna `errorValidacion` con `{ campo, mensaje }` derivado de `error.issues`, y si pasa invoca `handler(parsed.data)`.
    - Si `req.json()` rechaza, usa `body = {}` antes del parse.
    - Archivos: `lib/api/with-validation.ts`.
    - Aceptación: test en `__tests__/unit/with-validation.test.ts` con un schema `z.object({ x: z.number() })` retorna 422 cuando se envía `{}` y 200 cuando se envía `{x:1}`.
    - _Requirements: R21.7_

  - [x] 4.5 Crear `lib/api/errores.ts` con `mapPrismaError`
    - Implementa `mapPrismaError(e)` que clasifica `PrismaClientKnownRequestError` con código `P2002` por nombre de columna (`sku → SKU_DUPLICADO`, `codigo_barras → CODIGO_BARRAS_DUPLICADO`, `folio → LIMITE_FOLIO_DIARIO`, fallback `CONFLICTO`), `P2025 → PRODUCTO_NO_ENCONTRADO 404`, y `PrismaClientInitializationError`/`PrismaClientRustPanicError → BD_NO_DISPONIBLE 503`. Cualquier otro error → `errorServidor('VENTA_FALLIDA')`.
    - Archivos: `lib/api/errores.ts`.
    - Aceptación: test unitario en `__tests__/unit/errores.test.ts` con instancias mock cubre los 5 caminos.
    - _Requirements: R2.4, R2.5, R25.1_

  - [x] 4.6 Crear `lib/mensajes-error.ts` con catálogo cliente
    - Exporta `MENSAJES_ERROR: Record<string, string>` con todos los códigos del catálogo de errores en español, y `toastDeError(codigo, fallback?)`.
    - Archivos: `lib/mensajes-error.ts`.
    - Aceptación: `toastDeError('SKU_DUPLICADO')` retorna `'Ya existe un producto con ese SKU.'`; `toastDeError('XXX', 'fb')` retorna `'fb'`.
    - _Requirements: R23.3, R25.4_

  - [x] 4.7 Crear `lib/api/serializadores.ts` con `toProductoDTO`
    - Implementa `ProductoDTO` y `toProductoDTO(p: PrismaProducto)` que convierte `Decimal → number` (con `Number(p.precio_compra)` y `redondearBancario`), serializa fechas a ISO, y calcula `estado_stock` siguiendo R7.1, R7.2, R7.3.
    - Añade `toVentaDTO(v: Venta & { items: VentaItem[] })` análogo.
    - Archivos: `lib/api/serializadores.ts`.
    - Aceptación: test unitario en `__tests__/unit/serializadores.test.ts` con productos mock cubre los tres `estado_stock`.
    - _Requirements: R7.1, R7.2, R7.3_

  - [x] 4.8 Crear esquemas Zod compartidos para Producto
    - Crea `lib/schemas/producto.ts` exportando `crearProductoSchema` y `editarProductoSchema` con todas las reglas (R2.3 rechaza valores negativos, `editarProductoSchema = crearProductoSchema.omit({stock_actual:true}).partial()`).
    - Archivos: `lib/schemas/producto.ts`.
    - Aceptación: `crearProductoSchema.safeParse({precio_venta:-1, ...})` falla; con datos válidos pasa.
    - _Requirements: R2.3, R3.2, R4.3_

  - [x] 4.9 Crear esquemas Zod compartidos para Venta y Configuración
    - Crea `lib/schemas/venta.ts` con `crearVentaSchema` (incluye el `superRefine` para `fiado → fiador_id` y `efectivo → monto_recibido`).
    - Crea `lib/schemas/configuracion.ts` con `actualizarConfiguracionSchema` (Object.partial) que valida los seis parámetros de R26.2 con sus tipos.
    - Crea `lib/schemas/ajuste-stock.ts` con `ajusteStockSchema` (`tipo` enum, `cantidad > 0`, `motivo? maxLength 240`).
    - Archivos: `lib/schemas/venta.ts`, `lib/schemas/configuracion.ts`, `lib/schemas/ajuste-stock.ts`.
    - Aceptación: tests unitarios cubren al menos un caso válido y uno inválido por schema.
    - _Requirements: R12.1, R17.2, R17.4, R26.2_

  - [x] 4.10 Checkpoint - Asegurar que tests unitarios y PBT P2/P6 pasan
    - Ejecuta `pnpm test:run __tests__/unit __tests__/property/money.test.ts __tests__/property/codigo-barras.test.ts` y confirma que todos pasan. Si surgen dudas sobre el formato de los DTOs o el catálogo de errores, consulta al usuario antes de continuar.



## Fase 5 — Capa de dominio (folio, inventario, ventas) con sus PBT

- [x] 5. Lógica de dominio del backend
  - [x] 5.1 Escribir test PBT de folio único e incremental (Property 7)
    - Crea `__tests__/property/folio.test.ts` con un `fc.assert` (numRuns: 50) que: (a) genera una fecha y un `K ∈ [2, 200]`, (b) llama `K` veces a `generarFolio(tx, fecha)` dentro de transacciones secuenciales contra una BD de prueba, (c) verifica que los `K` folios son distintos, que el sufijo `NNNN` es estrictamente creciente y que todos coinciden con `/^VTA-\d{8}-\d{4}$/`.
    - Añade un caso explícito para `K = 10001` que verifique que se lanza `LimiteFolioDiarioError` al exceder 9999.
    - Anota cabecera `// Property 7: Folio único e incremental por día`.
    - Archivos: `__tests__/property/folio.test.ts`.
    - Aceptación: el archivo compila pero falla porque `lib/dominio/folio.ts` aún no existe.
    - _PBT: Property 7 (`__tests__/property/folio.test.ts`)_
    - _Requirements: R18.6_

  - [x] 5.2 Implementar `lib/dominio/folio.ts`
    - Crea el archivo con `generarFolio(tx, fecha)` que: usa `formatInTimeZone(fecha, process.env.TZ ?? 'America/Mexico_City', 'yyyyMMdd')` de `date-fns-tz`, ejecuta dentro de `tx` un `SELECT ... FOR UPDATE` y un `UPDATE` (vía `tx.$queryRawUnsafe` o upsert + raw) que incrementa la fila `Configuracion` con clave `folio_seq:AAAAMMDD`, y lanza `LimiteFolioDiarioError` si el contador supera 9999.
    - Exporta también la clase `LimiteFolioDiarioError extends Error`.
    - Archivos: `lib/dominio/folio.ts`, `lib/dominio/errores.ts` (define las clases de error de dominio: `StockNegativoError`, `LimiteFolioDiarioError`, `ProductoNoEncontradoError`, `VentaFallidaError`).
    - Aceptación: `pnpm test:run __tests__/property/folio.test.ts` pasa.
    - _Requirements: R18.6_

  - [x] 5.3 Escribir test PBT del invariante de stock no negativo (Property 5)
    - Crea `__tests__/property/inventario-invariantes.test.ts` con `fc.assert` (numRuns: 50) que: (a) crea un producto con `stock_inicial ∈ [0, 100]`, (b) genera una secuencia `S` de 0..50 operaciones `{tipo:'ajuste', delta∈[-10,10]} | {tipo:'venta', cantidad∈[1,10]}`, (c) aplica cada una contra la BD vía `ajustarStock` o `registrarVenta`, (d) verifica que `producto.stock_actual >= 0` en todo estado intermedio y que cualquier intento de bajar más allá responde con error `STOCK_NEGATIVO` y NO modifica la fila.
    - Configura `permitir_sobreventa = false` antes del test.
    - Archivos: `__tests__/property/inventario-invariantes.test.ts`.
    - Aceptación: compila pero falla porque `lib/dominio/inventario.ts` aún no existe.
    - _PBT: Property 5 (`__tests__/property/inventario-invariantes.test.ts`)_
    - _Requirements: R12.3, R15.1, R15.2_

  - [x] 5.4 Implementar `lib/dominio/inventario.ts` — `crearProducto`
    - Crea el archivo (si no existe) e implementa `crearProducto(input: CrearProductoInput): Promise<Producto>`. Si `input.codigo_barras` está vacío, llama a `generarCodigoBarrasUnico()` (helper local que genera EAN-13 hasta encontrar uno no existente, máximo 5 intentos). Persiste con `prisma.producto.create`. No maneja errores aquí: deja que el handler los traduzca con `mapPrismaError`.
    - Archivos: `lib/dominio/inventario.ts`.
    - Aceptación: test unitario en `__tests__/unit/dominio-inventario-crear.test.ts` mock-ea Prisma y verifica que con `codigo_barras: undefined` se invoca `generarEan13` y que con uno explícito no.
    - _Requirements: R3.4, R9.1, R9.2_

  - [x] 5.5 Implementar `editarProducto` y `bajaLogica`
    - Añade en `lib/dominio/inventario.ts`: `editarProducto(id, input: EditarProductoInput)` que llama `prisma.producto.update`; `bajaLogica(id)` que setea `activo = false` y retorna `{id, activo: false}`.
    - El handler superior es responsable de rechazar `stock_actual` (via Zod `omit`).
    - Archivos: `lib/dominio/inventario.ts`.
    - Aceptación: test unitario verifica que `bajaLogica` produce `{id, activo:false}` y que `editarProducto` no toca `stock_actual` aún si llegara en input (defensa: `delete input.stock_actual` antes del update).
    - _Requirements: R4.2, R5.2, R5.4_

  - [x] 5.6 Implementar `ajustarStock` con transacción
    - Añade `ajustarStock(id, {tipo, cantidad, motivo?, usuario_id?})` con `prisma.$transaction`. Calcula `delta = signoPorTipo(tipo) * cantidad` (helper local: `entrada/devolucion = +1`, `salida/merma/ajuste = -1` si cantidad positiva representa salida, ver tabla en design). Lanza `StockNegativoError` si `nuevo < 0`. Inserta `MovimientoStock` con `stock_resultante = nuevo`.
    - **Decisión**: trata `cantidad` como magnitud positiva siempre y aplica el signo según tipo; documenta esta decisión en JSDoc.
    - Archivos: `lib/dominio/inventario.ts`.
    - Aceptación: `pnpm test:run __tests__/property/inventario-invariantes.test.ts` pasa.
    - _Requirements: R12.2, R12.3, R12.5_

  - [x] 5.7 Escribir test PBT del carrito (Property 3)
    - Crea `__tests__/property/carrito.test.ts` con tres `fc.assert`:
      - **3.1** `subtotal === redondearBancario(Σ precio_unitario × cantidad)`.
      - **3.2** `|total − (subtotal + impuestos)| < 0.005`.
      - **3.3** Para una secuencia de N escaneos sobre un carrito vacío con conjunto `P` de producto_ids distintos, las filas finales son `≤ |P|` y `Σ cantidades = N`.
    - Importa `useCarritoVenta` de `@/hooks/use-carrito-venta` y prueba sus métodos puros (sin renderizar React: extrae la lógica a una función pura `calcularTotales(items, porcentaje)` reutilizada por el hook).
    - Archivos: `__tests__/property/carrito.test.ts`.
    - Aceptación: compila pero falla hasta que se implemente la lógica del carrito en la fase 7.
    - _PBT: Property 3 (`__tests__/property/carrito.test.ts`)_
    - _Requirements: R14.3, R14.4, R16.1, R16.2, R16.3, R16.4_

  - [x] 5.8 Escribir test PBT de atomicidad de venta (Property 4)
    - Crea `__tests__/property/venta-atomicidad.test.ts` con dos `fc.assert` (numRuns: 30):
      - **4.a Éxito**: tras `POST /api/ventas` exitoso (llamando a `registrarVenta` directamente, no HTTP), exactamente 1 fila en `ventas`, N en `venta_items`, N en `movimientos_stock`, y `stock_post = stock_pre - cantidad` por producto.
      - **4.b Fallo**: extiende `PrismaClient` para que su método `movimientoStock.create` lance error tras la M-ésima invocación dentro de la tx; verifica que tras el fallo hay 0 filas creadas y `stock_actual` no cambió.
    - Archivos: `__tests__/property/venta-atomicidad.test.ts`.
    - Aceptación: compila pero falla hasta que `lib/dominio/ventas.ts` esté implementado.
    - _PBT: Property 4 (`__tests__/property/venta-atomicidad.test.ts`)_
    - _Requirements: R18.1, R18.4, R18.5_

  - [x] 5.9 Implementar `lib/dominio/ventas.ts` — `registrarVenta`
    - Implementa `registrarVenta(input)` exactamente como en `design.md` § Backend Modules > `lib/dominio/ventas.ts`: lock pesimista con `SELECT ... FOR UPDATE` vía `tx.$queryRaw`, lectura de configuración (`leerConfiguracionTx(tx)`), validación de stock por ítem, cálculo de subtotal/impuesto/total con `redondearBancario`, generación de folio dentro de la misma `tx`, inserción de `Venta`, `VentaItem` y `MovimientoStock` (`tipo='venta'`), y actualización de `stock_actual`. Timeout 5000 ms.
    - Crea también `leerConfiguracionTx(tx)` que lee las 6 claves desde la tabla `configuracion` con fallback a `CONFIG_DEFAULTS`.
    - Archivos: `lib/dominio/ventas.ts`, `lib/dominio/configuracion.ts`.
    - Aceptación: `pnpm test:run __tests__/property/venta-atomicidad.test.ts` pasa.
    - _Requirements: R16.2, R16.3, R16.4, R16.5, R18.1, R18.4_

  - [x] 5.10 Implementar `listarVentas` y `obtenerVenta`
    - Añade en `lib/dominio/ventas.ts`: `listarVentas({q?, desde?, hasta?, take=20, skip=0})` que usa `prisma.venta.findMany` con filtro por rango de fechas y `OR` en `folio`/relación a fiador (asumiendo tabla `fiadores` futura: por ahora sólo filtra por `folio`); `obtenerVenta(id)` que retorna `Venta` con `items` incluidos o lanza `ProductoNoEncontradoError` si no existe (usado para 404).
    - Archivos: `lib/dominio/ventas.ts`.
    - Aceptación: test unitario verifica filtros con datos seed.
    - _Requirements: R20.1, R20.2, R20.3, R20.5_

  - [x] 5.11 Checkpoint - Tests PBT P2, P5, P6, P7 deben pasar
    - Ejecuta `pnpm test:run __tests__/property` y confirma que P2, P5, P6 y P7 pasan. P1, P3, P4, P8 todavía pueden fallar (dependen de fases siguientes). Asegura que la fase de dominio funciona contra MySQL real.

## Fase 6 — Endpoints de la API

- [x] 6. Route Handlers de productos
  - [x] 6.1 Implementar `GET /api/productos` (listado)
    - Crea `app/api/productos/route.ts` con `export async function GET(req)` que: parsea query params `q`, `categoria_id`, `estado`, `take`, `skip` con un Zod schema (defaults `take=20`, `skip=0`); llama a un nuevo `dominio.listarProductos(filtros)`; serializa con `toProductoDTO`; devuelve `ok({items, total})`.
    - Implementa `listarProductos` en `lib/dominio/inventario.ts` con `prisma.producto.findMany`/`count` (filtra `activo:true`, `OR` en `nombre`/`sku`/`codigo_barras` con `contains`, filtro por `estado` calculado vía `WHERE` derivado).
    - Archivos: `app/api/productos/route.ts`, `lib/dominio/inventario.ts` (extensión).
    - Aceptación: `curl 'http://localhost:3000/api/productos?take=2'` retorna 200 con `{items: [...], total: N}` y `Content-Type: application/json; charset=utf-8`.
    - _Requirements: R5.3, R6.1, R6.2, R6.3, R6.4, R21.1, R21.8_

  - [x] 6.2 Implementar `POST /api/productos` (crear)
    - Añade `export async function POST(req)` en `app/api/productos/route.ts` que usa `withValidation(crearProductoSchema, req, async input => { ... })`. Si `input.codigo_barras` viene seteado, valida con `detectarFormato`; si es `null` lo emite `errorConflicto('CODIGO_BARRAS_INVALIDO', 400)`. Llama `dominio.crearProducto(input)`. Cualquier error → `mapPrismaError(e)`.
    - Archivos: `app/api/productos/route.ts`.
    - Aceptación: `curl -X POST -H 'Content-Type: application/json' -d '{"nombre":"X","sku":"S1","precio_venta":10}' http://localhost:3000/api/productos` retorna 201 con el producto creado.
    - _Requirements: R3.4, R9.4, R21.1, R21.7_

  - [x] 6.3 Implementar `GET /api/productos/[id]`
    - Crea `app/api/productos/[id]/route.ts` con `GET(req, {params})` que llama `prisma.producto.findUnique({where:{id}})`. Si null → `errorConflicto('PRODUCTO_NO_ENCONTRADO', 404)`. Si activo===false → también 404 (R5.3).
    - Archivos: `app/api/productos/[id]/route.ts`.
    - Aceptación: `curl http://localhost:3000/api/productos/<id-existente>` retorna 200; con id inexistente retorna 404 con `{error:{codigo:'PRODUCTO_NO_ENCONTRADO',...}}`.
    - _Requirements: R21.1_

  - [x] 6.4 Implementar `PATCH /api/productos/[id]`
    - Añade `PATCH(req, {params})` en el mismo archivo. Antes del schema, verifica si el body trae `stock_actual`: si sí, retorna `errorConflicto('USAR_AJUSTE_STOCK', 400)`. Luego `withValidation(editarProductoSchema, req, ...)`, llama `dominio.editarProducto(id, input)`. Si `codigo_barras` viene, valida formato.
    - Archivos: `app/api/productos/[id]/route.ts`.
    - Aceptación: `curl -X PATCH -H 'Content-Type: application/json' -d '{"stock_actual":99}' http://localhost:3000/api/productos/<id>` retorna 400 `USAR_AJUSTE_STOCK`. Con `{nombre:"Y"}` retorna 200.
    - _Requirements: R4.2, R4.3_

  - [x] 6.5 Implementar `DELETE /api/productos/[id]`
    - Añade `DELETE(req, {params})` que llama `dominio.bajaLogica(id)` y retorna `ok({id, activo: false})`. Trata `P2025 → 404`.
    - Archivos: `app/api/productos/[id]/route.ts`.
    - Aceptación: `curl -X DELETE http://localhost:3000/api/productos/<id>` retorna 200 y un `GET /api/productos` no incluye al producto eliminado.
    - _Requirements: R5.2, R5.3, R5.4_

  - [x] 6.6 Implementar `GET /api/productos/por-codigo/[codigo]` (con PBT P1)
    - Crea `app/api/productos/por-codigo/[codigo]/route.ts` con `GET` que: valida que `codigo` tenga `1 ≤ |codigo| ≤ 48` (si no, `CODIGO_BARRAS_INVALIDO`); ejecuta `prisma.producto.findUnique({where:{codigo_barras:codigo}})`; si null → 404; si encontrado → `ok(toProductoDTO(p))`.
    - Archivos: `app/api/productos/por-codigo/[codigo]/route.ts`.
    - Aceptación: `curl http://localhost:3000/api/productos/por-codigo/<codigo-seed>` retorna 200; código inexistente retorna 404.
    - _Requirements: R11.2, R11.3, R24.2_

  - [x] 6.7 Completar el test PBT de Round-trip de código (Property 1, parte EAN-13)
    - Extiende `__tests__/property/codigo-barras.test.ts` (o crea `__tests__/property/round-trip-codigo.test.ts`) con un test de integración: `∀ producto generado por el sistema sin codigo_barras explícito`, llama `crearProducto({nombre:'X', sku:`S-${i}`, precio_venta:10})` (sin código), captura el `codigo_barras` retornado, hace `fetch GET /api/productos/por-codigo/{codigo}` y verifica que `producto.id` coincide.
    - Usa numRuns: 30 con `fc.asyncProperty`.
    - Archivos: `__tests__/property/round-trip-codigo.test.ts`.
    - Aceptación: `pnpm test:run __tests__/property/round-trip-codigo.test.ts` pasa contra el servidor en `localhost:3000` o via inyección directa de los handlers.
    - _PBT: Property 1 (round-trip EAN-13) (`__tests__/property/round-trip-codigo.test.ts`)_
    - _Requirements: R11.1, R11.2_

  - [x] 6.8 Implementar `POST /api/productos/[id]/ajuste-stock`
    - Crea `app/api/productos/[id]/ajuste-stock/route.ts` con `POST` que usa `withValidation(ajusteStockSchema, ...)`. Llama `dominio.ajustarStock(id, input)`. Captura `StockNegativoError → errorConflicto('STOCK_NEGATIVO', 400)`, `P2025 → 404`.
    - Archivos: `app/api/productos/[id]/ajuste-stock/route.ts`.
    - Aceptación: `curl -X POST -d '{"tipo":"entrada","cantidad":5}' .../ajuste-stock` retorna 201 con `{producto, movimiento}`. Una salida que dejaría stock negativo retorna 400 `STOCK_NEGATIVO`.
    - _Requirements: R12.1, R12.2, R12.3_

  - [x] 6.9 Implementar `GET /api/productos/[id]/movimientos`
    - Crea `app/api/productos/[id]/movimientos/route.ts` con `GET` que: parsea `take`, `skip`; verifica que el producto exista (404 si no); retorna `prisma.movimientoStock.findMany({where:{producto_id:id}, orderBy:{creado_en:'desc'}, take, skip})` con su `count`.
    - Archivos: `app/api/productos/[id]/movimientos/route.ts`.
    - Aceptación: tras un ajuste de stock, el endpoint lista al menos 1 movimiento ordenado por `creado_en DESC`.
    - _Requirements: R13.2, R13.3_

- [x] 7. Route Handlers de categorías, resumen y configuración
  - [x] 7.1 Implementar `GET /api/categorias`
    - Crea `app/api/categorias/route.ts` con `GET` que retorna `prisma.categoria.findMany({orderBy:{nombre:'asc'}})`.
    - Archivos: `app/api/categorias/route.ts`.
    - Aceptación: `curl /api/categorias` retorna las 4 categorías seed.
    - _Requirements: R21.4_

  - [x] 7.2 Implementar `POST /api/categorias`
    - Añade `POST` en el mismo archivo con `withValidation(z.object({nombre: z.string().min(1).max(80)}), ...)`. Captura `P2002 → CATEGORIA_DUPLICADA 409`.
    - Archivos: `app/api/categorias/route.ts`.
    - Aceptación: crear dos veces la misma categoría retorna 201 y luego 409 `CATEGORIA_DUPLICADA`.
    - _Requirements: R21.4_

  - [x] 7.3 Implementar `GET /api/inventario/resumen`
    - Crea `app/api/inventario/resumen/route.ts` con `GET` que ejecuta cuatro `prisma.producto.count` con `WHERE activo:true` y los predicados de Estado_Stock (R7) calculados con `OR`/expresiones. Retorna `{total, en_stock, bajo_stock, critico}`.
    - Archivos: `app/api/inventario/resumen/route.ts`.
    - Aceptación: `curl /api/inventario/resumen` retorna las 4 cifras y la suma `en_stock + bajo_stock + critico === total`.
    - _Requirements: R8.2, R8.3_

  - [x] 7.4 Implementar `GET /api/configuracion`
    - Crea `app/api/configuracion/route.ts` con `GET` que: lee todas las filas de `configuracion`, las parsea con su tipo correspondiente (boolean→`'true'/'false'`, number→`Number()`), aplica `CONFIG_DEFAULTS` para claves faltantes, retorna `{porcentaje_impuesto, etiqueta_ancho_mm, etiqueta_alto_mm, ticket_ancho_mm, imprimir_automaticamente, permitir_sobreventa}`.
    - Define `CONFIG_DEFAULTS` y `parseConfiguracion(filas)` en `lib/dominio/configuracion.ts` (extiende lo creado en 5.9).
    - Archivos: `app/api/configuracion/route.ts`, `lib/dominio/configuracion.ts`.
    - Aceptación: `curl /api/configuracion` retorna los 6 valores seed.
    - _Requirements: R26.1, R26.4_

  - [x] 7.5 Implementar `PUT /api/configuracion`
    - Añade `PUT` en el mismo archivo con `withValidation(actualizarConfiguracionSchema, ...)` que hace `prisma.configuracion.upsert` por cada clave presente en el input. Retorna la configuración completa post-actualización.
    - Archivos: `app/api/configuracion/route.ts`.
    - Aceptación: `curl -X PUT -d '{"porcentaje_impuesto":16}' /api/configuracion` retorna 200 con `porcentaje_impuesto:16` y un `GET` posterior lo refleja.
    - _Requirements: R26.3_

- [x] 8. Route Handlers de ventas
  - [x] 8.1 Implementar `GET /api/ventas`
    - Crea `app/api/ventas/route.ts` con `GET` que parsea `q?, desde?, hasta?, take=20, skip=0`, llama `dominio.listarVentas(filtros)`, retorna `{items: VentaDTO[], total}`.
    - Archivos: `app/api/ventas/route.ts`.
    - Aceptación: `curl /api/ventas?take=5` retorna 200 con array (vacío si no hay ventas).
    - _Requirements: R20.1, R20.2, R20.3, R21.6_

  - [x] 8.2 Implementar `POST /api/ventas` (atómica)
    - Añade `POST` con `withValidation(crearVentaSchema, req, async input => { ... })`. Llama `dominio.registrarVenta(input)`. Captura: `StockNegativoError → 400`, `LimiteFolioDiarioError → 409`, `Prisma.PrismaClientKnownRequestError P2028 → VENTA_TIMEOUT 504`, `PrismaClientInitializationError → BD_NO_DISPONIBLE 503` (con `log.error({ts, folio_intentado:null, codigo:'BD_NO_DISPONIBLE'})`), default → `errorServidor('VENTA_FALLIDA',500)`.
    - En éxito: `log.info({folio: venta.folio, total: venta.total, metodo_pago: venta.metodo_pago})` y retorna `creado(toVentaDTO(venta))`.
    - Archivos: `app/api/ventas/route.ts`.
    - Aceptación: `curl -X POST -d '{"items":[{"producto_id":"<id>","cantidad":1,"precio_unitario":10}],"metodo_pago":"efectivo","monto_recibido":10}' /api/ventas` retorna 201 con folio `VTA-AAAAMMDD-NNNN` y stock decrementado.
    - _Requirements: R18.1, R18.5, R18.6, R25.1, R25.3_

  - [x] 8.3 Implementar `GET /api/ventas/[id]`
    - Crea `app/api/ventas/[id]/route.ts` con `GET` que llama `dominio.obtenerVenta(id)` con `include: {items: {include: {producto: true}}, ...}`. 404 si no existe.
    - Archivos: `app/api/ventas/[id]/route.ts`.
    - Aceptación: tras la venta del paso 8.2, `curl /api/ventas/<id>` retorna 200 con `items` poblados.
    - _Requirements: R20.5, R21.6_

  - [x] 8.4 Checkpoint - Verificar todos los endpoints
    - Ejecuta `pnpm test:run __tests__/property` y confirma que P1, P2, P4, P5, P6, P7 pasan. Lanza `pnpm dev` y verifica con `curl` cada endpoint del catálogo de la sección API Design del design. Si surgen dudas sobre el shape exacto de algún endpoint, consulta al usuario.



## Fase 7 — Hooks de cliente

- [x] 9. Hooks reutilizables
  - [x] 9.1 Crear `hooks/use-debounced-value.ts`
    - Implementa `useDebouncedValue<T>(value: T, delay = 300): T` con `useState` + `useEffect` + `setTimeout`/`clearTimeout`.
    - Archivos: `hooks/use-debounced-value.ts`.
    - Aceptación: test unitario en `__tests__/unit/use-debounced-value.test.ts` con `@testing-library/react` y `vi.useFakeTimers()` verifica que el valor sólo cambia tras 300 ms.
    - _Requirements: R6.1, R20.2_

  - [x] 9.2 Crear `lib/api/cliente.ts` con `fetchJson`
    - Implementa `fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T>` que: añade `Content-Type: application/json` por defecto en POST/PUT/PATCH, parsea JSON, si `!response.ok` lanza `ApiError({codigo, mensaje, status})` desde el body, y si la promesa rechaza por red lanza `RedError`.
    - Archivos: `lib/api/cliente.ts`.
    - Aceptación: test con `msw` cubre 200, 422, 500 y rechazo de red.
    - _Requirements: R25.4_

  - [x] 9.3 Crear `hooks/use-configuracion.ts` con caché en Context
    - Implementa `ConfiguracionProvider` (Context React) que en mount hace `fetch GET /api/configuracion` y cachea el resultado en estado local. Expone `useConfiguracion()` que retorna `{data: Configuracion, refetch: () => void, actualizar: (parcial) => Promise<void>}`. Si `data` aún no carga, retorna `CONFIG_DEFAULTS`.
    - Define `CONFIG_DEFAULTS` (tipo y valores) en el mismo archivo.
    - Archivos: `hooks/use-configuracion.ts`.
    - Aceptación: test con `@testing-library/react` y `msw` verifica que `useConfiguracion()` arranca con defaults y luego refleja los valores del fetch.
    - _Requirements: R26.3, R26.4_

  - [x] 9.4 Montar `ConfiguracionProvider` y `<Toaster />` en `app/layout.tsx`
    - Edita `app/layout.tsx` para envolver `{children}` con `<ConfiguracionProvider>` y añadir `<Toaster richColors position="top-right" />` de `sonner`. No alteres metadata, fuentes ni `<Analytics />`.
    - Archivos: `app/layout.tsx`.
    - Aceptación: la app compila y al ejecutar `pnpm dev` no hay errores de hidratación; un `toast.success('hola')` se muestra desde cualquier sección.
    - _Requirements: R23.1, R23.2_

  - [x] 9.5 Sincronizar configuración con CSS variables (etiqueta y ticket)
    - Dentro de `ConfiguracionProvider`, añade un `useEffect` que cuando `data` cambia setea en `document.documentElement.style`: `--etiqueta-ancho`, `--etiqueta-alto`, `--ticket-ancho` con sus valores en `mm`.
    - Archivos: `hooks/use-configuracion.ts`.
    - Aceptación: tras un `actualizar({etiqueta_ancho_mm: 60})`, `getComputedStyle(document.documentElement).getPropertyValue('--etiqueta-ancho')` devuelve `60mm`.
    - _Requirements: R10.5, R26.3_

  - [x] 9.6 Crear `hooks/use-barcode-scanner.ts`
    - Implementa el hook exactamente como en `design.md` § Hooks: detección por timing con umbral 80 ms, longitud mínima 4, cola FIFO, y dispatcher `drenar()` que se asegura de no procesar dos códigos en paralelo. Listener en `window` con cleanup en unmount.
    - Archivos: `hooks/use-barcode-scanner.ts`.
    - Aceptación: test unitario en `__tests__/unit/use-barcode-scanner.test.tsx` que con `vi.useFakeTimers()` simula 13 `keydown` separados por 50 ms terminando en `Enter` y verifica que `onScan` se invoca exactamente 1 vez con la secuencia completa. Otro caso: pausa de 200 ms entre teclas no dispara escaneo.
    - _Requirements: R14.2, R14.6, R24.1, R24.3_

  - [x] 9.7 Implementar la lógica pura `calcularTotales` del carrito
    - Crea `lib/carrito.ts` con `calcularTotales(items: ItemCarrito[], porcentajeImpuesto: number): CarritoTotales` y los tipos `ItemCarrito`, `CarritoTotales`. Usa `redondearBancario`. No depende de React.
    - Archivos: `lib/carrito.ts`.
    - Aceptación: el test PBT P3 (`__tests__/property/carrito.test.ts`) pasa al menos los sub-invariantes 3.1 y 3.2.
    - _Requirements: R16.1, R16.2, R16.3, R16.4, R16.5_

  - [x] 9.8 Crear `hooks/use-carrito-venta.ts`
    - Implementa el hook con estado `items: ItemCarrito[]` (`useState`), `agregarOIncrementar(producto)`, `setCantidad(producto_id, cantidad)`, `eliminar(producto_id)`, `limpiar()`, `serializarParaApi()`. Calcula `totales` con `useMemo` llamando a `calcularTotales`. Respeta `permitir_sobreventa` consultando `useConfiguracion()`: si `false` y `cantidad > stock_actual`, no incrementa más allá del máximo y retorna un flag `excedeStock=true`.
    - Archivos: `hooks/use-carrito-venta.ts`.
    - Aceptación: test unitario en `__tests__/unit/use-carrito-venta.test.tsx` cubre: agregar dos veces el mismo producto incrementa cantidad; eliminar quita la fila; `setCantidad(_, 0)` mantiene `cantidad ≥ 1`; con `stock_actual=2` y `permitir_sobreventa=false`, intentar agregar 3 deja en 2.
    - El test PBT P3 sub-invariante 3.3 también pasa.
    - _Requirements: R14.3, R14.4, R14.7, R14.8, R15.1, R15.2, R15.3_

  - [x] 9.9 Checkpoint - Hooks listos y P3 pasa
    - Ejecuta `pnpm test:run __tests__/property/carrito.test.ts __tests__/unit` y confirma que pasan. Si la decisión sobre `permitir_sobreventa` o el comportamiento de `setCantidad` con valores fuera de rango causa fricción con la UI por implementar, consulta al usuario.

## Fase 8 — UI Inventario

- [x] 10. Tabla, formulario y diálogos de Inventario
  - [x] 10.1 Crear `components/inventario/inventario-table.tsx` (lectura)
    - Component cliente que: usa `useEffect`+`fetchJson('/api/productos')` con paginación (state `take=20`, `skip=0`); recibe `searchTerm` por prop y aplica `useDebouncedValue` antes de pegarlo en el query string; renderiza `Table` shadcn con columnas SKU, Producto, Categoría, Stock (`stock_actual/stock_minimo`), Precio, Estado (Badge con colores R7.4), Acciones (placeholders deshabilitados por ahora).
    - Mantiene la paleta de colores y estructura visual del archivo `inventario-section.tsx` actual.
    - Archivos: `components/inventario/inventario-table.tsx`.
    - Aceptación: render manual en `localhost:3000` muestra los 6 productos seed con badges del estado correcto.
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R7.4, R22.1, R22.2, R22.5_

  - [x] 10.2 Sustituir el array hardcoded en `components/sections/inventario-section.tsx`
    - Reemplaza el array `products` y la `Table` inline por: estado local `{tipo: 'crear' | 'editar' | 'eliminar' | 'ajustar' | 'historial' | 'imprimir' | null, productoId?: string}`; `<InventarioTable searchTerm={searchTerm} onAccion={(tipo, productoId) => setEstado({tipo, productoId})} />`; el botón "Nuevo Producto" llama a `setEstado({tipo:'crear'})`. Conserva la barra de filtros, las 4 tarjetas y el wrapping visual existente.
    - Aún no monta los diálogos (eso va en tareas siguientes).
    - Archivos: `components/sections/inventario-section.tsx`.
    - Aceptación: la sección Inventario sigue renderizando, ahora con datos reales de la API; los botones de acción no rompen nada (no-op por ahora).
    - _Requirements: R22.5_

  - [x] 10.3 Crear `components/inventario/producto-form-dialog.tsx`
    - Dialog flotante con `react-hook-form` + `zodResolver(crearProductoSchema | editarProductoSchema)` según prop `modo: 'crear' | 'editar'`. Campos: nombre, sku, codigo_barras, categoria_id (Select que fetch-ea `/api/categorias`), precio_compra, precio_venta, stock_actual (sólo en `crear`), stock_minimo, unidad. Si `modo === 'editar'` precarga los valores via prop `producto: ProductoDTO`.
    - On submit: `POST /api/productos` o `PATCH /api/productos/[id]`. En éxito: `toast.success('Producto creado'|'Producto actualizado')`, cierra el dialog, llama prop `onGuardado()`.
    - En error 422: muestra `errores` por campo. En 409 SKU/CODIGO: pinta error global con `setError('root', {message: ...})`.
    - Archivos: `components/inventario/producto-form-dialog.tsx`.
    - Aceptación: alta y edición funcionales desde la UI; un SKU duplicado muestra el toast y mantiene el dialog abierto.
    - _Requirements: R3.1, R3.2, R3.4, R3.5, R3.6, R4.1, R4.2, R4.4, R22.1, R22.3, R22.5_

  - [x] 10.4 Cablear `producto-form-dialog` a `inventario-section`
    - En `inventario-section.tsx`, monta `<ProductoFormDialog open={tipo==='crear'||tipo==='editar'} modo={...} producto={...} onClose={() => setEstado({tipo:null})} onGuardado={() => { setEstado({tipo:null}); setRefreshKey(k=>k+1) }} />`. Usa `refreshKey` para forzar un refetch de la tabla.
    - Archivos: `components/sections/inventario-section.tsx`, `components/inventario/inventario-table.tsx` (acepta prop `refreshKey`).
    - Aceptación: tras crear un producto, la tabla se refresca y muestra la nueva fila sin recargar la página.
    - _Requirements: R3.5, R4.4_

  - [x] 10.5 Crear `components/inventario/eliminar-producto-dialog.tsx`
    - `AlertDialog` shadcn que muestra `nombre` y `sku` del producto. Al confirmar: `DELETE /api/productos/[id]`, `toast.success('Producto eliminado')`, llama `onEliminado()`.
    - Archivos: `components/inventario/eliminar-producto-dialog.tsx`.
    - Aceptación: confirma eliminación; el producto desaparece de la tabla.
    - _Requirements: R5.1, R5.2, R5.3, R23.1, R23.4_

  - [x] 10.6 Cablear `eliminar-producto-dialog` a `inventario-section`
    - Monta `<EliminarProductoDialog open={tipo==='eliminar'} producto={...} onClose={...} onEliminado={...} />`. La acción "trash" en cada fila de `inventario-table.tsx` invoca `onAccion('eliminar', producto.id)`.
    - Archivos: `components/sections/inventario-section.tsx`, `components/inventario/inventario-table.tsx`.
    - Aceptación: ciclo completo de eliminación funciona.
    - _Requirements: R5.1_

  - [x] 10.7 Crear `components/inventario/ajustar-stock-dialog.tsx`
    - Dialog con `react-hook-form` + `zodResolver(ajusteStockSchema)`. Campos: `tipo` (Select con 5 opciones de `TipoMovimiento` excepto `venta`), `cantidad` (number > 0), `motivo` (textarea ≤ 240 chars). Muestra el `stock_actual` actual y un preview "Stock resultante: X".
    - On submit: `POST /api/productos/[id]/ajuste-stock`. En éxito: toast "Stock ajustado", refrescar tabla. En 400 STOCK_NEGATIVO: toast "Stock insuficiente para completar la operación.".
    - Archivos: `components/inventario/ajustar-stock-dialog.tsx`.
    - Aceptación: ajuste de entrada `+5` aumenta el stock en la tabla; salida que excede stock muestra toast de error.
    - _Requirements: R12.1, R12.2, R12.3, R23.1_

  - [x] 10.8 Cablear `ajustar-stock-dialog` a `inventario-section`
    - Añade la opción al menú de acciones de fila e instancia el dialog con `tipo === 'ajustar'`.
    - Archivos: `components/sections/inventario-section.tsx`, `components/inventario/inventario-table.tsx`.
    - Aceptación: ciclo completo funciona end-to-end.
    - _Requirements: R12.1_

  - [x] 10.9 Crear `components/inventario/historial-movimientos-dialog.tsx`
    - Dialog de sólo lectura que `fetchJson('/api/productos/[id]/movimientos?take=50&skip=0')` al abrir. Renderiza `Table` con: Fecha, Tipo (Badge), Cantidad (con signo), Stock resultante, Motivo, Referencia (si `referencia_id` existe, link con texto del folio). Botones de paginación "Anterior"/"Siguiente".
    - Archivos: `components/inventario/historial-movimientos-dialog.tsx`.
    - Aceptación: tras varios ajustes, el historial muestra los movimientos ordenados por `creado_en DESC`.
    - _Requirements: R13.1, R13.2, R13.3_

  - [x] 10.10 Cablear `historial-movimientos-dialog` a `inventario-section`
    - Monta el dialog con `tipo === 'historial'`.
    - Archivos: `components/sections/inventario-section.tsx`.
    - Aceptación: opción "Ver historial" en el menú de fila abre el dialog con datos.
    - _Requirements: R13.1_

  - [x] 10.11 Crear `components/inventario/etiqueta-preview.tsx`
    - Component puro (no client-side state) que recibe `producto: ProductoDTO`. Renderiza dentro de un `<div className="imprimir-etiqueta">` el `nombre`, `precio_venta` con formato "$X.XX", y el `codigo_barras` como SVG generado con `jsbarcode` (vía `useEffect` + `useRef<SVGSVGElement>`). Si el código es EAN-13 usa `format='EAN13'`; si es Code128 usa `format='CODE128'`.
    - Archivos: `components/inventario/etiqueta-preview.tsx`.
    - Aceptación: en una página de prueba el SVG se genera y muestra el código legible.
    - _Requirements: R10.1, R10.2_

  - [x] 10.12 Escribir test PBT de cantidad de etiquetas (Property 8)
    - Crea `__tests__/property/etiqueta-cantidad.test.tsx` con dos `fc.assert`:
      - **8.a Inválido**: `∀ n ∈ ℤ con n < 1 ∨ n > 100`, el formulario rechaza el valor (assert que el botón "Imprimir" queda disabled o que el `submit` lanza error de validación) y `window.print` mock NO es llamado.
      - **8.b Válido**: `∀ n ∈ [1, 100]`, al confirmar, el DOM contiene exactamente `n` instancias de `.imprimir-etiqueta`.
    - Usa `@testing-library/react` y `vi.spyOn(window, 'print')`.
    - Archivos: `__tests__/property/etiqueta-cantidad.test.tsx`.
    - Aceptación: el archivo compila pero falla porque `imprimir-etiqueta-dialog.tsx` aún no existe.
    - _PBT: Property 8 (`__tests__/property/etiqueta-cantidad.test.tsx`)_
    - _Requirements: R10.4_

  - [x] 10.13 Crear `components/inventario/imprimir-etiqueta-dialog.tsx`
    - Dialog con `react-hook-form` + `zodResolver(z.object({cantidad: z.number().int().min(1).max(100)}))`. Body: input numérico `cantidad` y vista previa de UNA etiqueta vía `<EtiquetaPreview producto={...} />`. Botón "Imprimir": al click renderiza `cantidad` instancias de `<EtiquetaPreview>` dentro de un wrapper, y luego invoca `window.print()`.
    - Lee `useConfiguracion()` para aplicar `etiqueta_ancho_mm` y `etiqueta_alto_mm` (las CSS vars ya están seteadas globalmente; sólo verifica que la preview respete el tamaño).
    - Archivos: `components/inventario/imprimir-etiqueta-dialog.tsx`.
    - Aceptación: `pnpm test:run __tests__/property/etiqueta-cantidad.test.tsx` (P8) pasa con 100 runs.
    - _Requirements: R10.1, R10.3, R10.4, R10.5_

  - [x] 10.14 Cablear `imprimir-etiqueta-dialog` a `inventario-section`
    - Añade la opción "Imprimir etiqueta" al menú de acciones e instancia el dialog con `tipo === 'imprimir'`.
    - Archivos: `components/sections/inventario-section.tsx`, `components/inventario/inventario-table.tsx`.
    - Aceptación: ciclo de impresión visible en la previsualización del navegador.
    - _Requirements: R10.1_

  - [x] 10.15 Cablear las 4 tarjetas resumen al endpoint
    - En `components/sections/inventario-section.tsx`, reemplaza los conteos hardcoded por un `useEffect` que `fetchJson('/api/inventario/resumen')` y mapea `total → "Total Productos"`, `en_stock → "En Stock"`, `bajo_stock → "Bajo Stock"`, `critico → "Crítico"`. Cuando se invoque `setRefreshKey`, también refetch las tarjetas.
    - Archivos: `components/sections/inventario-section.tsx`.
    - Aceptación: las cifras corresponden a los datos reales y se actualizan tras cualquier alta/baja/ajuste.
    - _Requirements: R8.1, R8.2, R8.3_

  - [x] 10.16 Añadir filtros de categoría y estado a la tabla
    - En `inventario-table.tsx`, añade dos `Select` shadcn (uno con las categorías fetched de `/api/categorias`, otro con `["", "En Stock", "Bajo Stock", "Crítico"]`). Inyecta los valores como query params al fetch. Mantén el debounce sólo para el campo de búsqueda.
    - Archivos: `components/inventario/inventario-table.tsx`.
    - Aceptación: filtrar por categoría limita las filas; filtrar por estado coincide con el badge de cada fila.
    - _Requirements: R6.2, R6.3_

  - [x] 10.17 Añadir `aria-label` a los iconos-botón
    - En `inventario-table.tsx`, añade `aria-label="Editar"`, `aria-label="Eliminar"`, `aria-label="Ajustar stock"`, `aria-label="Ver historial"`, `aria-label="Imprimir etiqueta"` a cada `<Button>` con icono.
    - Archivos: `components/inventario/inventario-table.tsx`.
    - Aceptación: inspector de accesibilidad del navegador o `axe-core` reporta los labels correctos.
    - _Requirements: R23.4, R23.6_

  - [x] 10.18 Checkpoint - Inventario funcional end-to-end
    - Ejecuta el flujo manual: crear producto → editar → ajustar stock → ver historial → imprimir etiqueta (preview) → eliminar. Verifica que cada paso muestre el toast correcto y refresque la tabla. Si surge ambigüedad con la UI (p.ej. orden de columnas o variantes de Badge), consulta al usuario.

## Fase 9 — UI Ventas

- [x] 11. Tabla, diálogo de venta y subcomponentes
  - [x] 11.1 Crear `components/ventas/ventas-table.tsx`
    - Component cliente que `fetchJson('/api/ventas?take=20&skip=N&q=...&desde=...&hasta=...')`. Columnas: ID Venta (`folio`), Fecha (formateada con `date-fns`), Cliente (placeholder "—" si no hay fiador, o "Fiador #id" hasta integrar Fiadores), Items (cuenta de `items.length`), Total (formateado), Pago (Badge), Estado (Badge), Acciones (Eye, Printer).
    - Recibe prop `searchTerm` con debounce y `onAccion(tipo, ventaId)` para `'detalle' | 'reimprimir'`.
    - Archivos: `components/ventas/ventas-table.tsx`.
    - Aceptación: la sección Ventas muestra ventas reales (vacías al inicio, pobladas tras el flujo de venta).
    - _Requirements: R20.1, R20.2_

  - [x] 11.2 Sustituir el array hardcoded en `components/sections/ventas-section.tsx`
    - Reemplaza `sales` y la tabla inline por `<VentasTable searchTerm={searchTerm} ... onAccion={...} refreshKey={refreshKey}/>`. Estado local `{tipo: 'nueva' | 'ticket' | 'detalle' | null, ventaId?: string}`. Botón "Nueva Venta" llama `setEstado({tipo:'nueva'})`. Conserva las 4 tarjetas con cifras "—" por ahora.
    - Archivos: `components/sections/ventas-section.tsx`.
    - Aceptación: render funcional con datos reales sin diálogos aún cableados.
    - _Requirements: R22.5_

  - [x] 11.3 Crear `components/ventas/carrito-table.tsx`
    - Component que recibe `items: ItemCarrito[]`, `onCambiarCantidad(producto_id, cantidad)`, `onEliminar(producto_id)`. Renderiza `Table` con columnas: Producto, Precio Unit., Cantidad (input numérico inline con min=1), Subtotal Línea, Acción (Trash). Resalta filas con `excedeStock` con un badge "Sobreventa" si aplica.
    - Archivos: `components/ventas/carrito-table.tsx`.
    - Aceptación: cambiar cantidad recalcula visualmente; eliminar quita la fila.
    - _Requirements: R14.7, R14.8, R15.3_

  - [x] 11.4 Crear `components/ventas/pago-form.tsx`
    - Component con `react-hook-form` + `zodResolver(crearVentaSchema.partial({items:true}))` (solo la sección de pago). Campos: `metodo_pago` (RadioGroup con 4 opciones), `monto_recibido` (visible sólo si `efectivo`), `fiador_id` (Select visible sólo si `fiado`; mock con opciones vacías y un link "Abrir Fiadores" placeholder cuando esté vacío).
    - Calcula y muestra "Cambio: $X.XX" cuando `efectivo` y `monto_recibido >= total`.
    - Botón "Cobrar" disabled si: items vacíos OR (efectivo AND monto_recibido < total) OR (fiado AND !fiador_id).
    - Recibe `total` por prop. Emite `onCobrar(payload)` con el shape exacto requerido por `POST /api/ventas`.
    - Archivos: `components/ventas/pago-form.tsx`.
    - Aceptación: validaciones inline funcionan según los criterios R17.2, R17.3, R17.4.
    - _Requirements: R17.1, R17.2, R17.3, R17.4, R17.5_

  - [x] 11.5 Crear `components/ventas/nueva-venta-dialog.tsx` (esqueleto)
    - Dialog full-screen (`max-w-5xl`). Layout: panel izquierdo con `<CarritoTable>` y totales; panel derecho con `<PagoForm>`. Mantiene `<input className="sr-only" tabIndex={-1} aria-hidden ref={hiddenRef} />` siempre presente.
    - `useCarritoVenta()` para el estado del carrito. `onCobrar` aún no llama a la API: sólo `console.log` por ahora.
    - Implementa `onClick` en el wrapper del Dialog que refoca `hiddenRef` con `requestAnimationFrame`.
    - Archivos: `components/ventas/nueva-venta-dialog.tsx`.
    - Aceptación: el dialog abre, el campo oculto recibe foco, el carrito acepta items inyectados manualmente para test (vía un botón temporal que se eliminará luego).
    - _Requirements: R14.1, R14.6, R22.1, R22.3_

  - [x] 11.6 Cablear `useBarcodeScanner` en `nueva-venta-dialog.tsx`
    - Activa el hook con `enabled: open`. En `onScan(codigo)`: `fetchJson('/api/productos/por-codigo/' + encodeURIComponent(codigo))`; en éxito llama `carrito.agregarOIncrementar(producto)`; en 404 `toast.error('Código no encontrado')`; en error red `toast.error('Error de conexión...')`. Tras cualquier resultado, refoca `hiddenRef`.
    - Si `carrito.agregarOIncrementar` retorna `excedeStock=true`, `toast.error('Stock insuficiente para ' + producto.nombre)` (R15.1).
    - Archivos: `components/ventas/nueva-venta-dialog.tsx`.
    - Aceptación: con el lector USB-HID o simulando keydowns, el carrito se va llenando.
    - _Requirements: R14.2, R14.3, R14.4, R14.5, R14.6, R15.1, R23.2, R24.3_

  - [x] 11.7 Implementar el cobro real en `nueva-venta-dialog.tsx`
    - En `onCobrar(payload)`: combina con `carrito.serializarParaApi().items` y los datos del form, hace `POST /api/ventas`. En 201: `toast.success('Venta registrada')`, `carrito.limpiar()`, llama prop `onVentaCreada(venta)`. En 400/409/500/503/504: muestra toast con el mensaje del catálogo. Mantén el dialog abierto en error (R25.4).
    - Archivos: `components/ventas/nueva-venta-dialog.tsx`.
    - Aceptación: una venta exitosa retorna folio y dispara `onVentaCreada`.
    - _Requirements: R18.5, R23.2, R25.1, R25.4_

  - [x] 11.8 Implementar confirmación de cierre con carrito no vacío
    - En `nueva-venta-dialog.tsx`, intercepta `onOpenChange(false)`: si `carrito.items.length > 0`, abre un `AlertDialog` "¿Descartar venta en curso?"; si confirma → `carrito.limpiar()` y cierra. Si vacío → cierra directo.
    - Archivos: `components/ventas/nueva-venta-dialog.tsx`.
    - Aceptación: presionar `Escape` con carrito vacío cierra; con items abre la confirmación.
    - _Requirements: R23.5_

  - [x] 11.9 Crear `components/ventas/ticket-preview.tsx`
    - Component puro que recibe `venta: VentaDTO`. Renderiza dentro de `<div className="imprimir-ticket">`: encabezado con folio, fecha y hora; tabla de items (cantidad, descripción, precio unit, subtotal línea); totales (subtotal, impuesto, total); método de pago, monto recibido y cambio cuando aplica.
    - Usa `date-fns` para formato de fecha local.
    - Archivos: `components/ventas/ticket-preview.tsx`.
    - Aceptación: render manual con una venta seed muestra todos los campos.
    - _Requirements: R19.2_

  - [x] 11.10 Crear `components/ventas/ticket-dialog.tsx`
    - Dialog con `<TicketPreview venta={venta} />` y dos botones: "Imprimir ticket" (invoca `window.print()`) y "Nueva venta" (llama prop `onNuevaVenta()` que cierra el ticket y abre `NuevaVentaDialog` reseteado).
    - Lee `useConfiguracion()` y si `imprimir_automaticamente`, invoca `window.print()` en el `useEffect` de mount.
    - Archivos: `components/ventas/ticket-dialog.tsx`.
    - Aceptación: tras una venta exitosa, el ticket se abre; con `imprimir_automaticamente=true`, dispara `window.print()` automáticamente.
    - _Requirements: R19.1, R19.2, R19.3, R19.4, R19.5_

  - [x] 11.11 Cablear `nueva-venta-dialog` y `ticket-dialog` en `ventas-section`
    - En `ventas-section.tsx`, monta:
      - `<NuevaVentaDialog open={tipo==='nueva'} onClose={...} onVentaCreada={(v) => setEstado({tipo:'ticket', ventaId: v.id})} />`
      - `<TicketDialog open={tipo==='ticket'} ventaId={ventaId} onClose={...} onNuevaVenta={() => setEstado({tipo:'nueva'})} />`
    - El ticket fetch-ea la venta por id si la prop `ventaId` se pasa sola.
    - Archivos: `components/sections/ventas-section.tsx`, `components/ventas/ticket-dialog.tsx`.
    - Aceptación: flujo completo: Nueva Venta → escaneo → cobro → ticket → "Nueva venta" abre dialog limpio.
    - _Requirements: R19.4_

  - [x] 11.12 Crear `components/ventas/detalle-venta-dialog.tsx`
    - Dialog de sólo lectura que `fetchJson('/api/ventas/[id]')`. Muestra encabezado de venta, tabla de items (nombre, cantidad, precio unit, subtotal), totales y un panel inferior con los `MovimientoStock` asociados (filtrar `referencia_id === venta.id` con un `fetch /api/productos/[id]/movimientos` por cada producto, o agregar un endpoint auxiliar — por ahora liste sólo los items).
    - Archivos: `components/ventas/detalle-venta-dialog.tsx`.
    - Aceptación: clic en el icono Eye de una fila abre el detalle con datos correctos.
    - _Requirements: R20.5_

  - [x] 11.13 Cablear `detalle-venta-dialog` y reimpresión en `ventas-section`
    - Monta `<DetalleVentaDialog open={tipo==='detalle'} ventaId={...} onClose={...} />`. La acción Printer en `ventas-table.tsx` invoca `onAccion('reimprimir', venta.id)` que setea `tipo:'ticket'` y reusa `TicketDialog`.
    - Archivos: `components/sections/ventas-section.tsx`, `components/ventas/ventas-table.tsx`.
    - Aceptación: ambas acciones funcionan.
    - _Requirements: R20.4, R20.5_

  - [x] 11.14 Cablear las 4 tarjetas resumen de Ventas
    - Reemplaza los valores hardcoded ("$4,520", "28", "$161.43", "$1,500") por valores derivados de `fetchJson('/api/ventas?desde=<inicio-de-hoy>&hasta=<fin-de-hoy>&take=200')`. Calcula del lado del cliente: total del día, número de transacciones, ticket promedio (`total/n`), pendiente fiados (suma de `total` con `metodo_pago='fiado'`).
    - Archivos: `components/sections/ventas-section.tsx`.
    - Aceptación: las cifras reflejan ventas reales.
    - _Requirements: R20.1_

  - [x] 11.15 Añadir `aria-label` a iconos-botón de Ventas
    - En `ventas-table.tsx`: `aria-label="Ver detalle"`, `aria-label="Reimprimir ticket"`. En `pago-form.tsx`: `aria-label="Cobrar"` en el botón principal.
    - Archivos: `components/ventas/ventas-table.tsx`, `components/ventas/pago-form.tsx`.
    - Aceptación: navegación con teclado y lectores de pantalla anuncia los labels.
    - _Requirements: R23.4, R23.6_

  - [x] 11.16 Checkpoint - Ventas funcional end-to-end
    - Ejecuta el flujo manual: crear venta efectivo → ticket → reimpresión. Si la decisión sobre Fiadores (que aún no es parte del scope) bloquea el flujo `fiado`, deja un placeholder y consulta al usuario.



## Fase 10 — UI Configuración

- [x] 12. Sección Configuración cableada a la API
  - [x] 12.1 Extender `components/sections/configuracion-section.tsx` con los 6 parámetros
    - Añade un `<form>` con `react-hook-form` + `zodResolver(actualizarConfiguracionSchema)` con los 6 campos (`porcentaje_impuesto` number, `etiqueta_ancho_mm` number, `etiqueta_alto_mm` number, `ticket_ancho_mm` number, `imprimir_automaticamente` switch, `permitir_sobreventa` switch). Lee valores iniciales con `useConfiguracion()`. Botón "Guardar cambios": al submit hace `PUT /api/configuracion` y llama `actualizar(parcial)` del hook para refrescar el contexto.
    - Conserva el resto de la sección (otros placeholders) si los hay.
    - Archivos: `components/sections/configuracion-section.tsx`.
    - Aceptación: cambiar `porcentaje_impuesto = 16` y guardar; reabrir la sección muestra `16`. Una `NuevaVentaDialog` posterior calcula impuestos del 16%.
    - _Requirements: R26.2, R26.3_

  - [x] 12.2 Mostrar feedback de éxito/error en Configuración
    - Tras `PUT` exitoso: `toast.success('Configuración actualizada')`. En 422: muestra errores por campo. En 500/503: `toast.error(toastDeError(codigo))`.
    - Archivos: `components/sections/configuracion-section.tsx`.
    - Aceptación: enviar `porcentaje_impuesto: -1` muestra error inline.
    - _Requirements: R23.1, R25.4, R26.3_

## Fase 11 — CSS de impresión

- [x] 13. Hojas de estilo para etiqueta y ticket
  - [x] 13.1 Añadir reglas `@media print` en `app/globals.css`
    - Al final del archivo, añade el bloque exacto del `design.md` § Components and Interfaces > CSS de impresión: oculta todo con `body * { visibility: hidden; }`, hace visible `.imprimir-etiqueta` y `.imprimir-ticket` con sus dimensiones tomadas de `--etiqueta-ancho`, `--etiqueta-alto`, `--ticket-ancho`. Define `@page { margin: 0; }`.
    - Archivos: `app/globals.css`.
    - Aceptación: en `Cmd+P`, sólo se imprime el contenido de `.imprimir-etiqueta` o `.imprimir-ticket` según el dialog activo.
    - _Requirements: R10.3, R19.3_

  - [x] 13.2 Sembrar valores por defecto de CSS variables en `:root`
    - En `app/globals.css`, añade dentro del `:root` existente: `--etiqueta-ancho: 50mm; --etiqueta-alto: 30mm; --ticket-ancho: 80mm;` para que la primera carga (antes del fetch de configuración) tenga valores válidos.
    - Archivos: `app/globals.css`.
    - Aceptación: con la BD apagada, `getComputedStyle(document.documentElement).getPropertyValue('--etiqueta-ancho')` retorna `50mm`.
    - _Requirements: R10.5, R26.4_

  - [x] 13.3 Verificar que `useConfiguracion` actualiza las CSS variables
    - Repite manualmente: abrir Configuración → cambiar `etiqueta_ancho_mm` a 60 → guardar → abrir Imprimir Etiqueta → en preview de impresión, la etiqueta mide 60 mm de ancho. Si falla, revisa el `useEffect` de la tarea 9.5.
    - Archivos: `hooks/use-configuracion.ts` (lectura/ajuste si necesario).
    - Aceptación: sincronización confirmada.
    - _Requirements: R10.5_

## Fase 12 — Smoke tests y validación end-to-end

- [x] 14. Smoke tests y verificación final
  - [x] 14.1 Smoke test de boot sin `DATABASE_URL`
    - Crea `__tests__/integration/boot-sin-database-url.test.ts` que: importa `lib/db.ts` con `process.env.DATABASE_URL` borrado y captura `console.error`; verifica que se emitió el mensaje `'[boot] MISSING_DATABASE_URL'`. Restaura `DATABASE_URL` antes de salir.
    - Archivos: `__tests__/integration/boot-sin-database-url.test.ts`.
    - Aceptación: el test pasa.
    - _Requirements: R1.7_

  - [x] 14.2 Smoke test del catálogo de errores en español
    - Crea `__tests__/unit/mensajes-error.test.ts` que verifica que cada código del catálogo (`VALIDACION`, `SKU_DUPLICADO`, `CODIGO_BARRAS_DUPLICADO`, `CODIGO_BARRAS_INVALIDO`, `STOCK_NEGATIVO`, `USAR_AJUSTE_STOCK`, `PRODUCTO_NO_ENCONTRADO`, `VENTA_FALLIDA`, `VENTA_TIMEOUT`, `LIMITE_FOLIO_DIARIO`, `BD_NO_DISPONIBLE`, `MISSING_DATABASE_URL`, `CATEGORIA_DUPLICADA`, `CONFLICTO`, `RED`) tiene un mensaje en español no vacío en `MENSAJES_ERROR`.
    - Archivos: `__tests__/unit/mensajes-error.test.ts`.
    - Aceptación: el test pasa.
    - _Requirements: R23.3, R25.4_

  - [x] 14.3 Smoke test de `Content-Type` en respuestas
    - Crea `__tests__/integration/content-type.test.ts` que invoca cada handler GET/POST principal (`/api/productos`, `/api/categorias`, `/api/inventario/resumen`, `/api/configuracion`, `/api/ventas`) con `new Request(...)` directo y verifica que `response.headers.get('content-type') === 'application/json; charset=utf-8'`.
    - Archivos: `__tests__/integration/content-type.test.ts`.
    - Aceptación: el test pasa con BD activa.
    - _Requirements: R21.8_

  - [x] 14.4 Smoke test del flujo end-to-end inventario→venta
    - Crea `__tests__/integration/flujo-completo.test.ts` que en una BD ephemeral: (a) crea un producto via `POST /api/productos`, (b) ajusta stock a 10 via `POST .../ajuste-stock`, (c) consulta por código via `GET .../por-codigo/{c}`, (d) registra una venta de 3 unidades efectivo, (e) verifica que el `stock_actual` del producto bajó a 7, (f) verifica que existen 1 fila en `ventas`, 1 en `venta_items` y 2 movimientos (ajuste + venta).
    - Archivos: `__tests__/integration/flujo-completo.test.ts`.
    - Aceptación: el test pasa.
    - _Requirements: R11.1, R12.2, R12.5, R14.3, R18.1, R18.5_

  - [x] 14.5 Verificar que las 8 propiedades PBT pasan completas
    - Ejecuta `pnpm test:run __tests__/property` y confirma que P1, P2, P3, P4, P5, P6, P7, P8 pasan con al menos `numRuns: 100` (o 50 para los que dependen de BD). Si alguna falla, diagnostica con `fast-check` shrinking y corrige el código fuente, no el test.
    - Archivos: ninguno modificado en este checkpoint.
    - Aceptación: salida de vitest reporta 8/8 propiedades en verde.
    - _Requirements: R9.1, R9.3, R11.1, R12.3, R14.3, R14.4, R15.1, R16.1, R16.2, R16.3, R16.4, R16.5, R18.1, R18.4, R18.5, R18.6_

  - [x] 14.6 Smoke manual final
    - Ejecuta `pnpm db:setup && pnpm dev`. Con un navegador en `localhost:3000`: (1) Inventario: crear producto, editar, eliminar, ajustar stock, ver historial, imprimir etiqueta. (2) Ventas: nueva venta con 3 escaneos manuales (escribir el código + Enter en el input oculto), cobro efectivo, ticket. (3) Configuración: cambiar `porcentaje_impuesto` a 16; nueva venta calcula impuestos. (4) Confirma que las tarjetas resumen reflejan los cambios.
    - Archivos: ninguno (verificación manual).
    - Aceptación: los 4 flujos pasan sin errores en consola del servidor ni del navegador.
    - _Requirements: R3.5, R4.4, R5.2, R8.1, R10.3, R12.2, R14.1, R18.5, R19.1, R26.3_

  - [x] 14.7 Checkpoint final - Asegurar todos los tests pasan
    - Ejecuta `pnpm test:run` y confirma que la suite completa (unit + integration + property) pasa. Si surgen dudas o regresiones, consulta al usuario antes de cerrar el plan.

## Notes

- Tareas marcadas con `*` son opcionales (se pueden saltar para un MVP más rápido). No las hay en este plan: todos los tests son sub-tareas obligatorias dado que el design exige PBT cubriendo P1–P8.
- Cada tarea hoja referencia los criterios de aceptación de `requirements.md` que la justifican y, cuando aplica, la propiedad PBT del `design.md`.
- Los checkpoints (1.x, 4.10, 5.11, 8.4, 9.9, 10.18, 11.16, 14.7) son puntos de detención donde se verifican tests y se consulta al usuario si surgen dudas.
- TDD por propiedad: los tests PBT de P2, P3, P5, P6, P7 y P8 se escriben **antes** de su implementación. P1 (round-trip) y P4 (atomicidad) se ejercitan después porque dependen de la API y la BD ya operativas.
- Las tareas que tocan archivos shadcn (`components/ui/*`) NO existen: nada en este plan modifica primitivos. Todas las nuevas ventanas viven en `components/inventario/` y `components/ventas/`.
- El cliente del API (`lib/api/cliente.ts`) es ligero y reutilizable; no se introduce SWR, React Query ni similar.
- Cualquier hardware (lector USB-HID, impresora térmica) se cubre vía la interfaz nativa del SO y `window.print()`. No hay drivers nativos en este plan.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.5", "1.7"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.6"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2"] },
    { "id": 4, "tasks": ["2.3"] },
    { "id": 5, "tasks": ["2.4", "2.5"] },
    { "id": 6, "tasks": ["3.1", "3.3"] },
    { "id": 7, "tasks": ["3.2", "3.4"] },
    { "id": 8, "tasks": ["3.5"] },
    { "id": 9, "tasks": ["4.1", "4.2", "4.3", "4.4", "4.6", "4.8"] },
    { "id": 10, "tasks": ["4.5", "4.7", "4.9"] },
    { "id": 11, "tasks": ["5.1", "5.3"] },
    { "id": 12, "tasks": ["5.2", "5.4"] },
    { "id": 13, "tasks": ["5.5", "5.6", "5.7", "5.8"] },
    { "id": 14, "tasks": ["5.9"] },
    { "id": 15, "tasks": ["5.10"] },
    { "id": 16, "tasks": ["6.1", "7.1", "7.3", "7.4"] },
    { "id": 17, "tasks": ["6.2", "6.3", "7.2", "7.5", "8.1"] },
    { "id": 18, "tasks": ["6.4", "6.5", "6.6", "6.8", "6.9", "8.2"] },
    { "id": 19, "tasks": ["6.7", "8.3"] },
    { "id": 20, "tasks": ["9.1", "9.2", "9.6"] },
    { "id": 21, "tasks": ["9.3", "9.7"] },
    { "id": 22, "tasks": ["9.4", "9.5", "9.8"] },
    { "id": 23, "tasks": ["10.1", "11.1"] },
    { "id": 24, "tasks": ["10.2", "11.2"] },
    { "id": 25, "tasks": ["10.3", "10.5", "10.7", "10.9", "10.11", "11.3", "11.4", "11.9"] },
    { "id": 26, "tasks": ["10.4", "10.6", "10.8", "10.10", "10.12", "11.5", "11.10", "11.12"] },
    { "id": 27, "tasks": ["10.13", "11.6"] },
    { "id": 28, "tasks": ["10.14", "10.15", "10.16", "10.17", "11.7", "11.8", "11.11", "11.13", "11.14", "11.15"] },
    { "id": 29, "tasks": ["12.1"] },
    { "id": 30, "tasks": ["12.2", "13.1", "13.2"] },
    { "id": 31, "tasks": ["13.3", "14.1", "14.2", "14.3", "14.4"] },
    { "id": 32, "tasks": ["14.5", "14.6"] }
  ]
}
```

