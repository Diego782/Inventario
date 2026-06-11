# Implementation Plan

## Overview

Plan de implementación atómico para `dashboard-metricas-notificaciones`. Cada tarea hoja es **autocontenida**, **pequeña** y **completable por un subagente sin contexto adicional**, con criterio de aceptación verificable. El orden respeta las dependencias técnicas descritas en `design.md` y el TDD por propiedad para PBT (P1–P10). Convención: las sub-tareas marcadas con `*` son opcionales (tests ejemplares, integración, smoke); las **PBT (P1–P10) son obligatorias** porque el diseño exige cubrir las 10 propiedades canónicas; las no marcadas son obligatorias.

Stack (reutiliza el del core, sin librerías nuevas): **Next.js 16 + React 19 + TypeScript 5.7 + Prisma + MySQL 8 + shadcn/ui + recharts + react-day-picker + date-fns + date-fns-tz + sonner + zod + fast-check + vitest**.

Convenciones de nombres en este plan:

- `R<num>.<sub>` referencia un criterio de aceptación de `requirements.md`.
- `P<n>` referencia una propiedad canónica de `design.md` § Correctness Properties.
- Rutas en TypeScript usan los aliases `@/lib`, `@/hooks`, `@/components`, `@/components/ui`.
- Se construye **sobre** `inventario-ventas-core`: no se duplican helpers existentes (`redondearBancario`, `ok/creado/errorValidacion/...`, `withValidation`, `mapPrismaError`, `prisma` singleton, `date-fns-tz`).

## Tasks

## Fase 1 — Extensión del esquema Prisma y migración

- [x] 1. Modelo `Notificacion`, relación inversa y migración
  - [x] 1.1 Añadir el modelo `Notificacion` y la relación inversa en `Producto`
    - En `prisma/schema.prisma`, añade el modelo `Notificacion` exactamente como en `design.md` § Data Models: campos `id @id @default(uuid()) @db.Char(36)`, `tipo @db.VarChar(40)`, `titulo @db.VarChar(160)`, `mensaje @db.VarChar(400)`, `producto_id String? @db.Char(36)`, relación `producto Producto? @relation(fields:[producto_id], references:[id], onDelete: SetNull)`, `leida Boolean @default(false)`, `clave_deduplicacion String? @unique @db.VarChar(120)`, `creado_en DateTime @default(now())`, los `@@index([leida])` y `@@index([creado_en])`, y `@@map("notificaciones")`.
    - En el modelo `Producto` existente añade el lado inverso aditivo `notificaciones Notificacion[]` (no elimines ni modifiques campos del core).
    - Archivos: `prisma/schema.prisma`.
    - Aceptación: `pnpm exec prisma format` no reordena/corrige errores y `pnpm exec prisma validate` retorna OK.
    - _Requirements: R6.1, R6.2, R6.3, R6.4, R6.5, R6.8_

  - [x] 1.2 Generar y aplicar la migración `notificaciones`
    - Con MySQL levantado (`pnpm db:up`), ejecuta `pnpm exec prisma migrate dev --name notificaciones --create-only` y verifica que el SQL contenga `CREATE TABLE \`notificaciones\``, `UNIQUE INDEX \`notificaciones_clave_deduplicacion_key\``, `INDEX \`notificaciones_leida_idx\``, `INDEX \`notificaciones_creado_en_idx\`` y el `FOREIGN KEY ... ON DELETE SET NULL`. Aplica con `pnpm exec prisma migrate deploy` y regenera el cliente con `pnpm exec prisma generate`.
    - Archivos: `prisma/migrations/<ts>_notificaciones/migration.sql`.
    - Aceptación: `pnpm exec prisma migrate status` reporta `Database schema is up to date` y el tipo `Notificacion` está disponible en `@prisma/client`.
    - _Requirements: R6.1, R6.2, R6.3, R6.5, R6.8_

  - [x] 1.3 Smoke test de la migración de notificaciones contra BD limpia
    - Crea `__tests__/integration/migracion-notificaciones-smoke.test.ts` que, contra una BD de prueba, inserta una `Notificacion` con `clave_deduplicacion` no nula, intenta insertar otra con la misma clave y verifica que falla por unicidad, e inserta dos filas con `clave_deduplicacion = null` confirmando que ambas se aceptan (R6.5). Marca con `describe.skip` si `SKIP_DB_TESTS=1`.
    - Archivos: `__tests__/integration/migracion-notificaciones-smoke.test.ts`.
    - Aceptación: `pnpm test:run __tests__/integration/migracion-notificaciones-smoke.test.ts` pasa con BD activa.
    - _Requirements: R6.5, R6.6_

## Fase 2 — Funciones puras de cliente y sus PBT (P1–P4, P9, P10)

