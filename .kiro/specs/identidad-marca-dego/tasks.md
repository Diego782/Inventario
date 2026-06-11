# Implementation Plan

## Overview

Plan de implementación atómico para `identidad-marca-dego`. Cada tarea hoja es **autocontenida**, **pequeña** y **completable por un subagente sin contexto adicional**, con criterio de aceptación verificable. El orden respeta las dependencias técnicas de `design.md`: primero los esquemas/utilidades puras (Zod color, `aplicarColorTema`, migración), luego la capa de datos (`leerConfiguracion` ampliado), los endpoints API (GET/PUT con color y 401/403/422), los providers cliente (`IdentidadVisualProvider`, refactor de `ThemeProvider` a `next-themes`), el rediseño del `LoginScreen` (`Layout_Split`), el rebrand visible (constante `MARCA` y sustituciones) y, por último, el catálogo y las tareas de verificación manual para la infraestructura diferida.

Stack: **Next.js 16 (App Router) + React 19 + TypeScript 5.7 + Prisma + MySQL 8 + Zod + react-hook-form + shadcn/ui + Tailwind v4 + next-themes + sonner + fast-check + vitest**. Gestor: **pnpm**.

Convenciones de nombres en este plan:

- `R<num>.<sub>` referencia un criterio de aceptación de `requirements.md`.
- `P<n>` referencia una propiedad canónica de `design.md` § Correctness Properties.
- Rutas en TypeScript usan los aliases `@/lib`, `@/hooks`, `@/components`, `@/components/ui`.
- Las sub-tareas marcadas con `*` son **opcionales** (pruebas ejemplares / integración / smoke / verificación manual complementaria). Las **12 pruebas por propiedad (P1–P12) NO se marcan opcionales**: el diseño exige cubrirlas.
- Comando de pruebas: `pnpm test` (alias de `vitest run`); para un archivo concreto, `pnpm test <ruta>`.
- Todas las PBT usan `fc.assert(..., { numRuns: 100 })` como mínimo y se etiquetan con `// Feature: identidad-marca-dego, Property N: <texto>`.

## Tasks

## Fase 1 — Esquemas y utilidades puras de color

