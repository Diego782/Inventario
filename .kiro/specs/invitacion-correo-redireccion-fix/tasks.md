# Implementation Plan

## Overview

Este plan sigue el flujo de bugfix exploratorio derivado del diseño:
primero se exponen contraejemplos que demuestran el bug sobre el código **sin
corregir**; luego se aplica el fix (F'); finalmente se valida con Fix Checking
(Property 1) y Preservation Checking (Property 2), más pruebas unitarias e
integración.

Convenciones del proyecto: Next.js 16 (App Router), React 19, TypeScript,
vitest + fast-check. Las pruebas viven en `__tests__/property`, `__tests__/unit`
e `__tests__/integration`. Documentación en español.

Modelo de decisión de compuertas usado por las pruebas property-based:
`resolverPantalla(X)` (F) y `resolverPantalla'(X)` (F') son funciones puras sobre
`EstadoApp { autenticado, urlToken, urlAccion }` que devuelven una etiqueta de
pantalla (`"auth-screens" | "verificacion" | "aceptar-invitacion" |
"seleccion-organizacion" | "app"`).

## Tasks

- [x] 1. Escribir prueba exploratoria de la condición de bug
  - **Property 1: Bug Condition** - Usuario autenticado con token ve "Aceptar invitación"
  - **CRÍTICO**: Esta prueba DEBE FALLAR sobre el código sin corregir — el fallo confirma que el bug existe.
  - **NO intentes corregir la prueba ni el código cuando falle.**
  - **NOTA**: Esta prueba codifica el comportamiento esperado — validará el fix cuando pase tras la implementación.
  - **OBJETIVO**: Surgir contraejemplos que demuestren la existencia del bug.
  - **Enfoque PBT acotado**: generar `EstadoApp` que cumplan `isBugCondition` (`autenticado = true`, `urlToken` no vacío/no nulo, `urlAccion = "invitacion"`), con `urlToken` aleatorio para reproducibilidad sobre todo el dominio de tokens.
  - Modelar/renderizar el árbol de compuertas con sesión autenticada simulada (`useSesion` → `usuario != null`) y `window.location.search = "?token=<token>&accion=invitacion"`.
  - Aseverar que `resolverPantalla'(X) = "aceptar-invitacion"` y `<> "seleccion-organizacion"` (las aserciones reflejan las Expected Behavior Properties del diseño — Property 1).
  - Casos a cubrir desde "Exploratory Bug Condition Checking" del diseño: (1) autenticado + invitación → pantalla de aceptación; (2) invitación expirada → mensaje `INVITACION_INVALIDA`; (3) login con correo distinto → `INVITACION_OTRO_CORREO`; (4) edge: URL conserva params tras aceptar.
  - Ejecutar la prueba sobre el código SIN corregir.
  - **RESULTADO ESPERADO**: La prueba FALLA (correcto — se monta "Selecciona una organización" en vez de "Aceptar invitación"), confirmando el bug.
  - Documentar contraejemplos encontrados para entender la causa raíz (lectura de token acoplada a `AuthScreens`; ausencia de compuerta de invitación posterior al login; aceptación silenciosa; params sin limpieza).
  - Archivo sugerido: `__tests__/property/invitacion-redireccion-fix.test.ts`.
  - Marcar la tarea como completa cuando la prueba esté escrita, ejecutada y el fallo documentado.
  - _Requirements: 2.1, 2.2, 2.3, 2.4_

- [x] 2. Escribir pruebas de preservación property-based (ANTES de implementar el fix)
  - **Property 2: Preservation** - Estados que no disparan el bug no cambian
  - **IMPORTANTE**: Seguir la metodología observation-first (observar primero el comportamiento real del código sin corregir).
  - Modelar `resolverPantalla(X)` (F) y `resolverPantalla'(X)` (F') como funciones puras sobre `EstadoApp`.
  - Observar sobre el código SIN corregir el resultado de F para inputs no-buggy: no autenticado (con/sin token) → `"auth-screens"`; `accion = "verificar"` → `"verificacion"`; autenticado sin token → `"seleccion-organizacion"`/`"app"`.
  - Generadores del dominio completo: `autenticado ∈ {true, false}`, `urlToken ∈ {null, "", string aleatorio}`, `urlAccion ∈ {null, "invitacion", "verificar", string aleatorio}`.
  - Escribir property-based test: `FOR ALL X WHERE NOT isBugCondition(X) → resolverPantalla(X) = resolverPantalla'(X)` (de "Preservation Checking" del diseño).
  - Confirmar que las pruebas de dominio existentes que cubren `aceptarInvitacion` (idempotencia, expiración, coincidencia de correo — R10.2–R10.7) siguen pasando sin modificación.
  - Ejecutar las pruebas sobre el código SIN corregir.
  - **RESULTADO ESPERADO**: Las pruebas PASAN (confirma el comportamiento base a preservar).
  - Archivo sugerido: `__tests__/property/invitacion-redireccion-preservacion.test.ts`.
  - Marcar la tarea como completa cuando las pruebas estén escritas, ejecutadas y pasando sobre el código sin corregir.
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Fix para la redirección de invitación de usuarios autenticados

  - [x] 3.1 Crear el helper compartido de parámetros de invitación
    - Crear `lib/auth/params-invitacion.ts` con `leerParamsInvitacion()` que devuelva `{ token, accion }` desde `window.location.search`, con guardado SSR (`typeof window === "undefined"` → `{ token: null, accion: null }`).
    - Añadir `limpiarParamsInvitacion()` que use `window.history.replaceState(null, "", window.location.pathname)` para eliminar `?token=&accion=` sin recargar la página (cláusula 2.3).
    - _Bug_Condition: isBugCondition(X) = X.autenticado AND X.urlToken <> null AND X.urlAccion = "invitacion" (del diseño)_
    - _Expected_Behavior: leer y limpiar params sin tocar dominio ni construirEnlace (del diseño)_
    - _Preservation: Preservation Requirements — construirEnlace y flujos no afectados (del diseño)_
    - _Requirements: 2.3_

  - [x] 3.2 Crear el componente InvitacionGate
    - Crear `components/auth/invitacion-gate.tsx` (`InvitacionGate`) que lea `usuario` de `useSesion()` y los params con `leerParamsInvitacion()`.
    - Calcular `debeInterceptar = Boolean(token) && accion === "invitacion"`; usar estado local `interceptado`.
    - Si NO debe interceptar → renderizar `children` (delegar a `OrganizacionGate`), preservando el flujo normal.
    - Si debe interceptar → montar `AceptarInvitacionScreen` con el `token`, centrada en pantalla completa.
    - En `onAceptado`: limpiar la URL (`limpiarParamsInvitacion()`), llamar `recargar()` de `useOrganizacionActiva()`, poner `interceptado = false` para delegar en `children` en el siguiente render (cláusula 2.4).
    - En "Volver al inicio" (cierre/abandono de error): limpiar la URL y dejar de interceptar.
    - _Bug_Condition: isBugCondition(X) del diseño (autenticado + token + accion="invitacion")_
    - _Expected_Behavior: resolverPantalla'(X) = "aceptar-invitacion" AND <> "seleccion-organizacion" (Property 1 del diseño)_
    - _Preservation: ¬isBugCondition(X) → renderiza children sin alterar OrganizacionGate (Property 2 del diseño)_
    - _Requirements: 2.1, 2.2, 2.4_

  - [x] 3.3 Insertar InvitacionGate en app/page.tsx
    - Insertar `InvitacionGate` entre `OrganizacionActivaProvider` y `OrganizacionGate`, de modo que intercepte ANTES de `OrganizacionGate` pero con acceso al contexto de organizaciones para `recargar()`.
    - Estructura objetivo: `AuthGate → OrganizacionActivaProvider → InvitacionGate → OrganizacionGate → AppShellConPermisos`.
    - _Bug_Condition: isBugCondition(X) del diseño_
    - _Expected_Behavior: la cadena F' honra el token antes de OrganizacionGate (del diseño)_
    - _Preservation: sin params, OrganizacionGate se aplica normalmente (cláusula 3.3)_
    - _Requirements: 2.1, 2.4, 3.3_

  - [x] 3.4 Eliminar la aceptación automática silenciosa en auth-screens.tsx
    - Retirar `intentarAceptarInvitacion` y su invocación dentro de `handleLoginExitoso` en `components/auth/auth-screens.tsx`.
    - Reemplazar `leerParamsUrl` local por el helper compartido `leerParamsInvitacion()` (fuente única de verdad).
    - Tras login/registro exitoso desde el enlace, el `refetch()` de la sesión hará que `AuthGate` monte el subárbol autenticado donde `InvitacionGate` interceptará y mostrará feedback explícito (cláusula 2.2).
    - Preservar el resto del comportamiento no autenticado (login/registro/verificación) sin cambios.
    - _Bug_Condition: isBugCondition(X) del diseño_
    - _Expected_Behavior: errores de aceptación visibles vía AceptarInvitacionScreen (cláusula 2.2)_
    - _Preservation: flujo no autenticado y verificación intactos (cláusulas 3.1, 3.2)_
    - _Requirements: 2.2, 3.1, 3.2_

  - [x] 3.5 Verificar que la prueba exploratoria de la condición de bug ahora pasa
    - **Property 1: Expected Behavior** - Usuario autenticado con token ve "Aceptar invitación"
    - **IMPORTANTE**: Re-ejecutar la MISMA prueba de la tarea 1 — NO escribir una prueba nueva.
    - La prueba de la tarea 1 codifica el comportamiento esperado; cuando pasa, confirma que el comportamiento esperado se satisface.
    - Ejecutar la prueba exploratoria de la condición de bug (tarea 1).
    - **RESULTADO ESPERADO**: La prueba PASA (confirma que el bug está corregido).
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 3.6 Verificar que las pruebas de preservación siguen pasando
    - **Property 2: Preservation** - Estados que no disparan el bug no cambian
    - **IMPORTANTE**: Re-ejecutar las MISMAS pruebas de la tarea 2 — NO escribir pruebas nuevas.
    - Ejecutar las pruebas de preservación property-based (tarea 2).
    - **RESULTADO ESPERADO**: Las pruebas PASAN (confirma que no hay regresiones).
    - Confirmar que F = F' para todos los inputs `¬isBugCondition`.
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4. Pruebas unitarias del fix
  - `InvitacionGate`: con sesión autenticada y `?token=&accion=invitacion`, monta `AceptarInvitacionScreen`; sin params, renderiza `children`.
  - `InvitacionGate`: con `?accion=verificar`, NO intercepta (renderiza `children`).
  - `InvitacionGate`: tras `onAceptado`, invoca `recargar()` del contexto y limpia la URL (`window.history.replaceState` con `pathname` sin query).
  - `AceptarInvitacionScreen`: muestra el mensaje correcto para los códigos `INVITACION_INVALIDA` e `INVITACION_OTRO_CORREO` (refuerzo de cobertura existente).
  - `AuthScreens`: ya no realiza aceptación automática silenciosa tras login/registro (verificar que no se llama `POST /api/invitaciones/aceptar` en `handleLoginExitoso`).
  - Helper `leerParamsInvitacion` / `limpiarParamsInvitacion`: lectura y limpieza correctas de `?token=&accion=`.
  - Archivos sugeridos: `__tests__/unit/invitacion-gate.test.tsx`, `__tests__/unit/params-invitacion.test.ts`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

- [x] 5. Pruebas de integración del fix
  - Flujo completo autenticado: usuario con sesión abre `/?token=…&accion=invitacion` → ve "Aceptar invitación" → acepta → URL limpia → contexto recargado → entra a la app con la nueva organización (cláusulas 2.1, 2.3, 2.4).
  - Flujo de error autenticado: token expirado → mensaje de error visible → "Volver al inicio" limpia la URL → aplica `OrganizacionGate` normal (cláusulas 2.2, 3.3).
  - Regresión no autenticado: abrir el enlace sin sesión sigue mostrando `AceptarInvitacionScreen` con opción de registrarse/iniciar sesión conservando el token (cláusula 3.1).
  - Regresión verificación: `?accion=verificar` sigue mostrando la pantalla de verificación (cláusula 3.2).
  - Archivo sugerido: `__tests__/integration/invitacion-redireccion.test.ts`.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3_

- [x] 6. Checkpoint — Asegurar que todas las pruebas pasan
  - Ejecutar la suite completa (`pnpm vitest --run` o equivalente) y confirmar que pasan las pruebas property-based (Property 1 y Property 2), unitarias e integración.
  - Confirmar que no hay regresiones en las pruebas existentes de dominio (`aceptarInvitacion`, idempotencia, expiración, coincidencia de correo — R10.2–R10.7).
  - Si surgen dudas o fallos inesperados, consultar con el usuario antes de continuar.
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

---

## Task Dependency Graph

Las olas (waves) agrupan tareas que pueden ejecutarse en paralelo; cada ola
depende de que las anteriores estén completas.

- **Ola 0**: tareas 1 y 2 (independientes entre sí, se ejecutan sobre el código sin corregir).
- **Ola 1**: tarea 3.1 (helper compartido), prerequisito del resto del fix.
- **Ola 2**: tarea 3.2 (InvitacionGate), depende de 3.1.
- **Ola 3**: tareas 3.3 (inserción en page.tsx, depende de 3.2) y 3.4 (auth-screens, depende de 3.1).
- **Ola 4**: tareas 3.5 y 3.6 (verificación de Property 1 y Property 2 tras el fix).
- **Ola 5**: tarea 4 (pruebas unitarias).
- **Ola 6**: tarea 5 (pruebas de integración).
- **Ola 7**: tarea 6 (checkpoint final).

```json
{
  "waves": [
    { "id": 0, "tasks": ["1", "2"] },
    { "id": 1, "tasks": ["3.1"] },
    { "id": 2, "tasks": ["3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4"] },
    { "id": 4, "tasks": ["3.5", "3.6"] },
    { "id": 5, "tasks": ["4"] },
    { "id": 6, "tasks": ["5"] },
    { "id": 7, "tasks": ["6"] }
  ]
}
```

## Notes

- **Orden crítico del flujo de bugfix**: las tareas 1 y 2 se escriben y ejecutan ANTES del fix. La prueba de la condición de bug (tarea 1) DEBE fallar sobre el código sin corregir; las pruebas de preservación (tarea 2) DEBEN pasar sobre el código sin corregir.
- **No tocar**: `lib/dominio/invitaciones.ts` (`aceptarInvitacion`) ni `lib/correo/enviar.ts` (`construirEnlace`) permanecen sin cambios (cláusulas 3.4, 3.5).
- **Modelo puro para PBT**: `resolverPantalla` (F) y `resolverPantalla'` (F') se modelan como funciones puras sobre `EstadoApp` para que Fix Checking (Property 1) y Preservation Checking (Property 2) puedan generar el dominio completo con fast-check.
- **Reutilización**: `AuthScreens` debe migrar a `leerParamsInvitacion()` para mantener una sola fuente de verdad de lectura de `?token=&accion=`.
- **Stack de pruebas**: vitest + fast-check; pruebas en `__tests__/property`, `__tests__/unit`, `__tests__/integration`; documentación en español.
- El checkpoint (tarea 6) es un punto de detención: si surgen fallos inesperados, consultar al usuario antes de continuar.