- [x] 2. Utilidades puras de rango, series, tiempo y badge
  - [x] 2.1 Escribir el PBT de presets de rango (Property 1)
    - Crea `__tests__/property/dashboard-rango-presets.test.ts` con un único `test()` y `fc.assert(..., { numRuns: 100 })`. Usa `arbHoy = fc.date(...)` y `arbPreset = fc.constantFrom("hoy","esta_semana","este_mes","mes_anterior")`; verifica para `presetARango(preset, hoy, tz)`: `desde ≤ hasta`, ninguna fecha posterior a `hoy`, y la regla específica de cada preset (hoy=hoy; esta_semana=lunes..hoy; este_mes=día1..hoy; mes_anterior=día1..últimoDía del mes previo).
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 1: Presets de rango bien formados`.
    - Archivos: `__tests__/property/dashboard-rango-presets.test.ts`.
    - Aceptación: compila pero falla porque `lib/dashboard/rango.ts` aún no existe.
    - _Properties: 1_
    - _Requirements: R1.1, R1.2_

  - [x] 2.2 Implementar `lib/dashboard/rango.ts` — `presetARango` y `etiquetaLegible`
    - Crea `lib/dashboard/rango.ts` con `presetARango(preset, hoy, tz)` (usa `date-fns`/`date-fns-tz` para inicio de semana lunes, día 1 del mes, mes anterior) y `etiquetaLegible(rango)` que produce `"2 abr 2025 – 20 abr 2025"` en `es-ES`. Sin side effects.
    - Archivos: `lib/dashboard/rango.ts`.
    - Aceptación: `pnpm test:run __tests__/property/dashboard-rango-presets.test.ts` pasa con 100 runs.
    - _Properties: 1_
    - _Requirements: R1.1, R1.2, R1.9_

  - [x] 2.3 Escribir el PBT de validación de rango personalizado (Property 2)
    - Crea `__tests__/property/dashboard-rango-validacion.test.ts` con un `fc.assert(..., { numRuns: 100 })` que, para pares `(desde, hasta)` (incluyendo `null`, invertidos, futuros y >366 días) y una `hoy`, verifica que `validarRangoPersonalizado(desde, hasta, hoy)` devuelve `ok:true` **si y sólo si** ambas fechas están definidas, casan `YYYY-MM-DD`, `desde ≤ hasta`, ninguna es futura y la duración inclusiva ≤366; en otro caso `ok:false` con `mensaje` no vacío en español.
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 2: Aceptación/rechazo de rango personalizado`.
    - Archivos: `__tests__/property/dashboard-rango-validacion.test.ts`.
    - Aceptación: compila pero falla porque `validarRangoPersonalizado` aún no existe.
    - _Properties: 2_
    - _Requirements: R1.6, R1.7, R1.8, R2.2, R3.2_

  - [x] 2.4 Implementar `validarRangoPersonalizado` en `lib/dashboard/rango.ts`
    - Añade `validarRangoPersonalizado(desde, hasta, hoy)` que retorna `{ ok:true; rango } | { ok:false; mensaje }`, con mensajes en español específicos: inicio>fin ("La fecha de inicio debe ser anterior o igual a la fecha de fin"), incompleto, futuro y >366 días. Reusa el helper `diffDiasInclusivo`.
    - Archivos: `lib/dashboard/rango.ts`.
    - Aceptación: `pnpm test:run __tests__/property/dashboard-rango-validacion.test.ts` pasa con 100 runs.
    - _Properties: 2_
    - _Requirements: R1.6, R1.7, R1.8_

  - [x] 2.5 Escribir el PBT de periodo anterior (Property 3)
    - Crea `__tests__/property/dashboard-periodo-anterior.test.ts` con `fc.assert(..., { numRuns: 100 })` que, para todo rango válido `{desde, hasta}`, verifica que `periodoAnterior(desde, hasta)` tiene **igual duración inclusiva en días**, `periodoAnterior.hasta` es exactamente el día anterior a `desde`, y `periodoAnterior.hasta < desde` (sin solape).
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 3: Periodo anterior de igual duración y contiguo`.
    - Archivos: `__tests__/property/dashboard-periodo-anterior.test.ts`.
    - Aceptación: compila pero falla porque `periodoAnterior` aún no existe.
    - _Properties: 3_
    - _Requirements: R2.11_

  - [x] 2.6 Implementar `periodoAnterior` y `diffDiasInclusivo` en `lib/dashboard/rango.ts`
    - Añade `diffDiasInclusivo(desde, hasta): number` y `periodoAnterior(desde, hasta): RangoFechas` siguiendo `design.md`: `duracionDias = diff+1`, `anteriorHasta = desde − 1d`, `anteriorDesde = anteriorHasta − (duracionDias − 1)`. Funciones puras sobre cadenas `YYYY-MM-DD`.
    - Archivos: `lib/dashboard/rango.ts`.
    - Aceptación: `pnpm test:run __tests__/property/dashboard-periodo-anterior.test.ts` pasa con 100 runs.
    - _Properties: 3_
    - _Requirements: R2.11_

  - [x] 2.7 Escribir el PBT de variación porcentual (Property 4)
    - Crea `__tests__/property/dashboard-variacion.test.ts` con `fc.assert(..., { numRuns: 100 })` que, para pares `(actual, anterior)` finitos, verifica que `variacionPorcentual(actual, anterior)` es `null` **si y sólo si** `anterior === 0`, y en otro caso es exactamente `(actual − anterior) / anterior × 100`.
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 4: Variación porcentual y nulabilidad`.
    - Archivos: `__tests__/property/dashboard-variacion.test.ts`.
    - Aceptación: compila pero falla porque `lib/dashboard/series.ts` aún no existe.
    - _Properties: 4_
    - _Requirements: R2.12, R4.6_

  - [x] 2.8 Implementar `lib/dashboard/series.ts` — `variacionPorcentual` y `agruparPorDia`
    - Crea `lib/dashboard/series.ts` con `variacionPorcentual(actual, anterior): number | null` (null si `anterior===0`) y `agruparPorDia(puntos, rango, tz)` que produce **un punto por día** del rango (con ceros para días sin datos), usando `date-fns-tz` para asignar cada `creado_en` al día civil en `tz`. Sin side effects.
    - Archivos: `lib/dashboard/series.ts`.
    - Aceptación: `pnpm test:run __tests__/property/dashboard-variacion.test.ts` pasa con 100 runs.
    - _Properties: 4_
    - _Requirements: R2.12, R4.6, R5.1, R5.2_

  - [x] 2.9 Escribir test unitario de `agruparPorDia`
    - En `__tests__/unit/dashboard-series.test.ts`, verifica con datos fijos: (a) un rango de 5 días con puntos sólo en 2 días produce 5 entradas con ceros en los 3 restantes y orden ascendente por fecha; (b) puntos en el extremo exacto del rango se incluyen.
    - Archivos: `__tests__/unit/dashboard-series.test.ts`.
    - Aceptación: el test pasa.
    - _Requirements: R5.1, R5.2_

  - [x] 2.10 Escribir el PBT de tiempo relativo en español (Property 10)
    - Crea `__tests__/property/notificaciones-tiempo.test.ts` con `fc.assert(..., { numRuns: 100 })` usando `arbDeltaSegundos` por bandas; verifica que `tiempoRelativoEs(desde, ahora)` devuelve `"Hace un momento"` (<60s), `"Hace N min"` (N∈[1,59]), `"Hace N h"` (N∈[1,23]), `"Hace N d"` (N∈[1,6]) y la fecha `dd/mm/aaaa` (≥7 días).
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 10: Tiempo relativo en español por bandas`.
    - Archivos: `__tests__/property/notificaciones-tiempo.test.ts`.
    - Aceptación: compila pero falla porque `lib/notificaciones/tiempo.ts` aún no existe.
    - _Properties: 10_
    - _Requirements: R9.5_

  - [x] 2.11 Implementar `lib/notificaciones/tiempo.ts` — `tiempoRelativoEs`
    - Crea `lib/notificaciones/tiempo.ts` con `tiempoRelativoEs(desde: Date, ahora: Date): string` implementando exactamente las bandas de R9.5. Función pura.
    - Archivos: `lib/notificaciones/tiempo.ts`.
    - Aceptación: `pnpm test:run __tests__/property/notificaciones-tiempo.test.ts` pasa con 100 runs.
    - _Properties: 10_
    - _Requirements: R9.5_

  - [x] 2.12 Escribir el PBT de formato de badge y aria-label (Property 9)
    - Crea `__tests__/property/notificaciones-badge.test.ts` con `fc.assert(..., { numRuns: 100 })` usando `arbConteo = fc.integer({ min:0, max:100000 })`; verifica que `formatearBadge(n)` da `""` (n===0), la representación decimal de `n` (1≤n≤99) y `"99+"` (n>99), y que `ariaLabelCampana(n)` incluye siempre la cantidad correcta (número exacto para 0≤n≤99, "99+" para n>99).
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 9: Formato del badge y aria-label del conteo`.
    - Archivos: `__tests__/property/notificaciones-badge.test.ts`.
    - Aceptación: compila pero falla porque `lib/notificaciones/badge.ts` aún no existe.
    - _Properties: 9_
    - _Requirements: R9.2, R9.3, R13.1_

  - [x] 2.13 Implementar `lib/notificaciones/badge.ts` — `formatearBadge` y `ariaLabelCampana`
    - Crea `lib/notificaciones/badge.ts` con `formatearBadge(n: number): string` y `ariaLabelCampana(n: number): string` (texto en español que incluye la cantidad, p. ej. `"Notificaciones: N sin leer"` / `"99+ sin leer"`). Funciones puras.
    - Archivos: `lib/notificaciones/badge.ts`.
    - Aceptación: `pnpm test:run __tests__/property/notificaciones-badge.test.ts` pasa con 100 runs.
    - _Properties: 9_
    - _Requirements: R9.2, R9.3, R13.1, R13.2_

  - [x] 2.14 Checkpoint - Asegurar que P1, P2, P3, P4, P9 y P10 pasan
    - Ejecuta `pnpm test:run __tests__/property/dashboard-rango-presets.test.ts __tests__/property/dashboard-rango-validacion.test.ts __tests__/property/dashboard-periodo-anterior.test.ts __tests__/property/dashboard-variacion.test.ts __tests__/property/notificaciones-badge.test.ts __tests__/property/notificaciones-tiempo.test.ts` y confirma 6/6 en verde. Si surgen dudas sobre formatos de fecha/etiqueta, consulta al usuario antes de continuar.