- [x] 1. Esquema Zod del Color_Tema y utilidades puras de tema
  - [x] 1.1 Extender `lib/schemas/configuracion.ts` con el Color_Tema
    - Añade `colorTemaSchema` (`color_hue` 0–360, `color_saturation` 0–1, `color_lightness` 0–1) y amplía `actualizarConfiguracionSchema` con las tres claves opcionales `color_hue`/`color_saturation`/`color_lightness` (mismos rangos). Exporta los tipos `ColorTema` y `ActualizarConfiguracionInput`.
    - Amplía `ConfiguracionMap` con `color_hue`/`color_saturation`/`color_lightness` y añade la constante `COLOR_TEMA_DEGO = { color_hue: 0, color_saturation: 0, color_lightness: 0.18 }`. Fusiona `...COLOR_TEMA_DEGO` dentro de `CONFIG_DEFAULTS` sin alterar los defaults operativos existentes.
    - Archivos: `lib/schemas/configuracion.ts`.
    - Aceptación: `colorTemaSchema.safeParse({color_hue:361,color_saturation:0,color_lightness:0}).success===false`; `CONFIG_DEFAULTS.color_lightness===0.18`.
    - _Requirements: R6.4, R6.6_

  - [x] 1.2 Crear `lib/tema/aplicar-color.ts` con `aplicarColorTema` (función pura)
    - Extrae la lógica oklch existente del `ThemeProvider` a una función pura `aplicarColorTema(root, color: ColorTema, isDark: boolean)` que invoca `root.style.setProperty` para `--primary`, `--sidebar-accent`, `--ring` y `--chart-1..5`, derivando todos los valores del `ColorTema` (sin literales de color codificados). `root` se tipa como `{ style: { setProperty(name: string, value: string): void } }` para ser testeable.
    - Archivos: `lib/tema/aplicar-color.ts`.
    - Aceptación: invocar `aplicarColorTema` con un doble de `root` registra `--primary`, `--sidebar-accent`, `--ring` y `--chart-1`..`--chart-5`.
    - _Requirements: R6.7, R4.1_

  - [x] 1.3 Escribir PBT P4 de derivación determinista de variables CSS
    - Crea `__tests__/property/color-tema-roundtrip.test.ts` con `fc.assert` (numRuns: 100), generador `arbColorTema`. Cabecera: `// Feature: identidad-marca-dego, Property 4: Derivación determinista de variables CSS`.
    - **Property 4: Derivación determinista de variables CSS**
    - **Validates: Requirements 6.7, 4.1**
    - Para todo `ColorTema` válido y todo `isDark`, `aplicarColorTema` establece `--primary`, `--sidebar-accent`, `--ring`, `--chart-1..5` con valores derivados del color (no fijos), y la misma entrada produce siempre la misma salida.
    - Archivos: `__tests__/property/color-tema-roundtrip.test.ts`.
    - _PBT: Property 4 (`__tests__/property/color-tema-roundtrip.test.ts`)_
    - _Requirements: R6.7, R4.1_

  - [x] 1.4 Crear `lib/tema/migracion-color.ts` con utilidades de migración puras
    - Implementa `CLAVES_HEREDADAS = ["invenpro-color", "invenpro-theme"]`, el tipo `ResultadoMigracion` (`valido`/`ausente`/`invalido`), `leerColorHeredado(getItem)` (lee y valida sin mutar; devuelve `valido` con `ColorTema` reconstruido, `ausente` o `invalido`) y `limpiarClavesHeredadas(removeItem, getItem)` (elimina ambas claves y devuelve `true` si ambas quedaron ausentes). Funciones puras: reciben los accesores de `localStorage` por parámetro.
    - Archivos: `lib/tema/migracion-color.ts`.
    - Aceptación: `leerColorHeredado(() => null).tipo === "ausente"`; una serialización válida → `{tipo:"valido"}`; una cadena corrupta → `{tipo:"invalido"}`.
    - _Requirements: R9.2, R9.3, R9.4_

  - [x] 1.5 Escribir PBT P8 de clasificación del color heredado
    - Crea `__tests__/property/migracion-color.test.ts` (numRuns: 100), generador `arbColorHeredado` (mezcla de serializaciones válidas y cadenas corruptas/vacías). Cabecera con `Property 8`.
    - **Property 8: Clasificación correcta del color heredado (round-trip de parseo)**
    - **Validates: Requirements 9.2, 9.3**
    - Para todo `ColorTema` válido serializado en formato heredado, `leerColorHeredado` lo clasifica `valido` y reconstruye un `ColorTema` equivalente; para toda cadena no interpretable o ausente lo clasifica `invalido`/`ausente` sin mutar las claves heredadas.
    - Archivos: `__tests__/property/migracion-color.test.ts`.
    - _PBT: Property 8 (`__tests__/property/migracion-color.test.ts`)_
    - _Requirements: R9.2, R9.3_

## Fase 2 — Capa de datos (lectura ampliada de configuración)

- [x] 2. Ampliar la lectura de configuración con el Color_Tema
  - [x] 2.1 Ampliar `leerConfiguracion` en `app/api/configuracion/route.ts` con las claves de color
    - Extiende el `leerConfiguracion(organizacion_id)` existente para mapear `color_hue`/`color_saturation`/`color_lightness` con `parseFloat`, aplicando `COLOR_TEMA_DEGO` cuando falten (R6.6: el default **no** se persiste hasta una actualización explícita). No alteres el parseo de las claves operativas existentes.
    - Archivos: `app/api/configuracion/route.ts`.
    - Aceptación: para una organización sin claves de color, `leerConfiguracion` devuelve `color_hue:0`, `color_saturation:0`, `color_lightness:0.18` sin escribir filas.
    - _Requirements: R6.1, R6.3, R6.6_

  - [x] 2.2 Escribir PBT P3 de round-trip de persistencia y carga del Color_Tema
    - Amplía `__tests__/property/color-tema-roundtrip.test.ts` (o crea un bloque dedicado) con `fc.assert` (numRuns: 100) usando una capa de datos in-memory/mock que emule el upsert por `organizacion_id_clave` y `leerConfiguracion`. Cabecera con `Property 3`.
    - **Property 3: Round-trip de persistencia y carga del Color_Tema**
    - **Validates: Requirements 6.1, 6.3, 6.4, 7.1**
    - Para todo `ColorTema` válido, persistirlo en la `Configuracion_Organizacion` y luego cargarlo (o recibirlo como respuesta de actualización) produce un `ColorTema` igual al enviado.
    - Archivos: `__tests__/property/color-tema-roundtrip.test.ts`.
    - _PBT: Property 3 (`__tests__/property/color-tema-roundtrip.test.ts`)_
    - _Requirements: R6.1, R6.3, R6.4, R7.1_

