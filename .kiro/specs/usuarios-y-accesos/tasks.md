# Implementation Plan

## Overview

Plan de implementación atómico para `usuarios-y-accesos`. Cada tarea hoja es **autocontenida**, **pequeña** y **completable por un subagente sin contexto adicional**, con criterio de aceptación verificable. El orden respeta las dependencias técnicas descritas en `design.md`: primero las dependencias y el esquema multi-tenant, luego la librería de auth pura (con TDD por propiedad), la sesión y el guard, el servicio de correo, los endpoints, la actualización multi-inquilino del módulo previo y, por último, el frontend y la batería de pruebas.

Stack: **Next.js 16 + React 19 + TypeScript 5.7 + Prisma + MySQL 8 (instancia compartida con `inventario-ventas-core`) + Zod + shadcn/ui + Tailwind v4 + react-hook-form + sonner + bcryptjs + nodemailer + fast-check + vitest**. Gestor: **pnpm**.

Convenciones de nombres en este plan:

- `R<num>.<sub>` referencia un criterio de aceptación de `requirements.md`.
- `P<n>` referencia una propiedad canónica de `design.md` § Correctness Properties.
- Rutas en TypeScript usan los aliases `@/lib`, `@/hooks`, `@/components`, `@/components/ui`.
- Las sub-tareas marcadas con `*` son **opcionales** (pruebas ejemplares / integración / smoke complementarias). Las **15 pruebas por propiedad (P1–P15) NO se marcan opcionales**: el diseño exige cubrirlas (igual que en `inventario-ventas-core`).

## Tasks

## Fase 1 — Dependencias y configuración

- [x] 1. Dependencias y variables de entorno
  - [x] 1.1 Añadir `bcryptjs` y `nodemailer` con pnpm
    - Ejecuta `pnpm add bcryptjs nodemailer` y `pnpm add -D @types/bcryptjs @types/nodemailer`.
    - Verifica que `package.json` liste `bcryptjs` y `nodemailer` en `"dependencies"` y los `@types/*` en `"devDependencies"`; confirma que `pnpm-lock.yaml` se actualizó.
    - No alteres dependencias existentes del módulo previo.
    - Archivos: `package.json`, `pnpm-lock.yaml`.
    - Aceptación: `pnpm ls bcryptjs nodemailer` lista ambas sin errores.
    - _Requirements: R2.5, R6.1_

  - [x] 1.2 Extender `.env.example` con el bloque de sesiones/tokens y correo
    - Añade al final del `.env.example` existente (sin reemplazar lo previo) exactamente el bloque del `design.md` § Variables de entorno nuevas: `SESION_INACTIVIDAD_HORAS=168`, `VERIFICACION_TOKEN_HORAS=24`, `INVITACION_TOKEN_HORAS=72`, `BCRYPT_COST=12`, `APP_URL=http://localhost:3000`, `SMTP_HOST=`, `SMTP_PORT=587`, `SMTP_USER=`, `SMTP_PASSWORD=`, `SMTP_FROM="InvenPro <no-reply@invenpro.local>"`, `SMTP_SECURE=false`, con comentarios en español que documenten el proveedor de capa gratuita y el fallback a consola.
    - Archivos: `.env.example`.
    - Aceptación: `grep -c 'SMTP_' .env.example` devuelve al menos 6 y las claves de sesión/token están presentes.
    - _Requirements: R3.2, R6.1, R6.2, R6.5_

## Fase 2 — Esquema Prisma y migraciones multi-tenant

- [x] 2. Esquema de identidad/organizaciones y migración aditiva en dos pasos
  - [x] 2.1 Añadir enums y modelos de identidad/organizaciones al `prisma/schema.prisma`
    - Fusiona en el `schema.prisma` existente los enums `EstadoUsuario`, `EstadoMembresia`, `EstadoInvitacion`, `TipoHorario` y los modelos `Usuario`, `Sesion` (con `organizacion_activa_id String?`), `TokenVerificacion`, `Organizacion`, `Membresia`, `Rol`, `PermisoRol`, `Invitacion`, `HorarioMiembro` exactamente como en `design.md` § Data Models, con todos los `@db.Char(36)`, `@@unique`, `@@index`, `@@map` y relaciones inversas declaradas.
    - No modifiques aún los modelos de negocio existentes.
    - Archivos: `prisma/schema.prisma`.
    - Aceptación: `pnpm exec prisma format` no reordena de forma inesperada y `pnpm exec prisma validate` retorna OK.
    - _Requirements: R1.1, R1.2, R1.3, R1.4, R1.5, R1.6, R1.7, R1.8, R1.9, R1.11, R1.12, R1.13_

  - [x] 2.2 Añadir `organizacion_id` a los modelos de negocio existentes
    - Agrega a `Producto`, `Categoria`, `MovimientoStock`, `Venta`, `VentaItem` el campo `organizacion_id String @db.Char(36)` + relación `Organizacion` + `@@index([organizacion_id])`, y convierte los únicos globales en compuestos por tenant (`@@unique([organizacion_id, sku])`, `@@unique([organizacion_id, codigo_barras])`, `@@unique([organizacion_id, nombre])` en categorías). Para `Configuracion`, cambia la PK a `@@id([organizacion_id, clave])`.
    - Archivos: `prisma/schema.prisma`.
    - Aceptación: `pnpm exec prisma validate` retorna OK con los modelos de negocio referenciando `Organizacion`.
    - _Requirements: R13.1, R13.4_

  - [x] 2.3 Generar y aplicar la migración 1 `add_identidad_organizaciones`
    - Con MySQL arriba (`pnpm db:up`), ejecuta `pnpm exec prisma migrate dev --name add_identidad_organizaciones --create-only`; revisa que el SQL cree `usuarios`, `sesiones`, `tokens_verificacion`, `organizaciones`, `membresias`, `roles`, `permisos_rol`, `invitaciones`, `horarios_miembro` y **no** altere tablas de negocio. Aplica con `pnpm exec prisma migrate deploy`.
    - Archivos: `prisma/migrations/<ts>_add_identidad_organizaciones/migration.sql`.
    - Aceptación: `pnpm exec prisma migrate status` reporta la migración aplicada y `Database schema is up to date`.
    - _Requirements: R1.10_

  - [x] 2.4 Generar la migración 2 `add_organizacion_id_nullable` con backfill
    - Genera la migración (`--create-only`) que: agrega `organizacion_id CHAR(36) NULL` y su índice a cada tabla de negocio, e incluye el backfill SQL crudo del `design.md` (crea la `Organización Principal` con `slug='principal'` **solo si** existen filas de negocio sin tenant y no existe ya, y ejecuta los `UPDATE ... SET organizacion_id = '00000000-0000-4000-8000-000000000001' WHERE organizacion_id IS NULL` por tabla). Aplica con `pnpm exec prisma migrate deploy`.
    - Archivos: `prisma/migrations/<ts>_add_organizacion_id_nullable/migration.sql`.
    - Aceptación: tras aplicar, ninguna fila de negocio tiene `organizacion_id NULL` (verificable con un `SELECT COUNT(*)` por tabla).
    - _Requirements: R1.10, R13.4_

  - [x] 2.5 Generar la migración 3 `set_organizacion_id_not_null`
    - Genera la migración que altera `organizacion_id` a **NOT NULL**, añade las FKs a `organizaciones(id)` y crea/convierte los índices únicos compuestos por `organizacion_id`. Como el paso 2 eliminó los NULL, no debe fallar. Aplica con `pnpm exec prisma migrate deploy` y regenera el cliente con `pnpm exec prisma generate`.
    - Archivos: `prisma/migrations/<ts>_set_organizacion_id_not_null/migration.sql`.
    - Aceptación: `pnpm exec prisma migrate status` reporta todo aplicado; el cliente Prisma expone los modelos nuevos y `organizacion_id` NOT NULL.
    - _Requirements: R13.1, R13.4_

  - [x] 2.6 Smoke test de migración aditiva que preserva datos existentes
    - Crea `__tests__/integration/migracion-multitenant-smoke.test.ts` que: sobre una BD con datos de negocio previos (seed del módulo anterior), aplica las tres migraciones y verifica que `producto.count()` se conserva y que cada producto quedó con `organizacion_id` de la organización por defecto. `describe.skip` si `SKIP_DB_TESTS=1`.
    - Archivos: `__tests__/integration/migracion-multitenant-smoke.test.ts`.
    - Aceptación: el test pasa con la BD activa.
    - _Requirements: R1.10, R13.1, R13.4_

## Fase 3 — Librería de auth pura y testeable (TDD por propiedad)