## Fase 3 — Capa de dominio analítico (métricas y rankings) con PBT P5 y P6

- [x] 3. Dominio analítico del backend
  - [x] 3.1 Escribir el PBT model-based de métricas (Property 5)
    - Crea `__tests__/property/dashboard-metricas.test.ts` con `fc.assert(fc.asyncProperty(...), { numRuns: 50 })` usando `arbSeed` (ventas con estado/fecha/items y devoluciones). Siembra los datos en una BD de prueba, llama `calcularMetricas(desde, hasta, tz)` y compara contra un modelo en memoria con filtrado **inclusivo** por rango en `tz`; verifica `estimatedProfit === totalSales − totalExpenses`, que todo monto de salida cumple `v === redondearBancario(v)`, y que sin registros las 4 métricas valen 0. Incluye registros en los extremos exactos del rango.
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 5: Métricas correctas, inclusivas y redondeadas`.
    - Archivos: `__tests__/property/dashboard-metricas.test.ts`.
    - Aceptación: compila pero falla porque `lib/dominio/metricas.ts` aún no existe.
    - _Properties: 5_
    - _Requirements: R2.4, R2.6, R2.7, R2.8, R2.9, R2.10, R2.13_

  - [x] 3.2 Implementar `lib/dominio/metricas.ts` — `limitesUtc`, `agregarMetricas`, `calcularMetricas`
    - Crea `lib/dominio/metricas.ts` con: `limitesUtc(desde, hasta, tz)` (convierte fechas civiles a `[inicioUtc, finUtc]` inclusivos vía `date-fns-tz`); `agregarMetricas(limites)` con agregaciones Prisma para `totalSales` (SUM ventas.total estado=completada), `totalReturns` (movimientos tipo=devolucion valorados a `precio_venta`), `totalExpenses` (SUM `precio_compra × cantidad` de venta_items de ventas completadas) y series por día con `agruparPorDia`; y `calcularMetricas(desde, hasta, tz)` que combina periodo actual y `periodoAnterior` (de `lib/dashboard/rango.ts`), aplica `redondearBancario` y `variacionPorcentual`. Reusa el `prisma` singleton del core.
    - Archivos: `lib/dominio/metricas.ts`.
    - Aceptación: `pnpm test:run __tests__/property/dashboard-metricas.test.ts` pasa.
    - _Properties: 5_
    - _Requirements: R2.5, R2.6, R2.7, R2.8, R2.9, R2.10, R2.11, R2.13_

  - [x] 3.3 Escribir el PBT de orden y desempate de rankings (Property 6)
    - Crea `__tests__/property/dashboard-rankings.test.ts` con `fc.assert(..., { numRuns: 100 })` usando `arbItems` (valor en rango pequeño para forzar empates) y `arbLimite ∈ [1,50]`; verifica que `ordenarRanking(items, clave, direccion, limite)` queda monótono en la `direccion` (desc para topSelling/topMargin/topRotation, asc para lowRotation), desempata por `producto_id` ascendente, y tiene longitud ≤ `limite`.
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 6: Orden y desempate de rankings`.
    - Archivos: `__tests__/property/dashboard-rankings.test.ts`.
    - Aceptación: compila pero falla porque `ordenarRanking` aún no existe.
    - _Properties: 6_
    - _Requirements: R3.6, R3.7, R3.8, R3.9, R3.10, R3.12_

  - [x] 3.4 Implementar `ordenarRanking` en `lib/dominio/rankings.ts`
    - Crea `lib/dominio/rankings.ts` y exporta la función pura `ordenarRanking(items, claveValor, direccion, limite)` que ordena por la métrica en la dirección dada, desempata **siempre** por `producto_id` ascendente y trunca a `limite`.
    - Archivos: `lib/dominio/rankings.ts`.
    - Aceptación: `pnpm test:run __tests__/property/dashboard-rankings.test.ts` pasa con 100 runs.
    - _Properties: 6_
    - _Requirements: R3.6, R3.7, R3.8, R3.9, R3.10_

  - [x] 3.5 Implementar `calcularRankings` en `lib/dominio/rankings.ts`
    - Añade `calcularRankings(desde, hasta, limite, tz)` que: ejecuta agregaciones Prisma sobre el rango (`limitesUtc`) para unidades/monto vendidos (`topSelling`), margen `precio_venta − precio_compra` (`topMargin`), unidades con salida (`topRotation`) y productos activos con menor salida incluyendo ceros (`lowRotation`); aplica `ordenarRanking` y `redondearBancario` a los valores monetarios; devuelve `RankingsDTO`. Caso sin ventas: `topSelling`/`topRotation` vacíos y `lowRotation` poblado con ceros (R3.12).
    - Archivos: `lib/dominio/rankings.ts`.
    - Aceptación: con datos seed, `calcularRankings('2025-01-01','2025-12-31',5,tz)` devuelve las 4 listas respetando orden y tope.
    - _Properties: 6_
    - _Requirements: R3.5, R3.6, R3.7, R3.8, R3.9, R3.10, R3.11, R3.12_

  - [x] 3.6 Escribir test de integración de agregaciones de rankings con datos seed
    - Crea `__tests__/integration/dashboard-rankings.test.ts` que siembra ventas/movimientos conocidos y verifica numéricamente las 4 listas (orden, desempate por id, monto redondeado, lowRotation incluyendo un producto con cero salidas).
    - Archivos: `__tests__/integration/dashboard-rankings.test.ts`.
    - Aceptación: el test pasa con BD activa.
    - _Requirements: R3.6, R3.9, R3.11, R3.12_

  - [x] 3.7 Checkpoint - Asegurar que P5 y P6 pasan contra MySQL real
    - Ejecuta `pnpm test:run __tests__/property/dashboard-metricas.test.ts __tests__/property/dashboard-rankings.test.ts`. Si shrinking revela discrepancias, corrige el código fuente (no el test). Consulta al usuario ante dudas sobre la semántica de devoluciones/gastos.

## Fase 4 — Dominio de notificaciones y enganche transaccional (PBT P7 y P8)

