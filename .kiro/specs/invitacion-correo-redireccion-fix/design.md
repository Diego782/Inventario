# Corrección: Redirección de Invitación por Correo para Usuarios Autenticados — Diseño del Bugfix

## Overview

El enlace de invitación (`/?token=<token>&accion=invitacion`) solo se honra hoy
para usuarios **no autenticados**, porque la lectura de `?token=&accion=` vive
exclusivamente dentro de `AuthScreens`, que únicamente se monta cuando `AuthGate`
detecta que no hay sesión. Un usuario **ya autenticado** que abre el enlace nunca
ve la pantalla "Aceptar invitación": `AuthGate` lo deja pasar y `OrganizacionGate`
lo envía a "Selecciona una organización".

La estrategia de corrección (F') es **arquitectónica y mínima**: introducir una
nueva compuerta de invitación, `InvitacionGate`, que se monte cuando hay usuario
autenticado **y** la URL contiene `?token=…&accion=invitacion`, ubicada **antes**
de `OrganizacionGate` para interceptar el flujo y evitar que el usuario caiga en
"Selecciona una organización". `InvitacionGate` reutiliza la pantalla existente
`AceptarInvitacionScreen` (que ya maneja info de org+rol, aceptación y mensajes
de error por código `INVITACION_INVALIDA` / `INVITACION_OTRO_CORREO`), añade la
limpieza de los parámetros `?token=&accion=` de la URL y recarga el contexto de
organizaciones tras una aceptación exitosa.

El fix no toca la lógica de dominio `aceptarInvitacion` (R10.2–R10.7), ni el flujo
no autenticado (`AuthScreens`), ni el flujo de verificación (`accion=verificar`).
Además, se elimina la aceptación automática silenciosa que hoy ignora errores en
`AuthScreens`, sustituyéndola por el flujo explícito y con feedback de
`AceptarInvitacionScreen`.

## Glossary

- **Bug_Condition (C)**: El estado que dispara el bug — usuario **autenticado**
  con `?token` presente y `?accion=invitacion` en la URL, donde el flujo de
  invitación se ignora y el usuario es enviado a "Selecciona una organización".
- **Property (P)**: El comportamiento deseado cuando se cumple C — el sistema
  monta la pantalla `AceptarInvitacionScreen` ("aceptar-invitacion") en lugar de
  `SeleccionOrganizacion`.
- **Preservation**: El comportamiento que NO debe cambiar — flujo no autenticado,
  flujo de verificación, `OrganizacionGate` sin parámetros de invitación, lógica
  de dominio `aceptarInvitacion`, y la construcción del enlace `construirEnlace`.
- **resolverPantalla / F**: La cadena de compuertas actual
  (`AuthGate` → `OrganizacionGate`) que ignora el token cuando hay sesión.
- **resolverPantalla' / F'**: La cadena corregida
  (`AuthGate` → `InvitacionGate` → `OrganizacionGate`) que honra el token tanto
  antes como después del login.
- **InvitacionGate**: Nueva compuerta cliente en `components/auth/invitacion-gate.tsx`
  que decide si interceptar el flujo con `AceptarInvitacionScreen`.
- **AuthGate**: Compuerta de autenticación en `components/auth/auth-gate.tsx`;
  monta `AuthScreens` cuando `!usuario`, o `children` cuando hay sesión.
- **OrganizacionGate**: Compuerta de organización en
  `components/organizaciones/organizacion-gate.tsx`; muestra `SeleccionOrganizacion`
  cuando no hay organización activa.
- **AceptarInvitacionScreen**: Pantalla existente
  (`components/auth/aceptar-invitacion-screen.tsx`) que carga info de la
  invitación, permite aceptarla y muestra errores por código.
- **useSesion**: Hook de contexto de sesión; expone `{ usuario, cargando, refetch }`.
- **useOrganizacionActiva**: Hook de contexto de organizaciones; expone
  `{ organizacion, organizaciones, recargar }`.
- **urlToken / urlAccion**: Valores `token` y `accion` leídos de
  `window.location.search`.

## Bug Details

### Bug Condition

El bug se manifiesta cuando hay un usuario **autenticado** y la URL contiene un
token de invitación (`?token=<token>&accion=invitacion`). En ese estado, ninguna
parte del árbol de compuertas (`AuthGate` → `OrganizacionGate`) lee los
parámetros: `AuthGate` ve `usuario != null` y renderiza `children`; el control
llega a `OrganizacionGate`, que al no haber organización activa renderiza
`SeleccionOrganizacion`. La pantalla "Aceptar invitación" nunca se monta.

**Formal Specification:**
```
FUNCTION isBugCondition(X)
  INPUT: X de tipo EstadoApp {
           autenticado: boolean,
           urlToken: string | null,
           urlAccion: string | null
         }
  OUTPUT: boolean

  RETURN X.autenticado = true
         AND X.urlToken <> null
         AND X.urlAccion = "invitacion"
END FUNCTION
```

### Examples

- **Usuario autenticado con invitación válida**: abre
  `/?token=abc123&accion=invitacion`.
  - Esperado: ve "Aceptar invitación" con organización + rol y un botón para
    aceptar.
  - Actual: ve "Selecciona una organización / No perteneces a ninguna
    organización"; el token se ignora.
- **Usuario autenticado, invitación expirada**: abre
  `/?token=expirado&accion=invitacion`.
  - Esperado: ve un mensaje claro ("Esta invitación no es válida, ha expirado o
    ya fue utilizada").
  - Actual: cae en "Selecciona una organización" sin explicación.
- **Usuario que inicia sesión desde el enlace y la aceptación automática falla
  (correo distinto)**.
  - Esperado: ve el mensaje "Esta invitación fue enviada a otro correo…".
  - Actual: la aceptación automática en `AuthScreens` falla en silencio y termina
    en "Selecciona una organización".
- **Edge — usuario autenticado tras aceptar con éxito**: la URL retiene
  `?token=&accion=invitacion`.
  - Esperado: los parámetros se limpian para que recargar no re-dispare el flujo.
  - Actual: los parámetros persisten indefinidamente.

## Expected Behavior

### Preservation Requirements

**Unchanged Behaviors:**
- El flujo **no autenticado** debe seguir funcionando: cuando `!usuario` y la URL
  trae `?token=&accion=invitacion`, `AuthGate` sigue montando `AuthScreens`, que
  muestra `AceptarInvitacionScreen` con la opción de registrarse o iniciar sesión
  conservando el token (R10.6 / cláusula 3.1).
- El flujo de **verificación** (`?token=&accion=verificar`) debe seguir mostrando
  `VerificacionScreen` sin verse afectado (cláusula 3.2).
- `OrganizacionGate` debe seguir aplicándose normalmente cuando un usuario
  autenticado abre la app **sin** parámetros de invitación (cláusula 3.3).
- La lógica de dominio `aceptarInvitacion(token, usuario)` debe conservar sus
  reglas de validez, expiración, coincidencia de correo e idempotencia
  (R10.2–R10.7 / cláusula 3.4) sin cambios.
- `construirEnlace(token, "invitacion")` debe seguir generando una URL hacia la
  raíz con `?token=` y `?accion=invitacion` válidos (cláusula 3.5).

**Scope:**
Todos los estados que NO cumplen `isBugCondition` deben quedar completamente
inalterados por este fix. Esto incluye:
- Usuario no autenticado (con o sin token de invitación).
- Cualquier acción distinta de `invitacion` (p. ej. `verificar`, o sin acción).
- Usuario autenticado sin `token` en la URL.

**Nota:** El comportamiento correcto esperado cuando se cumple la condición de bug
se define en la sección Correctness Properties (Property 1). Esta sección se enfoca
en lo que NO debe cambiar.

## Hypothesized Root Cause

Con base en el análisis del bug, las causas más probables son:

1. **Lectura del token acoplada al árbol no autenticado**: `?token=&accion=` solo
   se lee en `AuthScreens` (`leerParamsUrl` / `pantallaInicial`), que únicamente se
   monta cuando `AuthGate` detecta `!usuario`. No existe lectura del token en el
   subárbol autenticado.

2. **Ausencia de una compuerta de invitación posterior al login**: la cadena
   `AuthGate → OrganizacionActivaProvider → OrganizacionGate` no contempla el caso
   "usuario autenticado con invitación pendiente"; `OrganizacionGate` solo conoce
   dos estados (con/sin organización activa) y por defecto lleva a
   `SeleccionOrganizacion`.

3. **Aceptación automática silenciosa**: en `AuthScreens.intentarAceptarInvitacion`
   se hace `POST /api/invitaciones/aceptar` ignorando deliberadamente el resultado
   ("el fallo no es bloqueante"), por lo que los errores (token expirado, correo
   distinto, red) nunca llegan al usuario.

4. **Parámetros de URL sin limpieza**: ningún componente elimina `?token=&accion=`
   de la URL tras completar o abandonar el flujo, por lo que recargar o re-navegar
   puede re-disparar o confundir el flujo.

## Correctness Properties

Property 1: Bug Condition - Usuario autenticado con token ve "Aceptar invitación"

_For any_ estado de la app donde la condición de bug se cumple (`isBugCondition`
devuelve true: usuario autenticado, `urlToken != null`, `urlAccion = "invitacion"`),
la cadena de compuertas corregida (F') SHALL montar la pantalla
`AceptarInvitacionScreen` ("aceptar-invitacion") en lugar de `SeleccionOrganizacion`
("seleccion-organizacion"), permitiendo aceptar la invitación; y tras una
aceptación exitosa SHALL limpiar `?token=&accion=` de la URL y recargar el contexto
de organizaciones para reflejar la nueva membresía.

**Validates: Requirements 2.1, 2.2, 2.3, 2.4**

Property 2: Preservation - Estados que no disparan el bug no cambian

_For any_ estado de la app donde la condición de bug NO se cumple
(`isBugCondition` devuelve false: usuario no autenticado, o sin `urlToken`, o
`urlAccion != "invitacion"`), la cadena de compuertas corregida (F') SHALL producir
exactamente el mismo resultado que la cadena original (F), preservando el flujo no
autenticado (`AuthScreens`), el flujo de verificación (`accion=verificar`), la
aplicación normal de `OrganizacionGate` sin parámetros de invitación, la lógica de
dominio `aceptarInvitacion` (R10.2–R10.7) y la construcción del enlace
`construirEnlace`.

**Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5**

## Fix Implementation

### Changes Required

Asumiendo que el análisis de causa raíz es correcto:

**Archivo nuevo**: `components/auth/invitacion-gate.tsx`

**Componente**: `InvitacionGate`

**Cambios específicos**:

1. **Lectura de parámetros de URL en el subárbol autenticado**: extraer un helper
   reutilizable `leerParamsInvitacion()` que devuelva `{ token, accion }` desde
   `window.location.search` (guardado contra SSR con `typeof window === "undefined"`).
   Para evitar duplicación, se ubicará en un módulo compartido (p. ej.
   `lib/auth/params-invitacion.ts`) y `AuthScreens` podrá reutilizarlo.

2. **Decisión de interceptación (la condición de bug, invertida a fix)**:
   `InvitacionGate` calcula
   `debeInterceptar = Boolean(token) && accion === "invitacion"`.
   Lee `usuario` de `useSesion()` (siempre estará presente, porque `InvitacionGate`
   se monta dentro del subárbol autenticado de `AuthGate`).
   - Si `debeInterceptar` es false → renderiza `children` (delega a
     `OrganizacionGate`), preservando el flujo normal.
   - Si `debeInterceptar` es true → renderiza `AceptarInvitacionScreen` con el
     `token`, centrada en pantalla completa (mismo contenedor visual que
     `AuthScreens` usa).

3. **Limpieza de parámetros de URL**: añadir `limpiarParamsInvitacion()` que use
   `window.history.replaceState(null, "", window.location.pathname)` para eliminar
   `?token=&accion=` sin recargar la página. Se invoca:
   - tras una aceptación exitosa (callback `onAceptado`), y
   - tras cerrar/abandonar el estado de error (callback de "Volver al inicio").

4. **Recarga del contexto de organizaciones**: en el callback `onAceptado`,
   `InvitacionGate` llama `recargar()` de `useOrganizacionActiva()` para refrescar
   la lista de organizaciones y la organización activa, reflejando la nueva
   membresía. Tras limpiar la URL y recargar, `InvitacionGate` deja de interceptar
   y delega en `children` (`OrganizacionGate`), que ahora encontrará membresías y
   continuará hacia la app (cláusula 2.4). Se usa un estado local
   `interceptado` que pasa a false una vez completado el flujo, para que el
   siguiente render delegue en `children`.

5. **Eliminación de la aceptación automática silenciosa**: en
   `components/auth/auth-screens.tsx`, retirar `intentarAceptarInvitacion` y su
   invocación dentro de `handleLoginExitoso`. Tras un login/registro exitoso desde
   el enlace de invitación, el `refetch()` de la sesión hará que `AuthGate` monte
   el subárbol autenticado, donde `InvitacionGate` interceptará y mostrará
   `AceptarInvitacionScreen` con feedback explícito (sustituyendo el manejo
   silencioso por uno visible — cláusula 2.2).

**Archivo modificado**: `app/page.tsx`

**Cambio**: insertar `InvitacionGate` entre `OrganizacionActivaProvider` y
`OrganizacionGate`, de modo que intercepte ANTES de `OrganizacionGate` pero tenga
acceso al contexto de organizaciones para poder `recargar()`:

```
ThemeProvider
  SesionProvider
    AuthGate
      OrganizacionActivaProvider
        InvitacionGate            ← nueva compuerta
          OrganizacionGate
            AppShellConPermisos
```

**Archivo modificado**: `components/auth/auth-screens.tsx`

**Cambio**: usar el helper compartido `leerParamsInvitacion()` (en lugar de su
`leerParamsUrl` local) para mantener una sola fuente de verdad, y eliminar la
aceptación automática silenciosa (punto 5). El resto del comportamiento no
autenticado se preserva sin cambios.

> No se modifica `lib/dominio/invitaciones.ts` (`aceptarInvitacion`) ni
> `lib/correo/enviar.ts` (`construirEnlace`).

## Testing Strategy

### Validation Approach

La estrategia de testing sigue un enfoque de dos fases: primero, exponer
contraejemplos que demuestren el bug sobre el código **sin corregir**; después,
verificar que el fix funciona correctamente (Fix Checking) y que preserva el
comportamiento existente (Preservation Checking). Se prioriza el testing a nivel
de la función de decisión de compuertas `resolverPantalla(X)` —
modelable de forma pura sobre `EstadoApp` — más pruebas de componente que validen
el montaje real de las pantallas.

### Exploratory Bug Condition Checking

**Goal**: Exponer contraejemplos que demuestren el bug ANTES de implementar el fix.
Confirmar o refutar el análisis de causa raíz. Si se refuta, será necesario
re-hipotetizar.

**Test Plan**: Escribir pruebas de componente que rendericen el árbol de compuertas
con una sesión autenticada simulada (`useSesion` → `usuario != null`) y la URL
establecida a `/?token=abc&accion=invitacion`, y aseverar que se monta la pantalla
"Aceptar invitación". Ejecutar estas pruebas sobre el código SIN corregir para
observar el fallo (se monta "Selecciona una organización") y entender la causa raíz.

**Test Cases**:
1. **Autenticado + invitación → pantalla de aceptación**: usuario autenticado, URL
   `?token=abc&accion=invitacion` → se espera "Aceptar invitación" (falla en
   código sin corregir: aparece "Selecciona una organización").
2. **Autenticado + invitación expirada → mensaje de error**: la pantalla de
   aceptación muestra el error por código `INVITACION_INVALIDA` (falla en código
   sin corregir: no se muestra nada, cae en selección de organización).
3. **Login desde enlace con correo distinto → mensaje de error**: tras login, se
   espera el mensaje `INVITACION_OTRO_CORREO` visible (falla en código sin
   corregir: aceptación silenciosa, sin feedback).
4. **Edge — URL conserva params tras aceptar**: tras aceptar, `window.location.search`
   debe quedar vacío (falla en código sin corregir: los params persisten).

**Expected Counterexamples**:
- Con sesión activa y `?accion=invitacion`, se monta `SeleccionOrganizacion` en vez
  de `AceptarInvitacionScreen`.
- Posibles causas: lectura del token acoplada a `AuthScreens` (no autenticado);
  ausencia de compuerta de invitación posterior al login; aceptación automática
  silenciosa; params de URL sin limpieza.

### Fix Checking

**Goal**: Verificar que para todos los inputs donde se cumple la condición de bug,
la función corregida produce el comportamiento esperado.

**Pseudocode:**
```
FOR ALL X WHERE isBugCondition(X) DO
  pantalla := resolverPantalla'(X)
  ASSERT pantalla = "aceptar-invitacion"
     AND pantalla <> "seleccion-organizacion"
END FOR
```

### Preservation Checking

**Goal**: Verificar que para todos los inputs donde la condición de bug NO se
cumple, la función corregida produce el mismo resultado que la función original.

**Pseudocode:**
```
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT resolverPantalla(X) = resolverPantalla'(X)
END FOR
```

**Testing Approach**: El testing basado en propiedades (property-based) es
recomendado para Preservation Checking porque:
- Genera muchos casos automáticamente sobre el dominio de entrada (combinaciones de
  `autenticado`, `urlToken`, `urlAccion`).
- Detecta casos límite que las pruebas unitarias manuales podrían omitir.
- Da garantías fuertes de que el comportamiento es idéntico para todos los inputs
  no buggy.

**Test Plan**: Modelar `resolverPantalla(X)` (F) y `resolverPantalla'(X)` (F') como
funciones puras de decisión sobre `EstadoApp` que devuelven una etiqueta de pantalla
(`"auth-screens"`, `"verificacion"`, `"aceptar-invitacion"`, `"seleccion-organizacion"`,
`"app"`). Generar `EstadoApp` aleatorios y, para todos los que NO cumplen
`isBugCondition`, aseverar igualdad F = F'.

**Test Cases**:
1. **No autenticado preserva AuthScreens**: observar que `!usuario` (con o sin
   token) sigue montando `AuthScreens`; escribir prueba que confirme F = F'.
2. **Verificación preserva su pantalla**: `?accion=verificar` sigue mostrando
   `VerificacionScreen` (no interceptado por `InvitacionGate`).
3. **Autenticado sin params preserva OrganizacionGate**: sin `token`, F = F'
   (selección de organización o app según organización activa).
4. **Dominio `aceptarInvitacion` sin cambios**: las pruebas existentes de
   idempotencia, expiración y coincidencia de correo siguen pasando sin
   modificación.

### Unit Tests

- `InvitacionGate`: con sesión autenticada y `?token=&accion=invitacion`, monta
  `AceptarInvitacionScreen`; sin params, renderiza `children`.
- `InvitacionGate`: con `?accion=verificar`, NO intercepta (renderiza `children`).
- `InvitacionGate`: tras `onAceptado`, invoca `recargar()` del contexto y limpia la
  URL (`window.history.replaceState` con `pathname` sin query).
- `AceptarInvitacionScreen`: muestra el mensaje correcto para los códigos
  `INVITACION_INVALIDA` e `INVITACION_OTRO_CORREO` (cobertura existente reforzada).
- `AuthScreens`: ya no realiza aceptación automática silenciosa tras login/registro
  (verificar que no se llama `POST /api/invitaciones/aceptar` en `handleLoginExitoso`).
- Helper `leerParamsInvitacion` / `limpiarParamsInvitacion`: lectura y limpieza
  correctas de `?token=&accion=`.

### Property-Based Tests

- **Fix Checking (P1)**: generar `EstadoApp` aleatorios que cumplan
  `isBugCondition` (autenticado, token no vacío, `accion="invitacion"`) y aseverar
  `resolverPantalla'(X) = "aceptar-invitacion"`.
- **Preservation Checking (P2)**: generar `EstadoApp` aleatorios sobre el dominio
  completo y, para los que NO cumplen `isBugCondition`, aseverar
  `resolverPantalla(X) = resolverPantalla'(X)`.
- **Cobertura del dominio**: generadores para `autenticado ∈ {true, false}`,
  `urlToken ∈ {null, "", string aleatorio}`, `urlAccion ∈ {null, "invitacion",
  "verificar", string aleatorio}`.

### Integration Tests

- Flujo completo autenticado: usuario con sesión abre `/?token=…&accion=invitacion`
  → ve "Aceptar invitación" → acepta → URL limpia → contexto recargado → entra a la
  app con la nueva organización.
- Flujo de error autenticado: token expirado → mensaje de error visible → "Volver
  al inicio" limpia la URL → aplica `OrganizacionGate` normal.
- Flujo no autenticado (regresión): abrir el enlace sin sesión sigue mostrando
  `AceptarInvitacionScreen` con opción de registrarse/iniciar sesión conservando el
  token.
- Flujo de verificación (regresión): `?accion=verificar` sigue mostrando la pantalla
  de verificación.