## Fase 3 — Endpoints API de configuración (color + aislamiento)

- [x] 3. GET/PUT de configuración con color, 401/403 y 422
  - [x] 3.1 Alinear el guard de `/api/configuracion` para responder 403 sin Organizacion_Activa
    - Ajusta `app/api/configuracion/route.ts` para que la ausencia de `Organizacion_Activa` con sesión válida resulte en **HTTP 403** `SIN_ORGANIZACION_ACTIVA` (R8.5), en lugar del 409 actual de `resolverContexto`. Implementa la variante de resolución para configuración descrita en `design.md` § Error Handling (mapeo local a 403) sin romper otros consumidores del guard. Mantén 401 `NO_AUTENTICADO` sin sesión (R8.4).
    - Archivos: `app/api/configuracion/route.ts` (y, si se opta por la variante compartida, `lib/auth/contexto-request.ts`).
    - Aceptación: GET/PUT sin sesión → 401; con sesión sin org activa → 403; estado sin cambios.
    - _Requirements: R8.4, R8.5, R8.6_

  - [x] 3.2 Persistir las claves de color en el `PUT /api/configuracion`
    - Amplía el handler `PUT` para incluir `color_hue`/`color_saturation`/`color_lightness` en el arreglo de `actualizaciones` (upsert por `organizacion_id_clave`), serializando cada valor con `String(...)`. Tras el upsert, devuelve la configuración completa (incluido el color) leída con `leerConfiguracion`, garantizando que el color devuelto coincide con el enviado (R6.4). El alcance se deriva siempre de la sesión, nunca del payload (R8.6).
    - Archivos: `app/api/configuracion/route.ts`.
    - Aceptación: un `PUT` con `{color_hue:200,color_saturation:0.5,color_lightness:0.4}` válido devuelve esos mismos valores en la respuesta; otras organizaciones no se ven afectadas.
    - _Requirements: R6.4, R8.1, R8.3, R8.7_

  - [x] 3.3 Escribir PBT P6 de rechazo y no-mutación ante payload inválido
    - Crea `__tests__/property/config-color-validacion.test.ts` (numRuns: 100), generador `arbPayloadInvalido` (valores fuera de rango/tipo erróneo en `color_*`). Cabecera con `Property 6`.
    - **Property 6: Rechazo y no-mutación ante payload inválido**
    - **Validates: Requirements 6.5**
    - Para todo payload que no cumpla `actualizarConfiguracionSchema`, `safeParse` falla (mapeable a HTTP 422 con detalle por campo) y, verificado contra la capa de datos mock, el `ColorTema` persistido permanece sin cambios.
    - Archivos: `__tests__/property/config-color-validacion.test.ts`.
    - _PBT: Property 6 (`__tests__/property/config-color-validacion.test.ts`)_
    - _Requirements: R6.5_

  - [x] 3.4 Escribir PBT P5 de aislamiento multi-inquilino de la configuración
    - Crea `__tests__/property/config-aislamiento-multitenant.test.ts` (numRuns: 100), generadores `arbConfigOrg` y `arbParOrgs` sobre una capa de datos in-memory por `organizacion_id`. Cabecera con `Property 5`.
    - **Property 5: Aislamiento multi-inquilino de la configuración**
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.7**
    - Para todo par de organizaciones A y B, actualizar la configuración de A (incluido color y logo) con cualquier payload válido preserva inalterados todos los valores de B, y una lectura de A nunca incluye valores de B.
    - Archivos: `__tests__/property/config-aislamiento-multitenant.test.ts`.
    - _PBT: Property 5 (`__tests__/property/config-aislamiento-multitenant.test.ts`)_
    - _Requirements: R8.1, R8.2, R8.3, R8.7_

  - [x] 3.5 Pruebas ejemplares de acceso al endpoint de configuración
    - Crea `__tests__/integration/configuracion-color-acceso.test.ts` que cubre: GET/PUT sin sesión → 401; con sesión sin org activa → 403; PUT de color válido → 200 con el color devuelto; PUT de color inválido → 422 con detalle por campo. Usa mocks de `resolverContexto`/Prisma; `describe.skip` si `SKIP_DB_TESTS=1` donde aplique.
    - Archivos: `__tests__/integration/configuracion-color-acceso.test.ts`.
    - Aceptación: los cuatro casos pasan.
    - _Requirements: R8.4, R8.5, R6.4, R6.5_