- [x] 4. Detección de stock crítico y orden del listado
  - [x] 4.1 Escribir el PBT de deduplicación lógica de stock crítico (Property 7)
    - Crea `__tests__/property/notificaciones-dedupe.test.ts` con `fc.assert(fc.asyncProperty(...), { numRuns: 50 })` usando `arbHistoria` (eventos `stock` y `marcar_leidas`) sobre un producto con `stock_minimo` fijo. Aplica cada evento contra la BD invocando `detectarStockCritico` dentro de transacciones y/o el marcado de lectura; verifica el invariante: nunca más de **una** notificación no leída con clave `stock_critico:{id}`, y que se crea exactamente al transicionar de no-Crítico a Crítico sin notificación no leída previa.
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 7: Deduplicación lógica de stock crítico`.
    - Archivos: `__tests__/property/notificaciones-dedupe.test.ts`.
    - Aceptación: compila pero falla porque `lib/dominio/notificaciones.ts` aún no existe.
    - _Properties: 7_
    - _Requirements: R6.5, R6.6, R7.1, R7.3, R7.4, R7.5_

  - [x] 4.2 Implementar `lib/dominio/notificaciones.ts`
    - Crea `lib/dominio/notificaciones.ts` con: `estadoStock(stockActual, stockMinimo): EstadoStock` (misma regla que el core), `claveDedupStockCritico(productoId)` (formato exacto `stock_critico:{id}`), `detectarStockCritico(tx, params, estadoPrevio)` que crea la notificación **sólo** en la transición a Crítico y cuando no hay otra no leída con la misma clave (mensaje con nombre, stock actual y mínimo), y la función pura `ordenarNotificaciones(items): NotificacionDTO[]` que ordena desc por `creado_en`, desempata desc por `id` y trunca a 100. Todo dentro de la `tx` recibida cuando aplica.
    - Archivos: `lib/dominio/notificaciones.ts`.
    - Aceptación: `pnpm test:run __tests__/property/notificaciones-dedupe.test.ts` pasa.
    - _Properties: 7_
    - _Requirements: R7.1, R7.2, R7.3, R7.4, R7.5_

  - [x] 4.3 Escribir el PBT de orden y tope del listado (Property 8)
    - Crea `__tests__/property/notificaciones-orden.test.ts` con `fc.assert(..., { numRuns: 100 })` usando `arbNotifs` (hasta 250 elementos, `creado_en` con colisiones forzadas); verifica que `ordenarNotificaciones(items)` queda ordenado desc por `creado_en`, desempata desc por `id` cuando `creado_en` coincide, y trunca a ≤100.
    - Cabecera: `// Feature: dashboard-metricas-notificaciones, Property 8: Orden y tope del listado de notificaciones`.
    - Archivos: `__tests__/property/notificaciones-orden.test.ts`.
    - Aceptación: `pnpm test:run __tests__/property/notificaciones-orden.test.ts` pasa con 100 runs.
    - _Properties: 8_
    - _Requirements: R8.1_

  - [x] 4.4 Enganchar `detectarStockCritico` dentro de `registrarVenta`
    - En `lib/dominio/ventas.ts` (core), dentro del bucle de ítems y **en la misma `$transaction`**, tras el `tx.producto.update(...)` y la creación del `MovimientoStock`, captura `estadoPrevio = estadoStock(p.stock_actual, p.stock_minimo)` (del snapshot bloqueado `FOR UPDATE`) y llama `await detectarStockCritico(tx, { producto_id, nombre, stock_actual: nuevo, stock_minimo }, estadoPrevio)`. No alteres la firma ni el resto del comportamiento de `registrarVenta`.
    - Archivos: `lib/dominio/ventas.ts`.
    - Aceptación: una venta que deja un producto en stock crítico crea exactamente 1 notificación dentro de la misma transacción; si la transacción falla, no queda notificación (verificado en 4.6).
    - _Requirements: R7.1, R7.2, R7.3, R7.6, R7.7_

  - [x] 4.5 Enganchar `detectarStockCritico` dentro de `ajustarStock`
    - En `lib/dominio/inventario.ts > ajustarStock` (core), dentro de la `$transaction`, tras calcular `nuevo` y antes de retornar, invoca `await detectarStockCritico(tx, { producto_id: id, nombre: p.nombre, stock_actual: nuevo, stock_minimo: p.stock_minimo }, estadoStock(p.stock_actual, p.stock_minimo))`. Mantén intacto el comportamiento existente del ajuste.
    - Archivos: `lib/dominio/inventario.ts`.
    - Aceptación: un ajuste de salida que lleva el producto a crítico crea 1 notificación atómicamente; un ajuste que no transiciona a crítico no crea notificación.
    - _Requirements: R7.1, R7.2, R7.3, R7.6, R7.7_

  - [x] 4.6 Escribir test de integración de atomicidad stock + notificación
    - Crea `__tests__/integration/notificacion-atomicidad.test.ts` (espejo de la prueba de atomicidad de venta del core): (a) éxito ⇒ stock actualizado y 1 notificación creada; (b) fallo inyectado en la `tx` tras crear la notificación ⇒ 0 notificaciones persistidas y `stock_actual` sin cambios. Cubre venta y ajuste.
    - Archivos: `__tests__/integration/notificacion-atomicidad.test.ts`.
    - Aceptación: el test pasa con BD activa.
    - _Requirements: R7.6, R7.7_

  - [x] 4.7 Checkpoint - Asegurar que P7 y P8 pasan
    - Ejecuta `pnpm test:run __tests__/property/notificaciones-dedupe.test.ts __tests__/property/notificaciones-orden.test.ts`. Verifica que el enganche transaccional no rompe las pruebas de venta/ajuste del core (`pnpm test:run __tests__/property/venta-atomicidad.test.ts __tests__/property/inventario-invariantes.test.ts`). Consulta al usuario ante regresiones.

## Fase 5 — Esquemas Zod, serializadores y catálogo de errores