- [x] 3. Lógica pura de auth y sus property tests
  - [x] 3.1 Crear `lib/auth/secciones.ts`
    - Exporta `SECCIONES`, `ACCIONES` (con sus tipos `Seccion`, `Accion`) y `LABEL_A_SECCION` exactamente como en `design.md` § Sidebar.
    - Archivos: `lib/auth/secciones.ts`.
    - Aceptación: `SECCIONES.length === 8` y `ACCIONES.length === 5` en un import de prueba.
    - _Requirements: R11.1, R18.5_

  - [x] 3.2 Crear `lib/auth/vigencia.ts` con `clampInt` y `vigenciaTokenHoras`
    - Implementa `clampInt(raw, def, min, max)` (parsea, valida numérico y rango, aplica `def` si inválido) y `vigenciaTokenHoras(env)` que devuelve un entero en `[1, 168]` con default 24. Añade también `vidaSesionMs()` (lee `SESION_INACTIVIDAD_HORAS`, rango 1h–30d, default 7d) y `nuevaExpiracion()`.
    - Archivos: `lib/auth/vigencia.ts`.
    - Aceptación: `vigenciaTokenHoras('999')===24`, `vigenciaTokenHoras('48')===48`, `vigenciaTokenHoras(undefined)===24`.
    - _Requirements: R3.2, R3.3, R4.2_

  - [x] 3.3 Escribir PBT P4 de saneamiento de la vigencia por entorno
    - Crea `__tests__/property/config-vigencia.test.ts` con `fc.assert` (numRuns: 100). Cabecera: `// Feature: usuarios-y-accesos, Property 4: Saneamiento de la vigencia configurable`.
    - **Property 4: Saneamiento de la vigencia configurable por entorno**
    - **Validates: Requirements 3.2, 3.3**
    - Genera valores numéricos en rango, fuera de rango, vacíos, ausentes y no numéricos; verifica que el resultado siempre es entero en `[1,168]` y que las entradas inválidas devuelven 24.
    - Archivos: `__tests__/property/config-vigencia.test.ts`.
    - _PBT: Property 4 (`__tests__/property/config-vigencia.test.ts`)_
    - _Requirements: R3.2, R3.3_

  - [x] 3.4 Crear `lib/auth/password.ts`
    - Implementa `hashContrasena(plano)` y `verificarContrasena(plano, hash)` con `bcryptjs`, coste vía `clampInt(process.env.BCRYPT_COST, 12, 4, 15)` (importa `clampInt` de `@/lib/auth/vigencia`). `verificarContrasena` retorna `false` ante hash corrupto.
    - Archivos: `lib/auth/password.ts`.
    - Aceptación: un round-trip manual `verificarContrasena('hola1234', await hashContrasena('hola1234'))` es `true`.
    - _Requirements: R2.4, R2.5_

  - [x] 3.5 Escribir PBT P2 de round-trip de hashing de contraseñas
    - Crea `__tests__/property/password.test.ts` con `fc.assert` (numRuns: 100, coste bcrypt reducido vía `BCRYPT_COST=4`). Cabecera: `// Feature: usuarios-y-accesos, Property 2`.
    - **Property 2: Round-trip de hashing de contraseñas**
    - **Validates: Requirements 2.4, 2.5**
    - Para toda `p` de 8–128 chars, `verificarContrasena(p, hashContrasena(p))===true`; para `q≠p`, `false`.
    - Archivos: `__tests__/property/password.test.ts`.
    - _PBT: Property 2 (`__tests__/property/password.test.ts`)_
    - _Requirements: R2.4, R2.5_

  - [x] 3.6 Crear `lib/auth/tokens.ts`
    - Implementa `generarToken()` (32 bytes base64url), `hashToken(plano)` (SHA-256 hex), `coincideToken(plano, hash)` (comparación en tiempo constante) y `esVigente(expira_en: Date, ahora?: Date)` (true sii `ahora <= expira_en`), como en `design.md` § tokens.
    - Archivos: `lib/auth/tokens.ts`.
    - Aceptación: `hashToken(t.plano)===t.hash` para `t=generarToken()`; `esVigente(new Date(Date.now()-1))===false`.
    - _Requirements: R3.1, R9.4, R16.1, R16.2_

  - [x] 3.7 Escribir PBT P3 de expiración de tokens y sesiones
    - Crea `__tests__/property/expiracion.test.ts` con `fc.assert` (numRuns: 100). Cabecera con `Property 3`.
    - **Property 3: Invariante de expiración de tokens y sesiones**
    - **Validates: Requirements 16.2**
    - Para toda `expira_en` y `ahora`, `esVigente` es true sii `ahora <= expira_en`; para `ahora > expira_en` siempre false.
    - Archivos: `__tests__/property/expiracion.test.ts`.
    - _PBT: Property 3 (`__tests__/property/expiracion.test.ts`)_
    - _Requirements: R16.2_

  - [x] 3.8 Crear `lib/auth/permisos.ts`
    - Implementa el tipo `Permiso`, `PERMISOS_PROPIETARIO` (producto cartesiano `SECCIONES × ACCIONES`), `tienePermiso(permisos, seccion, accion)` y `seccionesVisibles(permisos)` exactamente como en `design.md`.
    - Archivos: `lib/auth/permisos.ts`.
    - Aceptación: `PERMISOS_PROPIETARIO.length === 40`; `tienePermiso([], 'usuarios','ver')===false`.
    - _Requirements: R11.1, R11.2, R11.10, R12.1_

  - [x] 3.9 Escribir PBT P7 del invariante de control de acceso
    - Crea `__tests__/property/permisos.test.ts` con `fc.assert` (numRuns: 100) usando `arbPermisos`. Cabecera con `Property 7`.
    - **Property 7: Invariante de control de acceso**
    - **Validates: Requirements 11.4, 11.10, 12.1, 12.2, 12.4, 12.6, 12.7**
    - `tienePermiso(P, s, a)` es true sii `(s,a)∈P`; `seccionesVisibles(P)` es exactamente `{ s : (s,'ver')∈P }`.
    - Archivos: `__tests__/property/permisos.test.ts`.
    - _PBT: Property 7 (`__tests__/property/permisos.test.ts`)_
    - _Requirements: R11.4, R11.10, R12.1, R12.2, R12.4, R12.6, R12.7_

  - [x] 3.10 Escribir PBT P8 del catálogo completo de permisos del Rol_Propietario
    - Crea `__tests__/property/permisos-propietario.test.ts` (numRuns: 100). Cabecera con `Property 8`.
    - **Property 8: Catálogo completo de permisos del Rol_Propietario**
    - **Validates: Requirements 11.2**
    - `PERMISOS_PROPIETARIO` es exactamente el producto cartesiano `|SECCIONES|×|ACCIONES|` sin omisiones ni duplicados.
    - Archivos: `__tests__/property/permisos-propietario.test.ts`.
    - _PBT: Property 8 (`__tests__/property/permisos-propietario.test.ts`)_
    - _Requirements: R11.2_

  - [x] 3.11 Crear `lib/auth/slug.ts`
    - Implementa `slugificar(nombre)` (NFD, quita acentos, minúsculas, `[a-z0-9-]`, recorte a 80, fallback `"org"`) y `slugUnico(tx, nombre)` (anexa sufijo `-2`, `-3`, ... respetando 80 chars) como en `design.md`. `slugUnico` recibe un cliente de transacción Prisma; usa un helper `existeSlug(tx, slug)`.
    - Archivos: `lib/auth/slug.ts`.
    - Aceptación: `slugificar('Café del Ñandú!')` produce solo `[a-z0-9-]` y `|slug|<=80`.
    - _Requirements: R8.4_

  - [x] 3.12 Escribir PBT P10 de generación de slug válido y único
    - Crea `__tests__/property/slug.test.ts` (numRuns: 100) usando `arbNombreOrg`; stub en memoria de `existeSlug`. Cabecera con `Property 10`.
    - **Property 10: Generación de slug válido y único**
    - **Validates: Requirements 8.4**
    - Para todo `nombre`, `slugificar` da `[a-z0-9-]` con `1<=|slug|<=80`; ante colisiones, `slugUnico` anexa sufijo incremental sin exceder 80 y nunca repite.
    - Archivos: `__tests__/property/slug.test.ts`.
    - _PBT: Property 10 (`__tests__/property/slug.test.ts`)_
    - _Requirements: R8.4_

  - [x] 3.13 Crear `lib/auth/rate-limit.ts`
    - Implementa `consumir(clave, limite, ventanaMs)` con ventana deslizante en memoria (`Map`) y exporta `LIMITE_LOGIN` (5 / 15 min) y `LIMITE_REENVIO` (5 / hora) como en `design.md`.
    - Archivos: `lib/auth/rate-limit.ts`.
    - Aceptación: 5 llamadas con la misma clave y límite 5 retornan true y la 6.ª retorna false.
    - _Requirements: R3.10, R4.8, R16.3_

  - [x] 3.14 Escribir PBT P13 de límite de tasa por ventana deslizante
    - Crea `__tests__/property/rate-limit.test.ts` (numRuns: 100) usando `arbIntentos` y un reloj inyectable. Cabecera con `Property 13`.
    - **Property 13: Límite de tasa por ventana deslizante**
    - **Validates: Requirements 3.10, 4.8, 16.3**
    - Para toda secuencia de intentos y `(L,W)`, se permiten a lo sumo `L` por ventana `W` y se rechaza el `L+1`; al envejecer los intentos fuera de `W`, vuelve a permitir.
    - Archivos: `__tests__/property/rate-limit.test.ts`.
    - _PBT: Property 13 (`__tests__/property/rate-limit.test.ts`)_
    - _Requirements: R3.10, R4.8, R16.3_

  - [x] 3.15 Checkpoint — Lógica pura y P2/P3/P4/P7/P8/P10/P13 en verde
    - Ejecuta `pnpm test:run __tests__/property/password.test.ts __tests__/property/expiracion.test.ts __tests__/property/config-vigencia.test.ts __tests__/property/permisos.test.ts __tests__/property/permisos-propietario.test.ts __tests__/property/slug.test.ts __tests__/property/rate-limit.test.ts` y confirma que pasan. Ante dudas sobre rangos o catálogos, consulta al usuario antes de continuar.

## Fase 4 — Sesión y guard de request

- [x] 4. Sesión de servidor, serializadores y guard de acceso
  - [x] 4.1 Crear `lib/api/serializadores-auth.ts` con los DTO
    - Define `UsuarioDTO`, `OrganizacionDTO`, `OrganizacionConRolDTO`, `MiembroDTO`, `InvitacionDTO`, `HorarioMiembroDTO`, `RolDTO` y los conversores `toUsuarioDTO`, `toOrganizacionDTO`, `toMiembroDTO`, `toInvitacionDTO`, `toHorarioDTO`, `toRolDTO`. Los DTO **nunca** exponen `hash_contrasena`, `hash_sesion` ni `token_hash`.
    - Archivos: `lib/api/serializadores-auth.ts`.
    - Aceptación: `JSON.stringify(toUsuarioDTO(u))` no contiene `hash_contrasena`.
    - _Requirements: R2.6, R16.1_

  - [x] 4.2 Escribir PBT P1 de round-trip de tokens y no fuga de secretos
    - Crea `__tests__/property/tokens.test.ts` (numRuns: 100). Cabecera con `Property 1`.
    - **Property 1: Round-trip de tokens y no fuga de secretos**
    - **Validates: Requirements 2.6, 3.1, 9.4, 16.1**
    - Para todo token de `generarToken()`, `hashToken(plano)` reproduce el hash persistido y una búsqueda por ese hash (en un mapa en memoria hash→entidad) resuelve a la entidad originadora y a ninguna otra; tokens distintos producen hashes distintos; y `toUsuarioDTO`/`toInvitacionDTO` serializados nunca contienen `hash_contrasena`, `hash_sesion` ni `token_hash`.
    - Archivos: `__tests__/property/tokens.test.ts`.
    - _PBT: Property 1 (`__tests__/property/tokens.test.ts`)_
    - _Requirements: R2.6, R3.1, R9.4, R16.1_

  - [x] 4.3 Crear `lib/api/respuestas-auth.ts` con `errorAuth`
    - Implementa `errorAuth(codigo, status)` (mismo shape `{ error: { codigo, mensaje } }` y `Content-Type: application/json; charset=utf-8` del módulo previo) y extiende `mensajePorCodigo` con los códigos de auth del catálogo (`NO_AUTENTICADO`, `PERMISO_DENEGADO`, `SIN_ORGANIZACION_ACTIVA`, `SESION_INVALIDA`, `MEMBRESIA_NO_ACTIVA`).
    - Archivos: `lib/api/respuestas-auth.ts`.
    - Aceptación: `errorAuth('NO_AUTENTICADO',401).status===401` y header correcto.
    - _Requirements: R15.8, R16.4_

  - [x] 4.4 Crear `lib/auth/sesion.ts`
    - Implementa `COOKIE_SESION`, `leerSesion()` (lee cookie → `hashToken` → `prisma.sesion.findUnique` con `usuario`; borra y devuelve null si expirada; aplica sliding expiration con `nuevaExpiracion()`), `crearSesion(usuarioId)` (genera token, persiste hash, devuelve el plano), `invalidarSesionPorCookie(cookie)` e `invalidarSesionesDeUsuario(usuarioId)` (deleteMany por `usuario_id`, R16.6). Importa `toUsuarioDTO` y `hashToken`.
    - Archivos: `lib/auth/sesion.ts`.
    - Aceptación: compila e importar `leerSesion` no rompe el build.
    - _Requirements: R4.2, R4.6, R4.7, R16.1, R16.2, R16.6_

  - [x] 4.5 Crear `lib/auth/contexto-request.ts` (guard)
    - Implementa `resolverContexto(requerido)` que devuelve `{ ctx }` o `{ error: Response }`: sin sesión → `NO_AUTENTICADO` 401; `"solo-sesion"` → contexto sin org; sin `organizacion_activa_id` o sin membresía activa → `SIN_ORGANIZACION_ACTIVA` 409; sin el permiso requerido → `PERMISO_DENEGADO` 403; en éxito retorna `{ usuarioActual, organizacionActiva, rol, permisos }`. Exactamente como en `design.md`.
    - Archivos: `lib/auth/contexto-request.ts`.
    - Aceptación: un test con sesión nula retorna `{ error }` con status 401 (cubierto en 4.6).
    - _Requirements: R8.8, R11.4, R12.4, R13.5, R13.8, R16.4_

  - [x] 4.6 Pruebas ejemplares del guard `resolverContexto`
    - Crea `__tests__/unit/contexto-request.test.ts` que mockea `leerSesion`/Prisma y cubre los 5 caminos (sin sesión, solo-sesión, sin org, sin permiso, autorizado).
    - Archivos: `__tests__/unit/contexto-request.test.ts`.
    - Aceptación: los 5 casos pasan.
    - _Requirements: R8.8, R11.4, R12.4, R13.8, R16.4_