- [x] 4. Checkpoint — Esquemas, datos y API en verde
  - Ejecuta las PBT y pruebas de las fases 1–3 disponibles y confirma que pasan. Asegúrate de que todas las pruebas pasen; ante dudas sobre rangos, 403 vs 409 o forma de la respuesta, consulta al usuario antes de continuar.

## Fase 4 — Providers de cliente (identidad visual y tema)

- [x] 5. IdentidadVisualProvider, refactor de ThemeProvider y migración
  - [x] 5.1 Refactorizar `components/theme-provider.tsx` a wrapper de `next-themes`
    - Reduce `ThemeProvider` a un wrapper de `next-themes` con `attribute="class"` que gestione **solo** el modo claro/oscuro. Elimina de este componente toda lógica de color primario y toda lectura/escritura de las claves `invenpro-color`/`invenpro-theme` como fuente de verdad del color (R9.1). No escribas el `Color_Tema` en esas claves.
    - Archivos: `components/theme-provider.tsx`.
    - Aceptación: `ThemeProvider` ya no referencia `--primary` ni `invenpro-color`; el toggle claro/oscuro sigue funcionando vía `next-themes`.
    - _Requirements: R9.1, R9.7, R4.3, R4.5_

  - [x] 5.2 Crear `hooks/use-identidad-visual.tsx` (`IdentidadVisualProvider` + `useIdentidadVisual`)
    - Implementa el provider como única autoridad que inyecta las variables CSS de color vía `aplicarColorTema`. Estado inicial siempre `MarcaDego` (`COLOR_TEMA_DEGO`, `logo=null`). Deriva el comportamiento de `use-sesion` + `use-organizacion-activa`: sin usuario o sin org → aplica `COLOR_TEMA_DEGO` y no lee `localStorage` (R5.2, R5.4, R7.3); al cambiar `organizacion` a id no nulo → reset a Dego + `GET /api/configuracion` con `AbortController` y timeout de 5 s, aplicando el color al resolver (R7.1, R7.2); error/timeout → mantiene Dego y emite toast `sonner` "No se pudo cargar la identidad visual" (R7.5); logo ausente → logo Dego (R7.6); en logout → restaura Dego y descarta color/logo en memoria (R5.6, R7.3). Expone `actualizarColor(color)` que hace `PUT` y solo tras persistencia exitosa inyecta las variables (R6.7). Exporta `useIdentidadVisual(): IdentidadVisualState`.
    - Archivos: `hooks/use-identidad-visual.tsx`.
    - Aceptación: compila; sin sesión el color aplicado es `COLOR_TEMA_DEGO`; `actualizarColor` no inyecta si el `PUT` falla.
    - _Requirements: R5.1, R5.2, R5.4, R5.6, R6.7, R7.1, R7.2, R7.3, R7.5, R7.6_

  - [x] 5.3 Añadir el script anti-flash de Marca Dego en `app/layout.tsx`
    - Inyecta un script de inicialización síncrono en `<head>` (patrón equivalente al de `next-themes`) que establezca las variables CSS de color por defecto (`COLOR_TEMA_DEGO`) antes del primer render visible, de modo que nunca se observe transitoriamente el color de una Organización en el arranque sin sesión (R5.3). Envuelve la app con `ThemeProvider` (claro/oscuro) e `IdentidadVisualProvider` (color), en ese orden.
    - Archivos: `app/layout.tsx`.
    - Aceptación: el HTML inicial contiene el script que fija `--primary` con el valor derivado de `COLOR_TEMA_DEGO` antes del montaje de React.
    - _Requirements: R5.1, R5.3_

  - [x] 5.4 Orquestar la migración localStorage → BD en `IdentidadVisualProvider`
    - Si existe `Organizacion_Activa` **sin** `Color_Tema` persistido y `leerColorHeredado` devuelve `valido`, ofrece migrar vía toast `sonner` (acción "Aplicar") dentro de los 2 s posteriores a la inicialización (R9.2). Al aceptar: `PUT`; si OK → `limpiarClavesHeredadas` (R9.4); si la persistencia falla → conserva claves + toast de error y org sin color (R9.5); si la limpieza falla tras persistir → conserva el color persistido como verdad y no vuelve a ofrecer (marca en memoria por `organizacion_id`, R9.6). Valor heredado inválido/ausente → no ofrecer (R9.3).
    - Archivos: `hooks/use-identidad-visual.tsx` (y, si procede, `lib/tema/migracion-color.ts`).
    - Aceptación: con color heredado válido y org sin color, se dispara el toast de migración; al aceptar y persistir OK, las claves heredadas quedan ausentes.
    - _Requirements: R9.2, R9.3, R9.4, R9.5, R9.6_

  - [x] 5.5 Escribir PBT P1, P2, P7 y P12 del aislamiento de identidad visual en cliente
    - Crea `__tests__/property/identidad-visual-aislamiento.test.tsx` (numRuns: 100) con mocks de `use-sesion`/`use-organizacion-activa` y un doble de `document.documentElement`. Una cabecera por propiedad.
    - **Property 1: Aislamiento del color respecto del Login** — **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5** — para cualquier `Color_Tema` de org y cualquier estado de `localStorage`, sin sesión o sin org activa el color aplicado es exactamente `COLOR_TEMA_DEGO`.
    - **Property 2: Limpieza de identidad visual en cierre de sesión** — **Validates: Requirements 5.6, 7.3** — tras logout el color vuelve a `COLOR_TEMA_DEGO` y el color/logo previos quedan descartados.
    - **Property 7: Reemplazo total al cambiar de Organización** — **Validates: Requirements 7.2** — al cambiar de A a B el color coincide exactamente con el de B, sin componentes de A.
    - **Property 12: Ortogonalidad del modo claro/oscuro respecto al color** — **Validates: Requirements 9.1, 9.7** — ninguna operación de color altera la preferencia de `next-themes` ni escribe el color en `invenpro-color`/`invenpro-theme` como fuente de verdad.
    - Archivos: `__tests__/property/identidad-visual-aislamiento.test.tsx`.
    - _PBT: Property 1, 2, 7, 12 (`__tests__/property/identidad-visual-aislamiento.test.tsx`)_
    - _Requirements: R5.1, R5.2, R5.3, R5.4, R5.5, R5.6, R7.2, R7.3, R9.1, R9.7_

  - [x] 5.6 Escribir PBT P9 de seguridad e idempotencia de la migración
    - Amplía `__tests__/property/migracion-color.test.ts` (numRuns: 100) con un `PUT` mock conmutable (éxito/fallo) y un `localStorage` en memoria. Cabecera con `Property 9`.
    - **Property 9: Seguridad e idempotencia de la migración**
    - **Validates: Requirements 9.4, 9.5, 9.6**
    - Persistencia OK → claves ausentes y repetir migración sin efectos; persistencia falla → claves intactas y org sin color; persistencia OK pero limpieza falla → color persistido como verdad y migración no reofrecida.
    - Archivos: `__tests__/property/migracion-color.test.ts`.
    - _PBT: Property 9 (`__tests__/property/migracion-color.test.ts`)_
    - _Requirements: R9.4, R9.5, R9.6_