- [x] 5. Contratos de API
  - [x] 5.1 Crear `lib/schemas/dashboard.ts`
    - Crea `lib/schemas/dashboard.ts` con `metricasQuerySchema` y `rankingsQuerySchema` exactamente como en `design.md`: `desde`/`hasta` validados por `fechaIso` (`/^\d{4}-\d{2}-\d{2}$/`), `superRefine` para `desde ≤ hasta` y duración ≤366 días, y `limite = z.coerce.number().int().min(1).max(50).default(5)` en rankings. Mensajes en español.
    - Archivos: `lib/schemas/dashboard.ts`.
    - Aceptación: `metricasQuerySchema.safeParse({desde:'2025-13-01',hasta:'2025-01-01'})` falla; `{desde:'2025-04-02',hasta:'2025-04-20'}` pasa; `rankingsQuerySchema` aplica `limite=5` por defecto.
    - _Requirements: R2.1, R2.2, R3.1, R3.2, R3.4_

  - [x] 5.2 Crear `lib/schemas/notificaciones.ts`
    - Crea `lib/schemas/notificaciones.ts` con `listarNotifQuerySchema` (`solo_no_leidas: z.enum(["true","false"]).default("false")`) y `notifIdParamSchema` (`id: z.string().uuid()`).
    - Archivos: `lib/schemas/notificaciones.ts`.
    - Aceptación: `listarNotifQuerySchema.safeParse({})` da `solo_no_leidas:"false"`; `{solo_no_leidas:"x"}` falla; `notifIdParamSchema.safeParse({id:"no-uuid"})` falla.
    - _Requirements: R8.2, R8.10_

  - [x] 5.3 Ampliar `lib/api/serializadores.ts` con DTOs de dashboard y notificaciones
    - Añade en `lib/api/serializadores.ts` (archivo del core) los tipos `MetricaConVariacion`, `MetricasDTO`, `RankingItemVenta`, `RankingItemMargen`, `RankingItemRotacion`, `RankingsDTO`, `NotificacionDTO`, y `toNotificacionDTO(n)` que convierte `creado_en` a ISO 8601 UTC y mapea `producto_id` nullable. Reusa `redondearBancario` para montos.
    - Archivos: `lib/api/serializadores.ts`.
    - Aceptación: `toNotificacionDTO(mock)` produce `creado_en` ISO y `producto_id: string | null` correcto.
    - _Requirements: R2.5, R3.5, R8.1_

  - [x] 5.4 Añadir códigos de error nuevos al catálogo
    - En `lib/api/errores.ts` mapea `P2025` del PATCH de notificaciones a `NOTIFICACION_NO_ENCONTRADA` (404) y define `CONSULTA_TIMEOUT` (504). En `lib/mensajes-error.ts` añade los mensajes en español: `NOTIFICACION_NO_ENCONTRADA → "Notificación no encontrada."` y `CONSULTA_TIMEOUT → "La consulta tardó demasiado. Intente nuevamente."`. No elimines códigos existentes del core.
    - Archivos: `lib/api/errores.ts`, `lib/mensajes-error.ts`.
    - Aceptación: `mensajePorCodigo('NOTIFICACION_NO_ENCONTRADA')` y `toastDeError('CONSULTA_TIMEOUT')` devuelven los textos en español indicados.
    - _Requirements: R8.8, R14.7_

  - [x] 5.5 Escribir tests unitarios de los esquemas Zod
    - Crea `__tests__/unit/schemas-dashboard-notificaciones.test.ts` con casos válidos e inválidos por schema: ausencia de `desde`/`hasta`, formato inválido, `desde>hasta`, duración >366, `limite` fuera de [1,50], `solo_no_leidas` inválido, `id` no-uuid.
    - Archivos: `__tests__/unit/schemas-dashboard-notificaciones.test.ts`.
    - Aceptación: el test pasa.
    - _Requirements: R2.2, R2.3, R3.2, R3.3, R8.2, R8.10_

## Fase 6 — Route Handlers

- [x] 6. Endpoints de dashboard y notificaciones
  - [x] 6.1 Implementar `GET /api/dashboard/metricas`
    - Crea `app/api/dashboard/metricas/route.ts` con `GET(req)` que extrae `searchParams`, ejecuta `metricasQuerySchema.safeParse`; en fallo devuelve `errorValidacion(errores)` (422) **sin** calcular; en éxito llama `calcularMetricas(desde, hasta)` dentro de un límite de 5 s (`Promise.race`/`$transaction timeout`) devolviendo `CONSULTA_TIMEOUT` (504) al expirar; responde `ok(MetricasDTO)` con `Content-Type: application/json; charset=utf-8`. Errores Prisma → `mapPrismaError`.
    - Archivos: `app/api/dashboard/metricas/route.ts`.
    - Aceptación: `curl '.../api/dashboard/metricas?desde=2025-04-01&hasta=2025-04-20'` devuelve 200 con DTO; sin `desde` devuelve 422 con `{errores:[...]}`.
    - _Requirements: R2.1, R2.3, R2.5, R2.13, R2.14, R14.7_

  - [x] 6.2 Implementar `GET /api/dashboard/rankings`
    - Crea `app/api/dashboard/rankings/route.ts` con `GET(req)` análogo a 6.1 usando `rankingsQuerySchema` (incluye `limite` por defecto 5) y `calcularRankings(...)` con el mismo límite de 5 s. Responde `ok(RankingsDTO)`.
    - Archivos: `app/api/dashboard/rankings/route.ts`.
    - Aceptación: `curl '.../api/dashboard/rankings?desde=2025-04-01&hasta=2025-04-20&limite=3'` devuelve 200 con 4 listas de ≤3 elementos; `limite=99` devuelve 422.
    - _Requirements: R3.1, R3.3, R3.4, R3.5, R3.10, R3.13, R14.7_

  - [x] 6.3 Implementar `GET /api/notificaciones` (listado)
    - Crea `app/api/notificaciones/route.ts` con `GET(req)` que valida `listarNotifQuerySchema`; consulta Prisma ordenando por `creado_en desc, id desc`, `take: 100`, filtrando `leida=false` cuando `solo_no_leidas==="true"`; serializa con `toNotificacionDTO`; responde `ok(NotificacionDTO[])`. Lista vacía cuando no hay coincidencias.
    - Archivos: `app/api/notificaciones/route.ts`.
    - Aceptación: `curl '.../api/notificaciones?solo_no_leidas=true'` devuelve 200 con sólo no leídas; valor inválido devuelve 422.
    - _Requirements: R8.1, R8.2, R8.3, R8.4, R8.11_

  - [x] 6.4 Implementar `GET /api/notificaciones/conteo`
    - Crea `app/api/notificaciones/conteo/route.ts` con `GET()` que devuelve `ok({ conteo })` donde `conteo = prisma.notificacion.count({ where:{ leida:false } })` (entero ≥0). Errores de inicialización → `BD_NO_DISPONIBLE` (503).
    - Archivos: `app/api/notificaciones/conteo/route.ts`.
    - Aceptación: `curl '.../api/notificaciones/conteo'` devuelve 200 `{conteo:N}` con `Content-Type` JSON utf-8.
    - _Requirements: R8.5, R8.11, R14.3_

  - [x] 6.5 Implementar `PATCH /api/notificaciones/[id]`
    - Crea `app/api/notificaciones/[id]/route.ts` con `PATCH(req,{params})` que valida `notifIdParamSchema`, ejecuta `prisma.notificacion.update({ where:{id}, data:{ leida:true } })` y responde `ok(toNotificacionDTO(...))`. Marcar una ya leída responde 200 sin cambio (idempotente). `P2025` → `mapPrismaError` ⇒ 404 `NOTIFICACION_NO_ENCONTRADA`.
    - Archivos: `app/api/notificaciones/[id]/route.ts`.
    - Aceptación: PATCH a una no leída devuelve 200 con `leida:true`; PATCH repetido devuelve 200; id inexistente devuelve 404 `NOTIFICACION_NO_ENCONTRADA`.
    - _Requirements: R8.6, R8.7, R8.8, R8.11_

  - [x] 6.6 Implementar `POST /api/notificaciones/marcar-todas-leidas`
    - Crea `app/api/notificaciones/marcar-todas-leidas/route.ts` con `POST()` que ejecuta `prisma.notificacion.updateMany({ where:{ leida:false }, data:{ leida:true } })` y responde `ok({ actualizadas })`.
    - Archivos: `app/api/notificaciones/marcar-todas-leidas/route.ts`.
    - Aceptación: tras la llamada, `GET /api/notificaciones/conteo` devuelve `{conteo:0}` y la respuesta indica `actualizadas` ≥0.
    - _Requirements: R8.9, R8.11_

  - [x] 6.7 Escribir test de integración de los endpoints de notificaciones
    - Crea `__tests__/integration/notificaciones-endpoints.test.ts` que invoca los handlers con `new Request(...)`: verifica orden desc por `creado_en`/`id` y tope 100 del listado, filtro `solo_no_leidas`, PATCH idempotente (no leída→leída, leída→leída) y 404, conteo y `marcar-todas-leidas`.
    - Archivos: `__tests__/integration/notificaciones-endpoints.test.ts`.
    - Aceptación: el test pasa con BD activa.
    - _Requirements: R8.1, R8.3, R8.6, R8.7, R8.8, R8.9_

  - [x] 6.8 Escribir smoke test de `Content-Type` de los nuevos endpoints
    - Crea `__tests__/integration/content-type-dashboard-notif.test.ts` que invoca cada handler nuevo (`metricas`, `rankings`, `notificaciones`, `conteo`, `[id]` PATCH, `marcar-todas-leidas`) y verifica `content-type === 'application/json; charset=utf-8'`.
    - Archivos: `__tests__/integration/content-type-dashboard-notif.test.ts`.
    - Aceptación: el test pasa.
    - _Requirements: R2.14, R3.13, R8.11_

  - [x] 6.9 Checkpoint - Asegurar que los endpoints responden y validan
    - Ejecuta `pnpm test:run __tests__/integration/notificaciones-endpoints.test.ts __tests__/integration/content-type-dashboard-notif.test.ts` (si se implementaron) y confirma manualmente con `curl` que las validaciones 422 y los códigos de error funcionan. Consulta al usuario ante dudas de contrato.