## Fase 5 — Servicio de correo de costo cero

- [x] 5. Transporte SMTP, fallback a consola y plantillas
  - [x] 5.1 Crear `lib/correo/errores.ts`
    - Define `ErrorEnvioCorreo` (→ `ENVIO_CORREO_FALLIDO` 502) y `ErrorAppUrl` (→ `APP_URL_NO_CONFIGURADA` 500) como clases de error de dominio.
    - Archivos: `lib/correo/errores.ts`.
    - Aceptación: `new ErrorEnvioCorreo() instanceof Error` es true.
    - _Requirements: R6.4, R6.6_

  - [x] 5.2 Crear `lib/correo/transporte.ts`
    - Implementa `configurado()` (true sii `SMTP_HOST`, `SMTP_USER` y `SMTP_PASSWORD` presentes) y `crearTransporte()` con `nodemailer.createTransport` leyendo host/port/secure/auth de env, como en `design.md`.
    - Archivos: `lib/correo/transporte.ts`.
    - Aceptación: con las 3 variables vacías, `configurado()===false`.
    - _Requirements: R6.1, R6.3_

  - [x] 5.3 Crear `lib/correo/plantillas.ts`
    - Implementa `plantillaVerificacion(nombre, enlace)` y `plantillaInvitacion(org, rol, enlace)` en español (asunto/texto/html) con `escHtml()` para escapar el contenido dinámico, como en `design.md`.
    - Archivos: `lib/correo/plantillas.ts`.
    - Aceptación: `plantillaVerificacion('Ana','x').asunto` contiene "Verifica" y el html escapa `<`.
    - _Requirements: R2.7, R9.3_

  - [x] 5.4 Crear `lib/correo/enviar.ts`
    - Implementa `enviarCorreo({para, asunto, html, texto})`: lanza `ErrorAppUrl` si falta `APP_URL` (R6.6); si `!configurado()` registra en consola destinatario/asunto/texto y devuelve `{entregado:true, modo:'consola'}` (R6.3); con SMTP, `Promise.race` con timeout de 15s, y ante error/timeout lanza `ErrorEnvioCorreo` sin filtrar credenciales (R6.4). Añade `construirEnlace(token, accion)` que arma `${APP_URL}/?token=<plano>&accion=<verificar|invitacion>`.
    - Archivos: `lib/correo/enviar.ts`.
    - Aceptación: con `APP_URL` vacío lanza `ErrorAppUrl`; con SMTP sin configurar y `APP_URL` definido devuelve modo `consola`.
    - _Requirements: R6.3, R6.4, R6.5, R6.6_

  - [x] 5.5 Pruebas ejemplares del servicio de correo
    - Crea `__tests__/unit/correo.test.ts` que mockea `nodemailer` y cubre: éxito SMTP, fallback consola (sin credenciales), `ErrorAppUrl` (sin `APP_URL`) y `ErrorEnvioCorreo` ante rechazo del transporte.
    - Archivos: `__tests__/unit/correo.test.ts`.
    - Aceptación: los 4 casos pasan.
    - _Requirements: R2.7, R2.8, R6.3, R6.4, R6.6_

## Fase 6 — Endpoints de autenticación

- [x] 6. Esquemas Zod de auth, dominio de usuarios y endpoints de autenticación
  - [x] 6.1 Crear `lib/schemas/auth.ts`
    - Implementa `correoSchema` (`trim().toLowerCase().email().max(254)`, R2.9), `registroSchema` (correo + nombre 1–160 + contrasena 8–128), `loginSchema`, `verificarCorreoSchema` (`{ token }`) y `reenviarVerificacionSchema` (`{ correo }`), como en `design.md`.
    - Archivos: `lib/schemas/auth.ts`.
    - Aceptación: `registroSchema.safeParse({correo:'A@B.CO',nombre:'x',contrasena:'12345678'}).data.correo === 'a@b.co'`.
    - _Requirements: R2.2, R2.9, R4.1_

  - [x] 6.2 Crear `lib/dominio/usuarios.ts` — `registrarUsuario`
    - Implementa `registrarUsuario(input)`: normaliza correo, rechaza duplicado con `CorreoDuplicadoError` (R2.10), crea `Usuario` (`estado=pendiente`, hash bcrypt), genera Token_Verificacion (hash + `expira_en` según `vigenciaTokenHoras`), e intenta enviar el correo de verificación; si el envío falla, conserva el usuario y marca el envío como fallido (R2.8). Define `CorreoDuplicadoError` en `lib/dominio/errores-auth.ts`.
    - Archivos: `lib/dominio/usuarios.ts`, `lib/dominio/errores-auth.ts`.
    - Aceptación: test unitario (mock Prisma+correo) verifica creación con hash y emisión de token.
    - _Requirements: R2.4, R2.5, R2.7, R2.8, R2.9, R2.10_

  - [x] 6.3 Implementar `POST /api/auth/registro`
    - Crea `app/api/auth/registro/route.ts` con rate-limit por IP (`registro-ip:<ip>`), `withValidation(registroSchema, ...)`, llama `dominio.registrarUsuario`; mapea `CorreoDuplicadoError → 409 CORREO_DUPLICADO`, `ErrorAppUrl`/`ErrorEnvioCorreo` a sus códigos, éxito → `201 UsuarioDTO`.
    - Archivos: `app/api/auth/registro/route.ts`.
    - Aceptación: `POST` con correo nuevo retorna 201 sin `hash_contrasena`; repetido retorna 409 `CORREO_DUPLICADO`.
    - _Requirements: R2.1, R2.3, R2.4, R2.6, R2.10, R15.1, R16.3_

  - [x] 6.4 Implementar verificación de correo en el dominio
    - Añade en `lib/dominio/usuarios.ts`: `verificarCorreo(token)` que busca por `hashToken`, si válido y no expirado marca `correo_verificado=true`, `estado=activo`, `consumido_en=now` (R3.4); si ya consumido y usuario verificado, retorna éxito idempotente (R3.5); si inexistente/expirado lanza `TokenInvalidoError` (R3.6).
    - Archivos: `lib/dominio/usuarios.ts`.
    - Aceptación: test unitario cubre los tres caminos (válido, idempotente, inválido).
    - _Requirements: R3.4, R3.5, R3.6_

  - [x] 6.5 Escribir PBT P5 de idempotencia de la verificación de correo
    - Crea `__tests__/property/verificacion-idempotente.test.ts` (numRuns: 100) con repositorios en memoria. Cabecera con `Property 5`.
    - **Property 5: Idempotencia de la verificación de correo**
    - **Validates: Requirements 3.4, 3.5**
    - Tras la primera verificación válida el usuario queda `correo_verificado=true`/`estado=activo`; re-aplicar con el token consumido deja el estado sin cambios.
    - Archivos: `__tests__/property/verificacion-idempotente.test.ts`.
    - _PBT: Property 5 (`__tests__/property/verificacion-idempotente.test.ts`)_
    - _Requirements: R3.4, R3.5_

  - [x] 6.6 Implementar `POST /api/auth/verificar-correo`
    - Crea `app/api/auth/verificar-correo/route.ts` con `withValidation(verificarCorreoSchema, ...)`, llama `dominio.verificarCorreo`; `TokenInvalidoError → 400 TOKEN_INVALIDO`, éxito → `200 { ok: true }`.
    - Archivos: `app/api/auth/verificar-correo/route.ts`.
    - Aceptación: token válido retorna 200; inexistente retorna 400 `TOKEN_INVALIDO`.
    - _Requirements: R3.4, R3.5, R3.6_

  - [x] 6.7 Implementar reenvío de verificación (dominio + endpoint)
    - Añade `reenviarVerificacion(correo)` en `lib/dominio/usuarios.ts`: si el usuario existe y no verificado, invalida los tokens previos no consumidos, emite uno nuevo y reenvía (R3.9). Crea `app/api/auth/reenviar-verificacion/route.ts` con rate-limit `reenvio:<correo>` (`LIMITE_REENVIO`): si excede → `429 LIMITE_REENVIO_EXCEDIDO` sin emitir token (R3.10); en éxito → `200 { ok: true }`; respuesta uniforme para no revelar existencia.
    - Archivos: `lib/dominio/usuarios.ts`, `app/api/auth/reenviar-verificacion/route.ts`.
    - Aceptación: la 6.ª solicitud en una hora retorna 429 `LIMITE_REENVIO_EXCEDIDO`.
    - _Requirements: R3.8, R3.9, R3.10_

  - [x] 6.8 Implementar `POST /api/auth/login`
    - Crea `app/api/auth/login/route.ts`: rate-limit `login:<correo>` y `login-ip:<ip>` (`LIMITE_LOGIN`) → `429 DEMASIADOS_INTENTOS` (R4.8); `withValidation(loginSchema, ...)`; busca usuario, `verificarContrasena`; sin match → `401 CREDENCIALES_INVALIDAS` sin revelar existencia (R4.3, R16.5); `estado=pendiente` → `403 CORREO_NO_VERIFICADO` (R4.4); activo → `crearSesion`, `Set-Cookie` `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=<inactividad>` y `200 UsuarioDTO` (R4.1).
    - Archivos: `app/api/auth/login/route.ts`.
    - Aceptación: credenciales válidas retornan 200 + cookie; inválidas 401; no verificado 403.
    - _Requirements: R4.1, R4.3, R4.4, R4.8, R16.3, R16.5_

  - [x] 6.9 Implementar `POST /api/auth/logout` y `GET /api/auth/sesion`
    - Crea `app/api/auth/logout/route.ts`: invalida la sesión por cookie, borra la cookie (`Max-Age=0`) y responde `200 { ok: true }` incluso sin sesión (idempotente, R4.5). Crea `app/api/auth/sesion/route.ts`: con sesión válida → `200 UsuarioDTO` (R4.6); sin/expirada → `401 SESION_INVALIDA` (R4.7).
    - Archivos: `app/api/auth/logout/route.ts`, `app/api/auth/sesion/route.ts`.
    - Aceptación: doble `POST /logout` retorna 200 ambas veces; `GET /sesion` sin cookie retorna 401 `SESION_INVALIDA`.
    - _Requirements: R4.5, R4.6, R4.7_

  - [x] 6.10 Pruebas ejemplares de login/logout/sesión
    - Crea `__tests__/integration/auth-sesion.test.ts` que verifica: cookie `httpOnly/Secure/SameSite=Lax` con sliding expiration en login (R4.1, R4.2), doble logout idempotente (R4.5) e invalidación de todas las sesiones al cambiar contraseña (R16.6).
    - Archivos: `__tests__/integration/auth-sesion.test.ts`.
    - Aceptación: los casos pasan con BD activa.
    - _Requirements: R4.1, R4.2, R4.5, R16.6_

  - [x] 6.11 Checkpoint — Autenticación end-to-end y P1/P5 en verde
    - Ejecuta `pnpm test:run __tests__/property/tokens.test.ts __tests__/property/verificacion-idempotente.test.ts` y las pruebas de auth disponibles. Verifica manualmente registro→verificación→login→sesión→logout. Ante dudas, consulta al usuario.