## Fase 5 — Rediseño de la Pantalla de Login

- [x] 6. LoginScreen con Layout_Split y paleta Marca Dego
  - [x] 6.1 Verificar/ajustar `loginSchema` (correo ≤254, contraseña ≤128)
    - Confirma que `loginSchema` valida correo con formato y longitud ≤254 y contraseña no vacía y ≤128 (R3.5, R3.6). Si falta el `.max()`, ajústalo en `lib/schemas/auth.ts` sin alterar el resto del esquema.
    - Archivos: `lib/schemas/auth.ts`.
    - Aceptación: `loginSchema.safeParse({correo:'a'.repeat(250)+'@b.co',contrasena:''}).success===false`.
    - _Requirements: R3.5, R3.6_

  - [x] 6.2 Escribir PBT P11 de límites y formato del esquema de login
    - Crea `__tests__/property/login-schema.test.ts` (numRuns: 100) con generadores de correos válidos/malformados y contraseñas de longitudes variadas. Cabecera con `Property 11`.
    - **Property 11: Límites y formato del esquema de login**
    - **Validates: Requirements 3.5, 3.6**
    - `loginSchema.safeParse` tiene éxito si y solo si el correo tiene formato válido y longitud ≤254 y la contraseña no está vacía y tiene longitud ≤128.
    - Archivos: `__tests__/property/login-schema.test.ts`.
    - _PBT: Property 11 (`__tests__/property/login-schema.test.ts`)_
    - _Requirements: R3.5, R3.6_

  - [x] 6.3 Rediseñar `components/auth/login-screen.tsx` como Layout_Split
    - Implementa el grid de 2 columnas en `>=768px` (`lg:grid-cols-2`) y 1 columna en `<768px` (R3.8): panel de marca (`BrandMark` con "Dego" + logo Marca Dego, título "Sistema de Inventario" R3.2, subtítulo `SUBTITULO_LOGIN` R3.3) y panel de formulario. Define y exporta `SUBTITULO_LOGIN` (español, 20–160 chars, menciona inventario y ventas). Construye todo con primitivos de `components/ui/` (`Card`, `Form`, `Input`, `Button`, `Label`), reutilizando `loginSchema` + `react-hook-form` y el manejo de errores existente que conserva valores ingresados (R3.7). Omite cualquier botón de Google/terceros (R3.4). Textos en español (R3.9).
    - Aplica la paleta vía tokens (`bg-primary`, `text-primary-foreground`, `bg-background`, `text-foreground`, `border-input`) sin literales de color (R4.1); aplica `Color_Acento` con hue fuera de 210–270° a elementos destacados del panel de marca (R4.2); responde a `next-themes` con tokens por defecto cuando el tema no está resuelto (R4.3, R4.5).
    - Archivos: `components/auth/login-screen.tsx`.
    - Aceptación: render muestra "Sistema de Inventario" y el subtítulo, sin botón de Google; a `<768px` queda en una columna con título, subtítulo y formulario visibles; no hay literales de color en el archivo.
    - _Requirements: R3.1, R3.2, R3.3, R3.4, R3.5, R3.7, R3.8, R3.9, R4.1, R4.2, R4.3, R4.5_

  - [x] 6.4 Pruebas ejemplares del LoginScreen rediseñado
    - Crea/actualiza `__tests__/unit/login-tema.test.tsx` (o un archivo dedicado) que verifique: render del `Layout_Split`, presencia de "Sistema de Inventario" y subtítulo (20–160 chars, menciona inventario y ventas), ausencia de control de Google, una sola columna a `<768px`, conservación de valores del formulario ante error de validación, y escaneo del archivo sin literales de color (`#`, `rgb`, `hsl`, nombres CSS).
    - Archivos: `__tests__/unit/login-tema.test.tsx`.
    - Aceptación: todos los casos pasan.
    - _Requirements: R3.2, R3.3, R3.4, R3.7, R3.8, R4.1_