## Fase 7 — Hooks de cliente

- [x] 7. Hooks de dashboard y notificaciones
  - [x] 7.1 Implementar `hooks/use-rango-fechas.ts`
    - Crea `useRangoFechas` con estado inicial preset `este_mes` (R1.1), `setPreset`, `setPersonalizado` (delega en `validarRangoPersonalizado` de `lib/dashboard/rango.ts`, retorna `{ok}` y conserva rango previo en fallo), `etiquetaLegible` y `error`. `"use client"`.
    - Archivos: `hooks/use-rango-fechas.ts`.
    - Aceptación: al montar, `preset==="este_mes"`; un rango inválido conserva el rango previo y expone `mensaje`.
    - _Requirements: R1.1, R1.2, R1.7, R1.8, R1.9_

  - [x] 7.2 Implementar `hooks/use-dashboard-data.ts`
    - Crea `useDashboardData(rango)` que lanza fetch a `/api/dashboard/metricas` y `/api/dashboard/rankings` al cambiar el rango, con `AbortController` y timeout 10 s (R5.11); estados `inicial|cargando|listo|error|vacio`; `vacio` cuando ambas respuestas no traen datos (R5.13); `reintentar()` que conserva el estado previo sin datos parciales en error (R5.12).
    - Archivos: `hooks/use-dashboard-data.ts`.
    - Aceptación: con mocks MSW, un timeout >10s deja estado `error`; respuestas sin datos dejan estado `vacio`.
    - _Requirements: R5.10, R5.11, R5.12, R5.13, R14.4, R14.5_

  - [x] 7.3 Implementar `hooks/use-tema.ts`
    - Crea `useTema` que lee las CSS vars del tema activo (`next-themes`) y expone `{ tema, colores:{ primary, chart1, chart2, muted, foreground } }` para pasarlas a `recharts`, recalculando al cambiar de tema.
    - Archivos: `hooks/use-tema.ts`.
    - Aceptación: al alternar tema, `colores` refleja los nuevos valores de las variables CSS.
    - _Requirements: R5.8, R5.9, R12.4_

  - [x] 7.4 Implementar `hooks/use-notificaciones.ts`
    - Crea `useNotificaciones` con `items`, `conteo`, `estado`, `recargar()` (GET `/api/notificaciones`, timeout 10 s, expone error para el panel), `marcarLeida(id)` (optimista con rollback en fallo de PATCH, decrementa badge) y `marcarTodasLeidas()` (optimista con rollback; deja badge en 0). Toast `sonner` en error.
    - Archivos: `hooks/use-notificaciones.ts`.
    - Aceptación: con mocks, un PATCH fallido revierte el item a no leída y mantiene el conteo; `marcarTodasLeidas` exitoso deja conteo 0.
    - _Requirements: R9.4, R9.7, R9.8, R9.9, R9.10, R9.11, R11.6, R11.7_

  - [x] 7.5 Implementar `hooks/use-sonido-notificacion.ts`
    - Crea `useSonidoNotificacion` con `silenciado` persistido en `localStorage` bajo `dego:sonido_notificacion` (default activado cuando no hay preferencia), `alternarSilencio()` y `reproducir()` que crea un `HTMLAudioElement` perezoso de `public/notificacion.mp3`, fija `volume=0.5` y envuelve `play()` en `.catch(()=>{})` (tolera bloqueo de autoplay sin error).
    - Archivos: `hooks/use-sonido-notificacion.ts`.
    - Aceptación: sin preferencia previa, `silenciado===false`; `alternarSilencio()` persiste el cambio; `reproducir()` no lanza aunque `play()` rechace.
    - _Requirements: R10.2, R10.5, R10.6, R10.8_

  - [x] 7.6 Implementar `hooks/use-polling-notificaciones.ts`
    - Crea `usePollingNotificaciones` con `setInterval` de 30 s a `/api/notificaciones/conteo`, `AbortController` con timeout 10 s; al detectar aumento respecto al conteo previo actualiza el conteo y dispara `onAumento`; en fallo/timeout conserva el conteo previo y reintenta en el siguiente intervalo sin detener el ciclo. Reproduce sonido (vía `useSonidoNotificacion`) una vez por ciclo con aumento si no está silenciado.
    - Archivos: `hooks/use-polling-notificaciones.ts`.
    - Aceptación: con fake timers, un fallo conserva el conteo previo; un aumento dispara `onAumento` una sola vez.
    - _Requirements: R10.1, R11.1, R11.2, R11.3, R11.4, R11.5_

  - [x] 7.7 Escribir tests unitarios de los hooks
    - Crea `__tests__/unit/hooks-notificaciones.test.tsx` (y dashboard) con: polling 30s/timeout 10s/conserva conteo en fallo (fake timers); sonido ≤50% volumen, una vez por aumento, catch de autoplay (mock `Audio`); preferencia de sonido persiste y default activado; marcar leída optimista con rollback; `useDashboardData` timeout 10s → estado error.
    - Archivos: `__tests__/unit/hooks-notificaciones.test.tsx`, `__tests__/unit/hooks-dashboard.test.tsx`.
    - Aceptación: los tests pasan.
    - _Requirements: R9.8, R10.1, R10.2, R10.5, R10.6, R10.8, R11.1, R11.4, R11.5, R5.11_

## Fase 8 — Componentes del Dashboard e integración