## Fase 7 — Endpoints de organizaciones

- [x] 7. Dominio de organizaciones y sus endpoints
  - [x] 7.1 Crear `lib/schemas/organizaciones.ts`
    - Implementa `crearOrganizacionSchema` (`nombre` trim 1–160, R8.6) y `seleccionOrgSchema` (`{ organizacion_id: uuid }`).
    - Archivos: `lib/schemas/organizaciones.ts`.
    - Aceptación: `crearOrganizacionSchema.safeParse({nombre:'  '}).success===false`.
    - _Requirements: R8.6, R8.7_

  - [x] 7.2 Crear `lib/dominio/organizaciones.ts` — `crearOrganizacion`
    - Implementa `crearOrganizacion(usuarioActual, nombre)` dentro de `prisma.$transaction`: genera `slugUnico`, inserta `Organizacion`, crea `Rol_Propietario` (`es_sistema=true`) con `PERMISOS_PROPIETARIO`, inserta `permisos_rol` y la `Membresia` activa del creador; ante cualquier fallo hace rollback y lanza `OrganizacionFallidaError` (R8.5). Garantiza exactamente un propietario.
    - Archivos: `lib/dominio/organizaciones.ts`, `lib/dominio/errores-auth.ts` (extensión).
    - Aceptación: test unitario (mock tx) verifica creación de org+rol+40 permisos+membresía.
    - _Requirements: R8.1, R8.2, R8.3, R8.5_

  - [x] 7.3 Escribir PBT P9 del invariante de propietario único
    - Crea `__tests__/property/propietario-unico.test.ts` (numRuns: 100) con repositorio en memoria. Cabecera con `Property 9`.
    - **Property 9: Invariante de propietario único de la organización**
    - **Validates: Requirements 8.2, 8.3, 11.6, 11.7**
    - Tras crear cualquier organización existe exactamente un Rol_Propietario asignado a exactamente un miembro; toda operación posterior que dejaría 0 propietarios se rechaza con `PROPIETARIO_REQUERIDO` y editar/eliminar el Rol_Propietario con `ROL_PROPIETARIO_PROTEGIDO`.
    - Archivos: `__tests__/property/propietario-unico.test.ts`.
    - _PBT: Property 9 (`__tests__/property/propietario-unico.test.ts`)_
    - _Requirements: R8.2, R8.3, R11.6, R11.7_

  - [x] 7.4 Implementar `GET` y `POST /api/organizaciones`
    - Crea `app/api/organizaciones/route.ts`: `GET` con guard `"solo-sesion"` devuelve `OrganizacionConRolDTO[]` con membresía activa, ordenadas A–Z (R7.1, R7.2); `POST` con guard `"solo-sesion"` (`NO_AUTENTICADO` 401 si falta, R8.8), `withValidation(crearOrganizacionSchema, ...)`, llama `crearOrganizacion`; `OrganizacionFallidaError → 500 ORGANIZACION_FALLIDA`, éxito → `201 OrganizacionDTO`.
    - Archivos: `app/api/organizaciones/route.ts`.
    - Aceptación: `GET` lista solo orgs con membresía activa A–Z; `POST` autenticado retorna 201.
    - _Requirements: R7.1, R7.2, R8.1, R8.7, R8.8_

  - [x] 7.5 Implementar `GET` y `POST /api/auth/organizacion-activa`
    - Crea `app/api/auth/organizacion-activa/route.ts`: `GET` (guard sesión) devuelve la `OrganizacionDTO` activa o `null` (R7.3); `POST` con `seleccionOrgSchema` valida que el usuario tenga membresía activa en esa org, persiste `organizacion_activa_id` en la sesión y responde `200 OrganizacionDTO`; si la membresía no está activa → `409 MEMBRESIA_NO_ACTIVA` (R7.7).
    - Archivos: `app/api/auth/organizacion-activa/route.ts`.
    - Aceptación: seleccionar una org con membresía activa retorna 200 y persiste; con membresía inactiva 409 `MEMBRESIA_NO_ACTIVA`.
    - _Requirements: R7.3, R7.5, R7.7, R13.5_

  - [x] 7.6 Implementar `GET /api/organizaciones/{id}/miembros`
    - Crea `app/api/organizaciones/[id]/miembros/route.ts` con guard `(usuarios, ver)`. Devuelve `MiembroDTO[]` (membresía, usuario, rol, estado) de la org activa. Ignora cualquier `organizacion_id` del cliente y usa la org del guard.
    - Archivos: `app/api/organizaciones/[id]/miembros/route.ts`.
    - Aceptación: retorna la lista de miembros de la org activa; sin permiso `(usuarios, ver)` retorna 403.
    - _Requirements: R14.7, R15.2_

  - [x] 7.7 Prueba de integración del rollback de creación de organización
    - Crea `__tests__/integration/crear-organizacion-rollback.test.ts` que inyecta un fallo en un paso intermedio de la transacción y verifica que no quedan org/rol/membresía huérfanas (R8.5).
    - Archivos: `__tests__/integration/crear-organizacion-rollback.test.ts`.
    - Aceptación: tras el fallo, 0 filas creadas.
    - _Requirements: R8.5_

## Fase 8 — Endpoints de invitaciones

- [x] 8. Dominio de invitaciones y sus endpoints
  - [x] 8.1 Crear `lib/schemas/invitaciones.ts`
    - Implementa `invitarSchema` (`correo` normalizado + `rol_id` uuid) y `aceptarInvitacionSchema` (`{ token }`).
    - Archivos: `lib/schemas/invitaciones.ts`.
    - Aceptación: `invitarSchema.safeParse({correo:'no-mail',rol_id:'x'}).success===false`.
    - _Requirements: R9.2, R9.8_

  - [x] 8.2 Crear `lib/dominio/invitaciones.ts` — `invitar`
    - Implementa `invitar(orgId, usuarioActual, input)`: si el correo ya tiene membresía activa → `MiembroExistenteError` (409, R9.5); si el `rol_id` no es de la org → `RolFueraDeOrganizacionError` (400, R9.9); si ya hay invitación `pendiente` para (correo, org) → regenera token, renueva `expira_en` (vía `INVITACION_TOKEN_HORAS`, default 72h), reenvía y devuelve la existente con flag `regenerada` (200, R9.6); si no, crea `Invitacion` pendiente y envía el correo (201, R9.2–R9.4). Define los errores en `lib/dominio/errores-auth.ts`.
    - Archivos: `lib/dominio/invitaciones.ts`, `lib/dominio/errores-auth.ts` (extensión).
    - Aceptación: test unitario cubre nuevo/regenerado/miembro-existente/rol-ajeno.
    - _Requirements: R9.2, R9.3, R9.4, R9.5, R9.6, R9.9_

  - [x] 8.3 Escribir PBT P14 de idempotencia de invitación pendiente
    - Crea `__tests__/property/invitacion-idempotente.test.ts` (numRuns: 100) con repositorio en memoria. Cabecera con `Property 14`.
    - **Property 14: Idempotencia de invitación pendiente**
    - **Validates: Requirements 9.5, 9.6**
    - Invitar repetidamente al mismo (correo, org) nunca produce más de una invitación `pendiente` (regenera token/expiración); si ya hay membresía activa, se rechaza con `MIEMBRO_EXISTENTE` sin crear invitación.
    - Archivos: `__tests__/property/invitacion-idempotente.test.ts`.
    - _PBT: Property 14 (`__tests__/property/invitacion-idempotente.test.ts`)_
    - _Requirements: R9.5, R9.6_

  - [x] 8.4 Implementar `POST` y `GET /api/organizaciones/{id}/invitaciones`
    - Crea `app/api/organizaciones/[id]/invitaciones/route.ts`: `POST` con guard `(usuarios, administrar)`, `withValidation(invitarSchema, ...)`, llama `invitar`; mapea `MiembroExistenteError → 409`, `RolFueraDeOrganizacionError → 400`, éxito `201` (nueva) o `200` (regenerada). `GET` con guard `(usuarios, ver)` devuelve `InvitacionDTO[]` de la org (sin token).
    - Archivos: `app/api/organizaciones/[id]/invitaciones/route.ts`.
    - Aceptación: invitar correo nuevo retorna 201; repetir el mismo retorna 200 sin duplicar; invitar a miembro existente 409.
    - _Requirements: R9.1, R9.2, R9.6, R9.8, R9.9, R15.3_

  - [x] 8.5 Crear `lib/dominio/invitaciones.ts` — `aceptarInvitacion`
    - Implementa `aceptarInvitacion(usuarioActual, token)`: busca por `hashToken`; inexistente/revocada → `InvitacionInvalidaError` (400, R10.4); si pendiente y `now>expira_en` marca `expirada` y rechaza (R10.5); si el correo del usuario ≠ correo de la invitación → `InvitacionOtroCorreoError` (403, R10.7); en caso válido, dentro de `$transaction` crea membresía activa con el rol y marca la invitación `aceptada`; si la membresía ya existe, no crea otra (idempotente, R10.3); ante fallo de la transacción → `AceptacionFallidaError` (500, R10.8).
    - Archivos: `lib/dominio/invitaciones.ts`.
    - Aceptación: test unitario cubre aceptación nueva, idempotente, expirada, otro-correo.
    - _Requirements: R10.2, R10.3, R10.4, R10.5, R10.7, R10.8_

  - [x] 8.6 Escribir PBT P6 de idempotencia de aceptación de invitación
    - Crea `__tests__/property/aceptacion-idempotente.test.ts` (numRuns: 100) con repositorio en memoria. Cabecera con `Property 6`.
    - **Property 6: Idempotencia de la aceptación de invitación**
    - **Validates: Requirements 10.2, 10.3**
    - Para toda invitación pendiente cuyo correo coincide con el invitado, aceptarla una o más veces produce como máximo una membresía activa para (usuario, org) y deja la invitación en `aceptada`.
    - Archivos: `__tests__/property/aceptacion-idempotente.test.ts`.
    - _PBT: Property 6 (`__tests__/property/aceptacion-idempotente.test.ts`)_
    - _Requirements: R10.2, R10.3_

  - [x] 8.7 Implementar `POST /api/invitaciones/aceptar`
    - Crea `app/api/invitaciones/aceptar/route.ts` con guard sesión, `withValidation(aceptarInvitacionSchema, ...)`, llama `aceptarInvitacion`; mapea `InvitacionInvalidaError → 400`, `InvitacionOtroCorreoError → 403`, `AceptacionFallidaError → 500`, éxito → `200 { organizacion, rol }`.
    - Archivos: `app/api/invitaciones/aceptar/route.ts`.
    - Aceptación: aceptar token válido del propio correo retorna 200; token expirado 400 `INVITACION_INVALIDA`.
    - _Requirements: R10.2, R10.3, R10.4, R10.5, R10.7, R10.8_

  - [x] 8.8 Implementar `DELETE /api/invitaciones/{id}` (revocar)
    - Crea `app/api/invitaciones/[id]/route.ts` con guard `(usuarios, administrar)`: si la invitación está `pendiente`, la marca `revocada` e invalida su token → `200 { id, estado:'revocada' }` (R9.7); si no está pendiente → `409 INVITACION_NO_PENDIENTE` (R9.10).
    - Archivos: `app/api/invitaciones/[id]/route.ts`.
    - Aceptación: revocar pendiente retorna 200; revocar ya aceptada/revocada retorna 409.
    - _Requirements: R9.7, R9.10_