## Fase 6 — Rebrand visible InvenPro → Dego

- [x] 7. Constante de marca y sustituciones de Branding_Visible
  - [x] 7.1 Crear `lib/marca.ts` con la constante `MARCA`
    - Define `export const MARCA = { nombre: "Dego", fallback: "Sistema de Inventario", remitenteCorreo: "Dego", prefijoLog: "[dego]" } as const` (R1.7).
    - Archivos: `lib/marca.ts`.
    - Aceptación: `MARCA.nombre==="Dego"` y `MARCA.fallback==="Sistema de Inventario"`.
    - _Requirements: R1.7_

  - [x] 7.2 Rebrand de metadata, sidebar y pantallas de auth/organizaciones
    - Actualiza `app/layout.tsx` `metadata.title` a "Dego - Sistema de Inventario y Ventas" (R1.2). Reemplaza el encabezado de marca en `components/sidebar.tsx` por `MARCA.nombre` con fallback `MARCA.fallback` (R1.1, R1.7). Sustituye "InvenPro" por "Dego" en las pantallas visibles de `components/auth/*` y `components/organizaciones/*` (registro/verificación/invitación/selección de organización), sin tocar `Identificador_Infraestructura`.
    - Archivos: `app/layout.tsx`, `components/sidebar.tsx`, `components/auth/*`, `components/organizaciones/*`.
    - Aceptación: ninguna variante de "InvenPro" visible en estas superficies; `metadata.title` contiene "Dego".
    - _Requirements: R1.1, R1.2, R1.3_

  - [x] 7.3 Rebrand del logger y de las plantillas de correo, y `SMTP_FROM`
    - Cambia el prefijo del logger en `lib/log.ts` de `[invenpro]` a `[dego]` (usa `MARCA.prefijoLog`) (R1.6). Reemplaza "InvenPro" por "Dego" en `lib/correo/plantillas.ts` (asuntos, textos, html, `<title>`) (R1.4 en cuanto al contenido visible). Actualiza `SMTP_FROM` en `.env` y `.env.example` a un remitente que contenga "Dego" (p. ej. `"Dego <no-reply@dego.local>"`) (R1.4) — sin cambiar otras variables de infraestructura.
    - Archivos: `lib/log.ts`, `lib/correo/plantillas.ts`, `.env`, `.env.example`.
    - Aceptación: `lib/log.ts` produce prefijo `[dego]`; `plantillaVerificacion(...).asunto` no contiene "InvenPro"; `SMTP_FROM` contiene "Dego".
    - _Requirements: R1.4, R1.6_

  - [x] 7.4 Actualizar `.kiro/steering/product.md` al nombre de producto "Dego"
    - Reemplaza el nombre de producto "InvenPro" por "Dego" en `product.md`, conservando la descripción del sistema de inventario y ventas. No debe quedar ninguna variante de "InvenPro" como nombre de producto (R1.5).
    - Archivos: `.kiro/steering/product.md`.
    - Aceptación: `product.md` referencia "Dego" como nombre de producto y no contiene "InvenPro" como nombre de producto.
    - _Requirements: R1.5_

  - [x] 7.5 Escribir PBT P10 de que el branding visible nunca expone "InvenPro"
    - Crea `__tests__/property/marca-rebrand.test.ts` (numRuns: 100) con un resolver de marca que recibe nombres de organización arbitrarios (incluidos `null`, vacío, solo espacios). Cabecera con `Property 10`.
    - **Property 10: El branding visible nunca expone "InvenPro"**
    - **Validates: Requirements 1.1, 1.6, 1.7, 2.6**
    - Para cualquier nombre de org, la resolución de marca visible devuelve "Dego" o "Sistema de Inventario" y nunca una cadena que contenga ninguna variante de mayúsculas/minúsculas de "InvenPro"; lo mismo para el prefijo del logger (`[dego]`).
    - Archivos: `__tests__/property/marca-rebrand.test.ts`.
    - _PBT: Property 10 (`__tests__/property/marca-rebrand.test.ts`)_
    - _Requirements: R1.1, R1.6, R1.7, R2.6_