- [x] 8. UI del dashboard
  - [x] 8.1 Implementar `components/dashboard/rango-fechas-selector.tsx`
    - Crea el selector con presets (`hoy`, `esta_semana`, `este_mes`, `mes_anterior`, `personalizado`) usando `ToggleGroup`/`Select` y, en personalizado, `Popover` + `Calendar` (`react-day-picker`) de rango. Muestra `etiquetaLegible` del rango activo, valida con `useRangoFechas` y muestra mensajes de error en español sin recargar ante rango inválido. Sólo primitivas de `@/components/ui`. `"use client"`.
    - Archivos: `components/dashboard/rango-fechas-selector.tsx`.
    - Aceptación: cambiar de preset emite el nuevo rango; un rango personalizado inválido muestra el mensaje y conserva el rango previo.
    - _Requirements: R1.1, R1.2, R1.3, R1.5, R1.7, R1.8, R1.9, R12.1, R12.3, R13.4, R13.5_

  - [x] 8.2 Implementar `kpi-card.tsx`, `sparkline.tsx` y `kpi-grid.tsx`
    - `components/dashboard/sparkline.tsx`: mini `LineChart` de `recharts`; muestra "Sin datos suficientes" con <2 puntos (R4.8). `components/dashboard/kpi-card.tsx`: valor monetario formateado (símbolo, miles, 2 decimales), variación con signo+icono ascendente/descendente o "Sin datos previos" (anterior=0), y estado de error conservando estructura sin números. `components/dashboard/kpi-grid.tsx`: 4 tarjetas en orden Ventas Totales, Devoluciones, Gastos, Ganancia Estimada. Sólo variables de tema, sin hex. `"use client"`.
    - Archivos: `components/dashboard/sparkline.tsx`, `components/dashboard/kpi-card.tsx`, `components/dashboard/kpi-grid.tsx`.
    - Aceptación: con `variacionPorcentual=null` muestra "Sin datos previos" sin icono; con métrica de <2 puntos el sparkline muestra "Sin datos suficientes".
    - _Requirements: R4.1, R4.2, R4.3, R4.4, R4.5, R4.6, R4.7, R4.8, R4.9, R13.8, R12.3_

  - [x] 8.3 Implementar las gráficas `recharts` del dashboard
    - Crea `components/dashboard/grafica-tendencia.tsx` (Serie_Tendencia de ventas con ejes y leyenda), `grafica-ventas-gastos.tsx` (comparativa con leyenda y ejes), `grafica-top-selling.tsx` (barras topSelling máx 10, desc por unidades), `visual-top-margin.tsx` (margen máx 10, desc) y `lista-rotacion.tsx` (`topRotation` desc y `lowRotation` asc, máx 10, con `Table`). Tooltip al hover/focus. Colores vía `useTema` (sin hex), re-render al cambiar tema. `"use client"`.
    - Archivos: `components/dashboard/grafica-tendencia.tsx`, `components/dashboard/grafica-ventas-gastos.tsx`, `components/dashboard/grafica-top-selling.tsx`, `components/dashboard/visual-top-margin.tsx`, `components/dashboard/lista-rotacion.tsx`.
    - Aceptación: las gráficas renderizan con datos mock de DTO; al alternar tema cambian de paleta; los tooltips muestran fecha/nombre y valor.
    - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R5.7, R5.8, R5.9, R12.1, R12.3_

  - [x] 8.4 Implementar `components/dashboard/tabla-accesible-grafica.tsx`
    - Crea un componente reutilizable que renderiza, para cada gráfica, una `Table` con los mismos datos, navegable por teclado y lectores de pantalla (alternativa textual de R13.7).
    - Archivos: `components/dashboard/tabla-accesible-grafica.tsx`.
    - Aceptación: cada gráfica del dashboard expone una tabla equivalente con los mismos valores, alcanzable por Tab.
    - _Requirements: R13.7_

  - [x] 8.5 Implementar estados de carga, error y vacío del dashboard
    - Crea `components/dashboard/dashboard-skeleton.tsx` (`Skeleton` de tarjetas y gráficas), `components/dashboard/estado-error.tsx` (`Alert` + botón de reintento, conserva estructura sin datos parciales) y `components/dashboard/estado-vacio.tsx` ("No hay datos para el período seleccionado"). Sólo primitivas de `@/components/ui`. `"use client"`.
    - Archivos: `components/dashboard/dashboard-skeleton.tsx`, `components/dashboard/estado-error.tsx`, `components/dashboard/estado-vacio.tsx`.
    - Aceptación: render aislado de cada estado coincide con los textos y controles requeridos.
    - _Requirements: R5.10, R5.12, R5.13, R4.9_

  - [x] 8.6 Integrar el dashboard en `components/sections/dashboard-section.tsx`
    - Reemplaza el mock data por el consumo de `useRangoFechas` + `useDashboardData`. Monta `rango-fechas-selector`, `kpi-grid`, las gráficas y la lista de rotación, y renderiza skeleton/error/vacío/datos según `estado`. Conserva `dashboard-section.tsx` como punto de montaje (R12.6). `"use client"`.
    - Archivos: `components/sections/dashboard-section.tsx`.
    - Aceptación: la sección Dashboard muestra datos reales del backend; al cambiar el rango recarga KPIs y rankings con indicador de carga; sin datos muestra el estado vacío.
    - _Requirements: R1.3, R1.4, R4.1, R5.10, R5.13, R12.6, R14.4, R14.5_

  - [x] 8.7 Escribir tests ejemplares de UI del dashboard
    - Crea `__tests__/unit/dashboard-ui.test.tsx` (Testing Library + MSW): KPI con "Sin datos previos" (R4.6), sparkline oculto con <2 puntos (R4.8), estado de error con reintento, re-render de gráficas al cambiar tema (R5.9, R12.4), estado vacío.
    - Archivos: `__tests__/unit/dashboard-ui.test.tsx`.
    - Aceptación: los tests pasan.
    - _Requirements: R4.6, R4.8, R4.9, R5.9, R5.12, R5.13, R12.4_

## Fase 9 — Centro de notificaciones, header y sonido