## Fase 9 — Endpoints de roles y membresías

- [x] 9. Dominio de roles/membresías y sus endpoints
  - [x] 9.1 Crear `lib/schemas/roles.ts`
    - Implementa `rolSchema` (`nombre` trim 1–80 + `permisos` array de `{seccion: z.enum(SECCIONES), accion: z.enum(ACCIONES)}` con `max(SECCIONES.length*ACCIONES.length)`) y `asignarRolSchema` (`{ rol_id: uuid }`), como en `design.md`.
    - Archivos: `lib/schemas/roles.ts`.
    - Aceptación: `rolSchema` rechaza `permisos` con una sección fuera del enum.
    - _Requirements: R11.3, R11.5_

  - [x] 9.2 Crear `lib/dominio/roles.ts` — crear/editar/eliminar rol
    - Implementa `crearRol(orgId, input)` (nombre único en la org, permisos del catálogo; duplicado/inválido → `RolInvalidoError` 400, R11.5), `editarRol(rolId, input)` (rechaza editar `Rol_Propietario` con `RolPropietarioProtegidoError` 409, R11.6) y `eliminarRol(rolId)` (rechaza `Rol_Propietario` y rechaza si dejaría la org sin propietario con `PropietarioRequeridoError` 409, R11.6, R11.7).
    - Archivos: `lib/dominio/roles.ts`, `lib/dominio/errores-auth.ts` (extensión).
    - Aceptación: test unitario cubre crear válido, duplicado, editar/eliminar propietario protegido.
    - _Requirements: R11.3, R11.5, R11.6, R11.7_

  - [x] 9.3 Crear `lib/dominio/membresias.ts` — `asignarRol`
    - Implementa `asignarRol(membresiaId, rolId)`: valida que el rol y la membresía pertenezcan a la misma org (`RolFueraDeOrganizacionError` 400, R11.9); rechaza el cambio si dejaría la org sin propietario (`PropietarioRequeridoError` 409, R11.7); en éxito actualiza y devuelve `MiembroDTO` (R11.8).
    - Archivos: `lib/dominio/membresias.ts`.
    - Aceptación: test unitario cubre asignación válida, rol de otra org y degradación del último propietario.
    - _Requirements: R11.7, R11.8, R11.9_

  - [x] 9.4 Escribir PBT P11 de coherencia rol-organización
    - Crea `__tests__/property/coherencia-rol.test.ts` (numRuns: 100) con repositorio en memoria. Cabecera con `Property 11`.
    - **Property 11: Coherencia rol-organización en la asignación**
    - **Validates: Requirements 11.9**
    - Asignar un rol a una membresía tiene éxito sii ambos pertenecen a la misma org; en caso contrario se rechaza con `ROL_FUERA_DE_ORGANIZACION` sin alterar la membresía.
    - Archivos: `__tests__/property/coherencia-rol.test.ts`.
    - _PBT: Property 11 (`__tests__/property/coherencia-rol.test.ts`)_
    - _Requirements: R11.9_

  - [x] 9.5 Implementar `GET` y `POST /api/organizaciones/{id}/roles`
    - Crea `app/api/organizaciones/[id]/roles/route.ts`: `GET` con guard `(usuarios, ver)` devuelve `RolDTO[]` (marca `es_sistema`); `POST` con guard `(usuarios, administrar)`, `withValidation(rolSchema, ...)`, llama `crearRol`; `RolInvalidoError → 400 ROL_INVALIDO`, éxito → `201 RolDTO`. Sin permiso → `403 PERMISO_DENEGADO` (R11.4).
    - Archivos: `app/api/organizaciones/[id]/roles/route.ts`.
    - Aceptación: crear rol válido retorna 201; nombre duplicado 400; sin permiso 403.
    - _Requirements: R11.3, R11.4, R11.5, R15.4_

  - [x] 9.6 Implementar `PATCH` y `DELETE /api/roles/{id}`
    - Crea `app/api/roles/[id]/route.ts` con guard `(usuarios, administrar)`: `PATCH` con `rolSchema.partial()` llama `editarRol` (`ROL_INVALIDO` 400, `ROL_PROPIETARIO_PROTEGIDO` 409); `DELETE` llama `eliminarRol` (`ROL_PROPIETARIO_PROTEGIDO` 409, `PROPIETARIO_REQUERIDO` 409), éxito → `200 { id }`.
    - Archivos: `app/api/roles/[id]/route.ts`.
    - Aceptación: editar/eliminar Rol_Propietario retorna 409; editar un rol normal 200.
    - _Requirements: R11.3, R11.5, R11.6, R11.7, R15.4_

  - [x] 9.7 Implementar `PATCH /api/membresias/{id}`
    - Crea `app/api/membresias/[id]/route.ts` con guard `(usuarios, administrar)`, `withValidation(asignarRolSchema, ...)`, llama `asignarRol`; `RolFueraDeOrganizacionError → 400`, `PropietarioRequeridoError → 409`, éxito → `200 MiembroDTO`.
    - Archivos: `app/api/membresias/[id]/route.ts`.
    - Aceptación: asignar rol de la misma org retorna 200; rol de otra org 400.
    - _Requirements: R11.7, R11.8, R11.9, R15.4_

## Fase 10 — Endpoints de horarios

- [x] 10. Dominio de horarios y sus endpoints
  - [x] 10.1 Crear `lib/schemas/horarios.ts`
    - Implementa `horarioSchema` con `membresia_id` uuid, `dia` int 0–6, `tipo` enum, `hora_inicio`/`hora_fin` regex `HH:MM` nullable, y el `superRefine` que para `tipo='normal'` exige ambas horas (R14.9) y `hora_fin > hora_inicio` (R14.5), como en `design.md`.
    - Archivos: `lib/schemas/horarios.ts`.
    - Aceptación: `horarioSchema` rechaza `dia=7`, `tipo='x'`, y `normal` con `hora_fin<=hora_inicio`.
    - _Requirements: R14.2, R14.5, R14.8, R14.9_

  - [x] 10.2 Crear `lib/dominio/horarios.ts` — crear/editar/listar
    - Implementa `crearHorario(orgId, input)` (valida que la membresía pertenezca a la org activa; si no → `MembresiaFueraDeOrganizacionError` 400, R14.3; persiste y devuelve `HorarioMiembroDTO`, R14.2), `editarHorario(horarioId, input)` (R14.10) y `listarHorarios(orgId)` (R14.6). Define el error en `lib/dominio/errores-auth.ts`.
    - Archivos: `lib/dominio/horarios.ts`, `lib/dominio/errores-auth.ts` (extensión).
    - Aceptación: test unitario cubre creación válida y membresía de otra org.
    - _Requirements: R14.2, R14.3, R14.6, R14.10_

  - [x] 10.3 Implementar `GET` y `POST /api/organizaciones/{id}/horarios`
    - Crea `app/api/organizaciones/[id]/horarios/route.ts`: `GET` con guard `(horarios, ver)` devuelve `HorarioMiembroDTO[]` de la org; `POST` con guard `(horarios, crear)`, `withValidation(horarioSchema, ...)`, llama `crearHorario`; `MembresiaFueraDeOrganizacionError → 400`, validación → `422`, éxito → `201 HorarioMiembroDTO`.
    - Archivos: `app/api/organizaciones/[id]/horarios/route.ts`.
    - Aceptación: crear horario válido retorna 201; `normal` sin horas retorna 422; membresía ajena 400.
    - _Requirements: R14.1, R14.2, R14.3, R14.4, R14.5, R14.8, R14.9, R15.5_

  - [x] 10.4 Implementar `PATCH` y `DELETE /api/horarios/{id}`
    - Crea `app/api/horarios/[id]/route.ts` con guard `(horarios, editar)`: `PATCH` con `horarioSchema.partial()` llama `editarHorario` (validación → 422, éxito 200, R14.10); `DELETE` elimina el horario de la org activa → `200 { id }`.
    - Archivos: `app/api/horarios/[id]/route.ts`.
    - Aceptación: editar con datos válidos retorna 200; sin permiso `(horarios, editar)` 403.
    - _Requirements: R14.1, R14.10_