- [x] 8. Checkpoint — Providers, Login y rebrand en verde
  - Ejecuta `pnpm test` y confirma que las PBT (P1–P12) y las pruebas ejemplares pasan. Verifica manualmente que el Login muestra la Marca Dego sin filtración de color. Asegúrate de que todas las pruebas pasen; ante dudas, consulta al usuario.

## Fase 7 — Catálogo de infraestructura y verificación manual (no código)

- [x] 9. Catálogo de rebrand y verificación de criterios no automatizables
  - [x] 9.1 Verificar el catálogo Branding_Visible vs Identificador_Infraestructura
    - Revisa que el catálogo de `design.md` § 5 esté completo y que cada aparición de "invenpro" del repositorio esté clasificada como `Branding_Visible` (reemplazada) o `Identificador_Infraestructura` (diferida): `DATABASE_URL`, `MYSQL_*`, volumen `invenpro_mysql_data`, servicio systemd, cookie `sesion_invenpro`, `id` iframe `invenpro-print-frame`. Confirma que ningún identificador de infraestructura se modificó en este trabajo (R2.1, R2.5, R2.6). Esta tarea es de revisión documental: no modifica infraestructura.
    - _Requirements: R2.1, R2.5, R2.6_

  - [x] 9.2 Documentar el procedimiento de migración y respaldo de infraestructura (diferido)
    - Verifica que `design.md` documente, para cualquier renombrado futuro de `Identificador_Infraestructura`, el procedimiento de migración con advertencia de pérdida de datos, el requisito de respaldo verificado previo y la restauración desde respaldo ante fallo (R2.2, R2.3, R2.4). No se ejecuta ninguna migración de infraestructura aquí (verificación manual documentada).
    - _Requirements: R2.2, R2.3, R2.4_

  - [x] 9.3 Verificación manual de idioma, tiempo de re-render y contraste WCAG
    - Verificación manual (no automatizable): (a) R3.9 — todos los textos del Login en español; (b) R4.4 — el cambio claro/oscuro re-renderiza con tokens en ≤1 s sin colores fijos; (c) R4.3 — contraste WCAG 2.1 AA (≥4.5:1 texto normal, ≥3:1 texto grande y bordes) en panel de marca y formulario, en claro y oscuro, validado con herramienta de contraste y revisión de accesibilidad. Documenta los resultados. Nota: la validación completa de WCAG requiere pruebas manuales con tecnologías de asistencia y revisión experta.
    - _Requirements: R3.9, R4.3, R4.4_