- [x] 9. UI de notificaciones
  - [x] 9.1 Añadir el asset de sonido `public/notificacion.mp3`
    - Añade `public/notificacion.mp3`, un tono suave de ≤2 s. Si no se dispone de binario, documenta en el commit cómo generarlo y deja un placeholder válido reproducible. El asset debe ser servible en `/notificacion.mp3`.
    - Archivos: `public/notificacion.mp3`.
    - Aceptación: `fetch('/notificacion.mp3')` en runtime devuelve 200 y `useSonidoNotificacion` puede instanciar el `Audio`.
    - _Requirements: R10.2_

  - [x] 9.2 Implementar item, lista y estado vacío de notificaciones
    - `components/notificaciones/notificacion-item.tsx`: título, mensaje, tiempo relativo (`tiempoRelativoEs`), indicador visual persistente sólo en no leídas, marca leída al clic (vía `useNotificaciones`). `components/notificaciones/lista-notificaciones.tsx`: lista desc por `creado_en` con `ScrollArea`. `components/notificaciones/estado-vacio-notificaciones.tsx`: "No tienes notificaciones". `"use client"`.
    - Archivos: `components/notificaciones/notificacion-item.tsx`, `components/notificaciones/lista-notificaciones.tsx`, `components/notificaciones/estado-vacio-notificaciones.tsx`.
    - Aceptación: una notificación no leída muestra el indicador y al hacer clic se marca leída; sin items se muestra el estado vacío.
    - _Requirements: R9.4, R9.5, R9.6, R9.7, R9.11, R12.5_

  - [x] 9.3 Implementar `panel-notificaciones.tsx` y `region-aria-live.tsx`
    - `components/notificaciones/panel-notificaciones.tsx`: `Popover`/`Sheet` con cabecera "Marcar todas como leídas", recarga la lista al abrir (`useNotificaciones.recargar`), muestra error con reintento si falla la recarga (R11.7). `components/notificaciones/region-aria-live.tsx`: región `aria-live="polite"` que anuncia notificaciones nuevas. `"use client"`.
    - Archivos: `components/notificaciones/panel-notificaciones.tsx`, `components/notificaciones/region-aria-live.tsx`.
    - Aceptación: abrir el panel dispara recarga; "Marcar todas como leídas" deja el conteo en 0; un fallo de recarga muestra error con reintento.
    - _Requirements: R9.4, R9.9, R9.10, R11.6, R11.7, R12.2, R13.3_

  - [x] 9.4 Implementar `components/notificaciones/campana-notificaciones.tsx`
    - Icono `Bell` con `Badge_Conteo` (usa `formatearBadge`), `aria-label` dinámico (usa `ariaLabelCampana`), que abre `panel-notificaciones` y monta `region-aria-live`. Conecta `useNotificaciones` + `usePollingNotificaciones` (+ sonido al aumentar). Sólo primitivas de `@/components/ui`. `"use client"`.
    - Archivos: `components/notificaciones/campana-notificaciones.tsx`.
    - Aceptación: con 0 no leídas el badge se oculta; con >99 muestra "99+"; el `aria-label` refleja el conteo; al detectar aumento por polling actualiza el badge y anuncia por `aria-live`.
    - _Requirements: R9.1, R9.2, R9.3, R11.2, R13.1, R13.2, R13.3_

  - [x] 9.5 Montar la campana en `components/header.tsx`
    - Sustituye el placeholder `Bell` (con el punto rojo estático) por `<CampanaNotificaciones />`, manteniéndola visible en todas las secciones. Es la única edición sobre el shell existente.
    - Archivos: `components/header.tsx`.
    - Aceptación: la campana real con badge y panel aparece en el header en todas las secciones; no quedan restos del placeholder estático.
    - _Requirements: R9.1_

  - [x] 9.6 Escribir tests ejemplares de UI de notificaciones
    - Crea `__tests__/unit/notificaciones-ui.test.tsx` (Testing Library + MSW): marcar leída optimista con rollback en fallo (R9.7, R9.8), estado vacío + badge oculto (R9.11), `aria-label` y región `aria-live` (R13.1, R13.3), badge "99+".
    - Archivos: `__tests__/unit/notificaciones-ui.test.tsx`.
    - Aceptación: los tests pasan.
    - _Requirements: R9.7, R9.8, R9.11, R13.1, R13.3_

## Fase 10 — Accesibilidad, rendimiento y verificación final

- [x] 10. Verificación transversal
  - [x] 10.1 Escribir smoke test de accesibilidad del dashboard y notificaciones
    - Crea `__tests__/unit/accesibilidad-dashboard-notif.test.tsx` que verifica: presencia de alternativa tabla por gráfica (R13.7), `aria-label` de la campana (R13.1), región `aria-live` (R13.3) y orden lógico de tabulación del selector de rango y del panel (R13.4, R13.5).
    - Archivos: `__tests__/unit/accesibilidad-dashboard-notif.test.tsx`.
    - Aceptación: el test pasa.
    - _Requirements: R13.1, R13.3, R13.4, R13.5, R13.7_

  - [x] 10.2 Verificar uso de índices y timeout en las consultas agregadas
    - Crea `__tests__/integration/dashboard-rendimiento.test.ts` que, sobre un dataset grande sembrado, ejecuta `EXPLAIN` de las consultas de `calcularMetricas`/`calcularRankings` confirmando uso de los índices `ventas.creado_en` y `movimientos_stock.creado_en` (sin full table scan, R14.6), y verifica que una consulta que excede 5 s responde `CONSULTA_TIMEOUT` 504 (R14.7).
    - Archivos: `__tests__/integration/dashboard-rendimiento.test.ts`.
    - Aceptación: el test pasa con BD activa (marca `describe.skip` si `SKIP_DB_TESTS=1`).
    - _Requirements: R14.6, R14.7_

  - [x] 10.3 Checkpoint final - Asegurar que toda la suite pasa
    - Ejecuta `pnpm test:run` y confirma que P1–P10 y los tests ejemplares/integración (los implementados) pasan, y que las pruebas del core no regresionan. Si surgen dudas o regresiones, consulta al usuario antes de cerrar el plan.

## Notes

- Las sub-tareas marcadas con `*` son opcionales (tests ejemplares, integración, smoke a11y/rendimiento) y pueden saltarse para un MVP más rápido. Las **PBT P1–P10 son obligatorias** porque `design.md` exige cubrir las 10 propiedades canónicas.
- TDD por propiedad: las PBT de funciones puras (P1, P2, P3, P4, P6, P9, P10) y las model-based con BD (P5, P7) se escriben **antes** de su implementación; P8 se valida sobre la función pura ya disponible.
- Cada tarea hoja referencia los criterios de `requirements.md` que la justifican y, cuando aplica, la propiedad PBT del `design.md`.
- No se introducen librerías de UI nuevas: todo reutiliza `components/ui/`, `recharts`, `react-day-picker`, `date-fns(-tz)` y `sonner` ya presentes. La única edición del shell existente es `components/header.tsx` (montaje de la campana) y `components/sections/dashboard-section.tsx` (reemplazo del mock).
- El enganche de notificaciones vive **dentro** de las transacciones del core (`registrarVenta`, `ajustarStock`) sin alterar sus firmas, garantizando atomicidad (R7.6, R7.7).
- Los checkpoints (2.14, 3.7, 4.7, 6.9, 10.3) son puntos de detención donde se verifican tests y se consulta al usuario si surgen dudas.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "2.3", "2.5", "2.7", "2.10", "2.12", "3.1", "3.3", "4.1", "4.3", "5.1", "5.2", "5.4"] },
    { "id": 1, "tasks": ["1.2", "2.2", "2.8", "2.11", "2.13", "5.3"] },
    { "id": 2, "tasks": ["1.3", "2.4", "2.9", "4.2", "5.5"] },
    { "id": 3, "tasks": ["2.6", "3.4", "4.4", "4.5"] },
    { "id": 4, "tasks": ["3.2", "3.5", "4.6"] },
    { "id": 5, "tasks": ["3.6", "6.1", "6.2", "6.3", "6.4", "6.5", "6.6"] },
    { "id": 6, "tasks": ["6.7", "6.8", "7.1", "7.3", "7.5"] },
    { "id": 7, "tasks": ["7.2", "7.4", "7.6"] },
    { "id": 8, "tasks": ["7.7", "8.1", "8.3", "8.5", "9.1", "9.2"] },
    { "id": 9, "tasks": ["8.2", "8.4", "9.3"] },
    { "id": 10, "tasks": ["8.6", "9.4"] },
    { "id": 11, "tasks": ["8.7", "9.5", "10.2"] },
    { "id": 12, "tasks": ["9.6", "10.1"] }
  ]
}
```