## Fase 11 — Endpoint de permisos

- [x] 11. Endpoint de permisos del usuario actual
  - [x] 11.1 Implementar `GET /api/permisos`
    - Crea `app/api/permisos/route.ts` con guard sesión+org: devuelve `{ permisos: Permiso[] }` del Usuario_Actual en la Organizacion_Activa; sin sesión → `401 NO_AUTENTICADO`; sin org → `409 SIN_ORGANIZACION_ACTIVA`.
    - Archivos: `app/api/permisos/route.ts`.
    - Aceptación: con org activa retorna el array de permisos del rol; sin org retorna 409.
    - _Requirements: R11.10, R12.5, R15.6_

  - [x] 11.2 Escribir PBT P15 de condiciones de error de entrada y normalización
    - Crea `__tests__/property/validacion-entrada.test.ts` (numRuns: 100) que ejercita `registroSchema`, `invitarSchema`, `rolSchema` y `horarioSchema` con `arbHorario` y correos arbitrarios. Cabecera con `Property 15`.
    - **Property 15: Condiciones de error de entrada y normalización**
    - **Validates: Requirements 2.2, 2.3, 2.9, 14.5, 14.8, 14.9, 15.7**
    - Una entrada se acepta sii cumple el esquema; si no, el resultado es un fallo de validación con `{ campo, mensaje }` no vacío y sin persistencia. Todo correo se normaliza a minúsculas; un `Horario_Miembro` `normal` se acepta sii ambas horas `HH:MM` presentes y `hora_fin > hora_inicio`.
    - Archivos: `__tests__/property/validacion-entrada.test.ts`.
    - _PBT: Property 15 (`__tests__/property/validacion-entrada.test.ts`)_
    - _Requirements: R2.2, R2.3, R2.9, R14.5, R14.8, R14.9, R15.7_

  - [x] 11.3 Checkpoint — Endpoints de organizaciones/invitaciones/roles/horarios/permisos y P6/P9/P11/P14/P15 en verde
    - Ejecuta `pnpm test:run __tests__/property` y confirma que P1–P15 pasan (las que dependen de BD con la instancia activa). Verifica con `curl` que cada endpoint nuevo responde `application/json; charset=utf-8`. Ante dudas, consulta al usuario.

## Fase 12 — Actualización multi-tenant de `inventario-ventas-core`

- [x] 12. Hacer multi-inquilino los endpoints y el dominio existentes
  - [x] 12.1 Filtrar y escribir por tenant en productos
    - Actualiza `app/api/productos/route.ts` y `app/api/productos/[id]/route.ts`: antepón `const r = await resolverContexto({ seccion: 'inventario', accion })` (`ver`/`crear`/`editar`/`eliminar` según método); añade `organizacion_id` activo a los `where` de lectura y fija `organizacion_id` en escrituras ignorando el del cliente (R13.6, R13.7); en accesos por `{id}` cuyo `organizacion_id` ≠ activo responde `404 RECURSO_NO_ENCONTRADO` (R13.3).
    - Archivos: `app/api/productos/route.ts`, `app/api/productos/[id]/route.ts`, `lib/dominio/inventario.ts` (firmas que aceptan `organizacion_id`).
    - Aceptación: un producto de otra org retorna 404; el listado solo trae productos de la org activa.
    - _Requirements: R13.2, R13.3, R13.6, R13.7, R13.8_

  - [x] 12.2 Filtrar y escribir por tenant en sub-recursos de producto
    - Actualiza `app/api/productos/[id]/ajuste-stock/route.ts`, `app/api/productos/[id]/movimientos/route.ts`, `app/api/productos/[id]/variantes/route.ts`, `app/api/productos/[id]/imprimir-etiqueta/route.ts` y `app/api/productos/por-codigo/[codigo]/route.ts` para resolver contexto `(inventario, ...)`, verificar que el producto pertenezca a la org activa (si no → `404 RECURSO_NO_ENCONTRADO`) y escribir movimientos con el `organizacion_id` activo.
    - Archivos: los cinco `route.ts` anteriores.
    - Aceptación: ajustar stock de un producto de otra org retorna 404; los movimientos creados llevan el tenant correcto.
    - _Requirements: R13.2, R13.3, R13.6, R13.7_

  - [x] 12.3 Filtrar y escribir por tenant en categorías, tallas y unidades
    - Actualiza `app/api/categorias/route.ts`, `app/api/categorias/[id]/route.ts`, `app/api/tallas/route.ts`, `app/api/unidades/route.ts` con guard `(inventario, ...)`, filtrando y escribiendo por `organizacion_id` activo, y unicidad de `nombre` por tenant.
    - Archivos: los cuatro `route.ts` anteriores.
    - Aceptación: las categorías listadas son solo las de la org activa; crear una con nombre repetido en otra org es válido.
    - _Requirements: R13.2, R13.6, R13.7_

  - [x] 12.4 Filtrar y escribir por tenant en ventas y resumen de inventario
    - Actualiza `app/api/ventas/route.ts`, `app/api/ventas/[id]/route.ts` y `app/api/inventario/resumen/route.ts` con guard `(ventas, ...)` / `(inventario, ver)`, filtrando por `organizacion_id` activo; venta por id de otra org → `404 RECURSO_NO_ENCONTRADO`; las escrituras de `Venta`, `VentaItem` y `MovimientoStock` fijan el tenant activo.
    - Archivos: `app/api/ventas/route.ts`, `app/api/ventas/[id]/route.ts`, `app/api/inventario/resumen/route.ts`.
    - Aceptación: el resumen y el listado de ventas reflejan solo la org activa.
    - _Requirements: R13.2, R13.3, R13.6, R13.7_

  - [x] 12.5 Aislar el folio y la configuración por tenant
    - Actualiza `lib/dominio/folio.ts` para usar la clave `folio_seq:<org>:AAAAMMDD` (contador por organización) y `app/api/configuracion/route.ts` + `lib/dominio/configuracion.ts` para leer/escribir la `Configuracion` por `organizacion_id` activo (PK compuesta). El guard de configuración usa `(configuracion, ...)`.
    - Archivos: `lib/dominio/folio.ts`, `lib/dominio/configuracion.ts`, `app/api/configuracion/route.ts`.
    - Aceptación: dos orgs generan folios independientes el mismo día; cada org tiene su propia configuración.
    - _Requirements: R13.2, R13.6, R13.7_

  - [x] 12.6 Escribir PBT P12 del invariante de aislamiento multi-inquilino
    - Crea `__tests__/property/aislamiento-tenant.test.ts` (numRuns: 50, BD de prueba) usando `arbMembresia`. Cabecera con `Property 12`.
    - **Property 12: Invariante de aislamiento multi-inquilino**
    - **Validates: Requirements 13.2, 13.3, 13.6, 13.7**
    - Para todo Usuario_Actual con org activa, toda consulta de negocio devuelve solo registros de esa org y nunca de otra; acceder por id a un recurso de otra org responde `RECURSO_NO_ENCONTRADO`; y todo `organizacion_id` del cliente es ignorado a favor del derivado de la sesión.
    - Archivos: `__tests__/property/aislamiento-tenant.test.ts`.
    - _PBT: Property 12 (`__tests__/property/aislamiento-tenant.test.ts`)_
    - _Requirements: R13.2, R13.3, R13.6, R13.7_

## Fase 13 — Frontend: hooks de cliente, gates y refactor del shell

- [x] 13. Estado de identidad en cliente e integración con `app/page.tsx`
  - [x] 13.1 Crear `hooks/use-sesion.ts` y `SesionProvider`
    - Implementa el Context `SesionState` (`usuario`, `cargando`, `refetch`, `logout`) y `SesionProvider` que hace `GET /api/auth/sesion` al montar, expone `refetch()` (usado tras login/registro) y `logout()` (`POST /api/auth/logout` + limpiar estado), como en `design.md`.
    - Archivos: `hooks/use-sesion.ts`.
    - Aceptación: el provider monta y `useSesion()` retorna `cargando=true` antes de resolver.
    - _Requirements: R4.6, R5.6, R5.7, R17.1_

  - [x] 13.2 Crear `hooks/use-organizacion-activa.ts`
    - Implementa `useOrganizacionActiva()` (`organizacion`, `organizaciones`, `cargando`, `error`, `seleccionar(id)` → `POST /api/auth/organizacion-activa`, `recargar()` → `GET /api/organizaciones`). La org activa vive en la sesión del servidor.
    - Archivos: `hooks/use-organizacion-activa.ts`.
    - Aceptación: `recargar()` puebla `organizaciones`; `seleccionar` con membresía inactiva expone `error`.
    - _Requirements: R7.1, R7.2, R7.3, R7.6, R7.7_

  - [x] 13.3 Crear `hooks/use-permisos.ts`
    - Implementa `usePermisos()` que hace `GET /api/permisos` al cambiar la org activa y expone `puede(seccion, accion)` envolviendo el `tienePermiso()` puro de `@/lib/auth/permisos` (única fuente de verdad).
    - Archivos: `hooks/use-permisos.ts`.
    - Aceptación: `puede('usuarios','ver')` refleja el conjunto devuelto por la API.
    - _Requirements: R12.1, R12.3, R12.5_

  - [x] 13.4 Crear `components/auth/auth-gate.tsx`
    - Usa `useSesion()`: mientras carga muestra `Skeleton`; sin sesión válida monta `AuthScreens`; con sesión renderiza `children` (R5.6, R5.7).
    - Archivos: `components/auth/auth-gate.tsx`.
    - Aceptación: sin sesión renderiza las pantallas de auth; con sesión, los children.
    - _Requirements: R5.6, R5.7_

  - [x] 13.5 Crear `components/organizaciones/organizacion-gate.tsx`
    - Usa `useOrganizacionActiva()`: sin org activa monta `SeleccionOrganizacion`; con org activa renderiza `children` (R7.5).
    - Archivos: `components/organizaciones/organizacion-gate.tsx`.
    - Aceptación: sin org activa muestra la selección; con org, los children.
    - _Requirements: R7.5_

  - [x] 13.6 Refactor de `app/page.tsx` con gates y sección inicial por permiso
    - Extrae el shell actual a `AppShell` y envuélvelo con `SesionProvider > AuthGate > OrganizacionGate`. Conserva `activeSection`/`renderSection()`, añade `case "Usuarios"` y calcula la sección inicial como la primera con permiso `(seccion, ver)` (R12.6); si no hay ninguna, muestra el mensaje "no hay secciones disponibles" (R12.7); impide renderizar contenido de secciones sin `(seccion, ver)` (R12.2).
    - Archivos: `app/page.tsx`, `components/app-shell.tsx`.
    - Aceptación: con permisos limitados, `activeSection` arranca en la primera sección permitida; sin permisos, mensaje vacío.
    - _Requirements: R12.2, R12.6, R12.7, R18.3_

  - [x] 13.7 Pruebas ejemplares de AuthGate y OrganizacionGate
    - Crea `__tests__/unit/gates.test.tsx` (Testing Library + MSW) que verifica: sin sesión se muestra Login; con sesión y sin org se muestra selección; con ambas, el shell.
    - Archivos: `__tests__/unit/gates.test.tsx`.
    - Aceptación: los tres escenarios pasan.
    - _Requirements: R5.6, R5.7, R7.5_