## Notes

- Las sub-tareas marcadas con `*` son opcionales (pruebas ejemplares/integración/smoke y verificación manual) y pueden omitirse para un MVP más rápido; **las pruebas de propiedades P1–P12 forman parte del alcance exigido por el diseño**.
- Cada tarea referencia criterios de aceptación específicos para trazabilidad.
- Los checkpoints aseguran validación incremental.
- Las pruebas de propiedades validan las 12 propiedades de corrección universales con `fast-check` + `vitest` (mínimo 100 iteraciones, etiquetadas con `// Feature: identidad-marca-dego, Property N: ...`).
- No se incluyen tareas de despliegue ni cambios destructivos de infraestructura: los `Identificador_Infraestructura` se conservan sin cambios y su eventual migración queda documentada como verificación manual.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.4", "7.1"] },
    { "id": 1, "tasks": ["1.3", "1.5", "2.1", "6.1", "7.4"] },
    { "id": 2, "tasks": ["2.2", "3.1", "6.2", "7.3"] },
    { "id": 3, "tasks": ["3.2", "5.1", "6.3", "7.2"] },
    { "id": 4, "tasks": ["3.3", "3.4", "3.5", "5.2", "6.4", "7.5"] },
    { "id": 5, "tasks": ["5.3", "5.4"] },
    { "id": 6, "tasks": ["5.5", "5.6"] },
    { "id": 7, "tasks": ["9.1", "9.2", "9.3"] }
  ]
}
```