## Fase 14 — Frontend: pantallas de autenticación

- [x] 14. Pantallas previas al shell (login, registro, verificación, invitación)
  - [x] 14.1 Crear `components/auth/auth-screens.tsx`
    - Conmutador de pantalla (`login | registro | verificacion | aceptar-invitacion`) por estado local sin cambiar URL; detecta `?token=` y `?accion=` para abrir verificación o aceptación de invitación (R10.6).
    - Archivos: `components/auth/auth-screens.tsx`.
    - Aceptación: con `?accion=verificar&token=...` monta la pantalla de verificación.
    - _Requirements: R5.1, R10.6_

  - [x] 14.2 Crear `components/auth/login-screen.tsx`
    - Formulario de login con `react-hook-form` + `zodResolver(loginSchema)`, solo `components/ui/*` (Card, Form, Input, Label, Button), marca negra vía `bg-primary`/`text-primary-foreground` (sin hex), textos en español, errores inline que conservan valores (R5.8). Al éxito llama `useSesion().refetch()` y `toast`.
    - Archivos: `components/auth/login-screen.tsx`.
    - Aceptación: credenciales inválidas muestran error inline en español sin perder lo escrito.
    - _Requirements: R4.1, R5.1, R5.2, R5.4, R5.8, R17.1_

  - [x] 14.3 Crear `components/auth/registro-screen.tsx`
    - Formulario de registro (correo, nombre, contraseña) con `react-hook-form` + `zodResolver(registroSchema)`, shadcn/ui, español, errores inline (R5.8). Al éxito muestra aviso de "verifica tu correo" y opción de reenvío.
    - Archivos: `components/auth/registro-screen.tsx`.
    - Aceptación: registro válido invoca `POST /api/auth/registro` y muestra el aviso de verificación.
    - _Requirements: R2.1, R5.4, R5.8, R17.1_

  - [x] 14.4 Crear `components/auth/verificacion-screen.tsx`
    - Procesa `?token=`, hace `POST /api/auth/verificar-correo`, muestra estado (verificando / éxito / token inválido) con `Card`+`Alert`+`Button`, y ofrece reenviar (`POST /api/auth/reenviar-verificacion`) respetando el toast de límite (R3.8–R3.10).
    - Archivos: `components/auth/verificacion-screen.tsx`.
    - Aceptación: token válido muestra éxito; inválido muestra alerta y botón de reenvío.
    - _Requirements: R3.4, R3.6, R3.8, R3.9, R3.10, R17.1_

  - [x] 14.5 Crear `components/auth/aceptar-invitacion-screen.tsx`
    - Muestra el nombre de la Organizacion y el Rol ofrecido antes de confirmar (R10.1); si el invitado no tiene cuenta, redirige a Registro conservando el token (R10.6); al confirmar autenticado llama `POST /api/invitaciones/aceptar` y enruta a la selección de org.
    - Archivos: `components/auth/aceptar-invitacion-screen.tsx`.
    - Aceptación: con token válido muestra org+rol y permite aceptar; sin cuenta dirige a registro con el token.
    - _Requirements: R10.1, R10.6, R17.2_

  - [x] 14.6 Pruebas ejemplares de tema y español en Login/Registro
    - Crea `__tests__/unit/login-registro.test.tsx` que verifica textos en español, ausencia de hex en los componentes (solo tokens de tema) y re-render correcto al alternar claro/oscuro.
    - Archivos: `__tests__/unit/login-registro.test.tsx`.
    - Aceptación: los asserts pasan.
    - _Requirements: R5.1, R5.2, R5.3, R5.4_

## Fase 15 — Frontend: selección y creación de organización

- [x] 15. Pantalla de selección/creación de organización
  - [x] 15.1 Crear `components/organizaciones/seleccion-organizacion.tsx`
    - Lista las organizaciones con membresía activa (orden A–Z) con su Rol y botón Seleccionar (`Card`/`Button`/`Badge`); estado de carga con `Skeleton`; estado de error con `Alert` + botón Reintentar (R7.6); si no hay ninguna, muestra solo "Crear organización" + "Invitaciones pendientes" (R7.4). Usa `useOrganizacionActiva()`.
    - Archivos: `components/organizaciones/seleccion-organizacion.tsx`.
    - Aceptación: con membresías muestra la lista A–Z; sin ninguna, solo crear+invitaciones; en error, reintento.
    - _Requirements: R7.1, R7.4, R7.6_

  - [x] 15.2 Crear `components/organizaciones/crear-organizacion-dialog.tsx`
    - `Dialog` + `react-hook-form` + `zodResolver(crearOrganizacionSchema)` con el campo `nombre`; al éxito (`POST /api/organizaciones`) hace `recargar()`, `seleccionar(nuevaOrg.id)` y `toast.success` (R17.2).
    - Archivos: `components/organizaciones/crear-organizacion-dialog.tsx`.
    - Aceptación: crear una org la deja seleccionada como activa.
    - _Requirements: R8.1, R8.6, R17.2_

## Fase 16 — Frontend: sección Usuarios

- [x] 16. Sección Usuarios (miembros, roles, invitaciones)
  - [x] 16.1 Crear `components/sections/usuarios-section.tsx`
    - Contenedor con `Tabs` Miembros / Roles / Invitaciones; usa `usePermisos()` para ocultar acciones sin permiso (R12.3). Montar en `renderSection()` (`case "Usuarios"`) y en el `Sidebar` (visible solo con `(usuarios, ver)`).
    - Archivos: `components/sections/usuarios-section.tsx`.
    - Aceptación: la sección aparece solo con `(usuarios, ver)` y muestra las tres pestañas.
    - _Requirements: R12.3, R18.5_

  - [x] 16.2 Crear `components/usuarios/miembros-table.tsx` y `asignar-rol-dialog.tsx`
    - `miembros-table.tsx`: `Table` con Miembro, Rol, Estado y acción "Asignar Rol" (oculta sin `(usuarios, administrar)`); consume `GET /api/organizaciones/{id}/miembros`. `asignar-rol-dialog.tsx`: `Dialog` + `Form` + `Select` que hace `PATCH /api/membresias/{id}` (`aria-label="Asignar rol"`, toast en éxito/error, R17.2, R17.5).
    - Archivos: `components/usuarios/miembros-table.tsx`, `components/usuarios/asignar-rol-dialog.tsx`.
    - Aceptación: cambiar el rol de un miembro actualiza la tabla; rol de otra org muestra el toast de error.
    - _Requirements: R11.8, R11.9, R17.2, R17.4, R17.5_

  - [x] 16.3 Crear `components/usuarios/roles-table.tsx` y `rol-form-dialog.tsx`
    - `roles-table.tsx`: `Table` de roles que marca `Rol_Propietario` como protegido y oculta crear/editar/eliminar sin `(usuarios, administrar)`; consume `GET /api/organizaciones/{id}/roles`. `rol-form-dialog.tsx`: `Dialog` + `Form` con `nombre` y matriz de `Checkbox` `(seccion × accion)`; `POST`/`PATCH` de roles con toasts y manejo de `ROL_INVALIDO`/`ROL_PROPIETARIO_PROTEGIDO`.
    - Archivos: `components/usuarios/roles-table.tsx`, `components/usuarios/rol-form-dialog.tsx`.
    - Aceptación: crear un rol con permisos seleccionados lo agrega; el Rol_Propietario no es editable.
    - _Requirements: R11.3, R11.5, R11.6, R17.2, R17.4_

  - [x] 16.4 Crear `components/usuarios/invitaciones-table.tsx` y `invitar-miembro-dialog.tsx`
    - `invitaciones-table.tsx`: `Table` con `Badge` de `Estado_Invitacion` (contraste AA, R17.6) y acción revocar (`aria-label="Revocar invitación"`, `DELETE /api/invitaciones/{id}`, R9.7/R9.10). `invitar-miembro-dialog.tsx`: visible solo con `(usuarios, administrar)` (R9.1); `Dialog` + `Form` + `Select` de rol; `POST /api/organizaciones/{id}/invitaciones`; toasts de éxito/regenerada/`MIEMBRO_EXISTENTE`.
    - Archivos: `components/usuarios/invitaciones-table.tsx`, `components/usuarios/invitar-miembro-dialog.tsx`.
    - Aceptación: invitar un correo muestra la fila pendiente; revocar la pasa a "revocada".
    - _Requirements: R9.1, R9.2, R9.7, R9.10, R17.2, R17.5, R17.6_

## Fase 17 — Frontend: Empleados y Horarios reales

- [x] 17. Conectar Empleados y Horarios al backend
  - [x] 17.1 Conectar `components/sections/empleados-section.tsx` a miembros reales
    - Elimina el array mock; consume `GET /api/organizaciones/{id}/miembros` mostrando cada Miembro con su Rol y estado (R14.7). Estados de carga/error con shadcn/ui.
    - Archivos: `components/sections/empleados-section.tsx`.
    - Aceptación: la sección muestra los miembros reales de la org activa.
    - _Requirements: R14.7_

  - [x] 17.2 Conectar `components/sections/horarios-section.tsx` a horarios reales
    - Elimina el mock; consume `GET /api/organizaciones/{id}/horarios`; conserva la leyenda de tipos (`normal`, `vacaciones`, `incapacidad`, `descanso`) (R14.6, R14.4) y muestra una acción "Asignar horario" (oculta sin `(horarios, crear)`).
    - Archivos: `components/sections/horarios-section.tsx`.
    - Aceptación: la sección muestra los horarios persistidos de la org activa.
    - _Requirements: R14.4, R14.6_

  - [x] 17.3 Crear `components/horarios/asignar-horario-dialog.tsx`
    - `Dialog` + `react-hook-form` + `zodResolver(horarioSchema)` con `membresia_id` (Select), `dia` (Select 0–6), `tipo` (Select), `hora_inicio`/`hora_fin` (`Input type=time`); `POST`/`PATCH` de horarios con validación inline (R14.5/R14.9), `aria-label="Asignar horario"` y toast (R17.2, R17.5).
    - Archivos: `components/horarios/asignar-horario-dialog.tsx`.
    - Aceptación: asignar un horario `normal` con horas válidas lo agrega; `hora_fin<=hora_inicio` muestra error inline.
    - _Requirements: R14.1, R14.2, R14.5, R14.9, R14.10, R17.2, R17.5_

## Fase 18 — Frontend: Sidebar, logout e identidad real

- [x] 18. Sidebar filtrado por permisos y datos reales del usuario
  - [x] 18.1 Filtrar `components/sidebar.tsx` por permisos y añadir Usuarios
    - Añade la entrada `Usuarios` a `menuItems` (icono `Users`/`ShieldCheck`); filtra `menuItems` por `usePermisos().puede(seccion, "ver")` usando `LABEL_A_SECCION` (R12.1); usa solo tokens de tema (sin hex).
    - Archivos: `components/sidebar.tsx`.
    - Aceptación: un usuario sin `(usuarios, ver)` no ve la entrada Usuarios; solo aparecen las secciones permitidas.
    - _Requirements: R12.1, R18.2, R18.5_

  - [x] 18.2 Cablear logout y nombre real del usuario
    - En `components/sidebar.tsx` (y/o `components/header.tsx`) conecta el botón `LogOut` a `useSesion().logout()` (toast + vuelve a Login) y muestra el nombre real del `Usuario_Actual` y su Rol en lugar del "Admin" hardcoded.
    - Archivos: `components/sidebar.tsx`, `components/header.tsx`.
    - Aceptación: cerrar sesión vuelve a Login; el nombre mostrado es el del usuario autenticado.
    - _Requirements: R4.5, R17.1_

## Fase 19 — Pruebas complementarias (ejemplares, integración, smoke) y cierre

> Las 15 pruebas por propiedad (P1–P15) se escribieron en sus fases respectivas (tareas 3.3, 3.5, 3.7, 3.9, 3.10, 3.12, 3.14, 4.2, 6.5, 7.3, 8.3, 8.6, 9.4, 11.2, 12.6) y NO son opcionales. Esta fase agrupa las pruebas no-PBT de la tabla "Pruebas no-PBT" del `design.md`.

- [x] 19. Pruebas no-PBT y verificación final
  - [x] 19.1 Pruebas de edge de tokens inválidos/expirados/revocados
    - Crea `__tests__/unit/tokens-edge.test.ts` con generadores de tokens inexistentes, expirados y revocados para verificación e invitación; verifica los códigos `TOKEN_INVALIDO` (R3.6) e `INVITACION_INVALIDA` (R10.4, R10.5) y el caso `INVITACION_OTRO_CORREO` (R10.7).
    - Archivos: `__tests__/unit/tokens-edge.test.ts`.
    - Aceptación: todos los casos pasan.
    - _Requirements: R3.6, R10.4, R10.5, R10.7_

  - [x] 19.2 Integración de envío de correo y rollback de aceptación
    - Crea `__tests__/integration/correo-y-rollback.test.ts` que con `nodemailer` mockeado verifica: éxito SMTP, fallo/timeout (`ENVIO_CORREO_FALLIDO`), fallback consola y `APP_URL_NO_CONFIGURADA` (R2.7, R2.8, R6.1, R6.3, R6.4, R6.6); y que un fallo en la transacción de aceptación de invitación no crea membresía ni cambia el estado (R10.8).
    - Archivos: `__tests__/integration/correo-y-rollback.test.ts`.
    - Aceptación: los casos pasan con BD activa.
    - _Requirements: R2.7, R2.8, R6.3, R6.4, R6.6, R10.8_

  - [x] 19.3 Smoke de `Content-Type` de los endpoints nuevos
    - Crea `__tests__/integration/content-type-auth.test.ts` que invoca cada handler nuevo (`/api/auth/*`, `/api/organizaciones*`, `/api/invitaciones/*`, `/api/roles/*`, `/api/membresias/*`, `/api/horarios/*`, `/api/permisos`) con `new Request(...)` y verifica `content-type === 'application/json; charset=utf-8'`.
    - Archivos: `__tests__/integration/content-type-auth.test.ts`.
    - Aceptación: todos los endpoints responden el `Content-Type` esperado.
    - _Requirements: R15.1, R15.2, R15.3, R15.4, R15.5, R15.6, R15.8_

  - [x] 19.4 Smoke estático de coherencia de diseño y accesibilidad
    - Crea `__tests__/unit/diseno-coherencia.test.tsx` que verifica: solo se usan componentes de `components/ui/` (sin nuevas libs), ausencia de valores hex en los componentes nuevos, presencia de `case "Usuarios"` en `renderSection`, filtrado del Sidebar por permiso, `aria-label` en iconos-botón (invitar, revocar, asignar rol, asignar horario) y contraste AA de los badges (revisión asistida) (R5.5, R17.5, R17.6, R18.1–R18.5).
    - Archivos: `__tests__/unit/diseno-coherencia.test.tsx`.
    - Aceptación: los asserts estáticos pasan.
    - _Requirements: R5.5, R17.5, R17.6, R18.1, R18.2, R18.3, R18.4, R18.5_

  - [x] 19.5 Pruebas ejemplares de Empleados/Horarios reales y selección de org
    - Crea `__tests__/unit/empleados-horarios-org.test.tsx` (MSW) que verifica que Empleados y Horarios renderizan datos reales (no mock) (R14.6, R14.7) y que la selección de organización persiste en sesión y que sin org se muestra el gate de selección (R7.3, R7.5).
    - Archivos: `__tests__/unit/empleados-horarios-org.test.tsx`.
    - Aceptación: los escenarios pasan.
    - _Requirements: R7.3, R7.5, R14.6, R14.7_

  - [x] 19.6 Checkpoint final — Asegurar que toda la suite pasa
    - Ejecuta `pnpm test:run` y confirma que unit + integration + property (P1–P15) pasan. Si surgen regresiones o dudas, diagnostícalas con el shrinking de `fast-check` y corrige el código fuente (no el test); consulta al usuario antes de cerrar el plan.
    - Archivos: ninguno (verificación).
    - Aceptación: la suite completa reporta verde, con las 15 propiedades en ≥100 runs (≥50 para las que dependen de BD).
    - _Requirements: R15.7, R16.1, R16.2, R16.3_

## Notes

- Las sub-tareas marcadas con `*` son **opcionales** (pruebas ejemplares, de integración y smoke complementarias) y pueden saltarse para un MVP más rápido. Las **15 pruebas por propiedad (P1–P15) no están marcadas** y son obligatorias: el `design.md` exige cubrir todas las propiedades de corrección.
- Cada tarea hoja referencia los criterios de aceptación de `requirements.md` que la justifican y, cuando aplica, la propiedad PBT del `design.md` (con su número y la cláusula de requisitos que valida).
- TDD por propiedad: P2, P3, P4, P7, P8, P10, P13 se escriben junto a (o antes de) su lógica pura en la Fase 3; P5, P6, P9, P11, P14, P15 acompañan a su dominio; P1 y P12 se ejercen tras tener serializadores/sesión y el aislamiento multi-tenant respectivamente.
- Migración aditiva en **tres** pasos (crear tablas → `organizacion_id` nullable + backfill → NOT NULL): preserva los datos de `inventario-ventas-core` (R1.10, R13.4). Nada en este plan ejecuta operaciones destructivas sobre tablas existentes.
- Ninguna tarea modifica primitivos de `components/ui/*`. Las nuevas vistas viven en `components/auth/`, `components/organizaciones/`, `components/usuarios/`, `components/horarios/` y `components/sections/usuarios-section.tsx`.
- El guard `resolverContexto` centraliza autenticación, organización activa y permisos; la Fase 12 lo aplica a los endpoints existentes para cumplir el aislamiento multi-inquilino (R13).
- Los checkpoints (3.15, 6.11, 11.3, 19.6) son puntos de detención para verificar tests y consultar al usuario si surgen dudas.
- `bcryptjs` usa `BCRYPT_COST=4` en pruebas para acelerar; `nodemailer` se mockea; la BD de integración usa la misma imagen Docker MySQL 8 del módulo previo.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "3.1"] },
    { "id": 1, "tasks": ["2.1", "3.2", "3.8", "3.11", "3.13"] },
    { "id": 2, "tasks": ["2.2", "3.4", "3.9", "3.10", "3.12", "3.14"] },
    { "id": 3, "tasks": ["2.3", "3.3", "3.5", "3.6"] },
    { "id": 4, "tasks": ["2.4", "3.7", "4.1"] },
    { "id": 5, "tasks": ["2.5", "4.2", "4.3", "4.4"] },
    { "id": 6, "tasks": ["2.6", "4.5"] },
    { "id": 7, "tasks": ["4.6", "5.1", "5.2", "5.3", "6.1"] },
    { "id": 8, "tasks": ["5.4"] },
    { "id": 9, "tasks": ["5.5", "6.2"] },
    { "id": 10, "tasks": ["6.3", "6.4"] },
    { "id": 11, "tasks": ["6.5", "6.6", "6.7"] },
    { "id": 12, "tasks": ["6.8", "6.9", "7.1", "7.2"] },
    { "id": 13, "tasks": ["6.10", "7.3", "7.4", "7.5"] },
    { "id": 14, "tasks": ["7.6", "7.7", "8.1", "8.2"] },
    { "id": 15, "tasks": ["8.3", "8.4", "8.5"] },
    { "id": 16, "tasks": ["8.6", "8.7", "8.8", "9.1", "9.2"] },
    { "id": 17, "tasks": ["9.3", "9.5", "9.6"] },
    { "id": 18, "tasks": ["9.4", "9.7", "10.1", "10.2"] },
    { "id": 19, "tasks": ["10.3", "10.4", "11.1"] },
    { "id": 20, "tasks": ["11.2", "12.1", "12.3", "12.4"] },
    { "id": 21, "tasks": ["12.2", "12.5"] },
    { "id": 22, "tasks": ["12.6"] },
    { "id": 23, "tasks": ["13.1", "13.2", "13.3"] },
    { "id": 24, "tasks": ["13.4", "13.5"] },
    { "id": 25, "tasks": ["13.6", "13.7"] },
    { "id": 26, "tasks": ["14.1", "14.2", "14.3", "14.4", "14.5"] },
    { "id": 27, "tasks": ["14.6", "15.1", "15.2"] },
    { "id": 28, "tasks": ["16.1", "16.2", "16.3", "16.4"] },
    { "id": 29, "tasks": ["17.1", "17.2", "17.3"] },
    { "id": 30, "tasks": ["18.1"] },
    { "id": 31, "tasks": ["18.2"] },
    { "id": 32, "tasks": ["19.1", "19.2", "19.3", "19.4", "19.5"] }
  ]
}
```
