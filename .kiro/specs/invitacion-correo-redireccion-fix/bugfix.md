# Documento de Requisitos del Bugfix

## Introduction

Cuando una persona recibe una invitación a una organización por correo y abre el
enlace (`/?token=<token>&accion=invitacion`), el flujo de aceptación de la
invitación no se honra si la persona **ya tiene una sesión iniciada**. En lugar
de mostrar la pantalla "Aceptar invitación", la aplicación deja pasar al usuario
por la compuerta de autenticación (`AuthGate`) y la compuerta de organización
(`OrganizacionGate`) lo envía a la pantalla "Selecciona una organización / No
perteneces a ninguna organización". El token y la acción de la URL se ignoran por
completo en el nivel autenticado.

La causa raíz es arquitectónica: la lectura de `?token=` y `?accion=` solo ocurre
dentro de `AuthScreens`, que únicamente se monta cuando **no** hay usuario
autenticado. No existe ninguna compuerta de invitación posterior al login. A esto
se suman fallas secundarias: la aceptación automática tras login es silenciosa e
ignora todos los errores (token expirado, correo distinto, etc.), y los parámetros
de la URL nunca se limpian, lo que puede re-disparar o confundir el flujo al
recargar o re-navegar.

El impacto es que las invitaciones por correo no funcionan para el caso más común
(un usuario que ya inició sesión o que inicia sesión y la invitación falla en
silencio), bloqueando la incorporación de miembros a una organización.

## Bug Analysis

### Current Behavior (Defect)

Lo que sucede hoy cuando se abre el enlace de invitación:

1.1 CUANDO un usuario con sesión válida abre el enlace `/?token=<token>&accion=invitacion` ENTONCES el sistema ignora el token de la URL, lo deja pasar por `AuthGate` y `OrganizacionGate` lo lleva a la pantalla "Selecciona una organización / No perteneces a ninguna organización" sin mostrar nunca la pantalla "Aceptar invitación".

1.2 CUANDO un usuario inicia sesión o se registra desde el enlace de invitación y la aceptación automática (`POST /api/invitaciones/aceptar`) falla (token expirado, correo distinto, invitación revocada, error de red) ENTONCES el sistema ignora el error de forma silenciosa, no muestra ninguna explicación y el usuario termina en "Selecciona una organización" sin saber por qué no se unió.

1.3 CUANDO un usuario completa (o abandona) el flujo de invitación ENTONCES el sistema conserva los parámetros `?token=` y `?accion=` en la URL indefinidamente, por lo que recargar o re-navegar puede re-disparar o confundir el flujo de invitación.

### Expected Behavior (Correct)

Lo que debería suceder en cada caso:

2.1 CUANDO un usuario con sesión válida abre el enlace `/?token=<token>&accion=invitacion` ENTONCES el sistema DEBERÁ mostrar la pantalla "Aceptar invitación" (con organización y rol) antes de aplicar la compuerta de organización, permitiéndole aceptar la invitación sin pasar por "Selecciona una organización".

2.2 CUANDO un usuario inicia sesión, se registra o acepta desde el enlace y la aceptación de la invitación falla ENTONCES el sistema DEBERÁ mostrar un mensaje claro acorde al motivo (token inválido/expirado, correo distinto, error de conexión) en lugar de fallar en silencio.

2.3 CUANDO un usuario termina el flujo de invitación (aceptada con éxito, o tras mostrar el error) ENTONCES el sistema DEBERÁ limpiar los parámetros `?token=` y `?accion=` de la URL para que recargar o re-navegar no vuelva a disparar el flujo.

2.4 CUANDO un usuario acepta correctamente la invitación estando autenticado ENTONCES el sistema DEBERÁ reflejar la nueva membresía (organización activa o lista de organizaciones) y continuar hacia la aplicación sin quedar atrapado en "Selecciona una organización".

### Unchanged Behavior (Regression Prevention)

Lo que debe seguir funcionando exactamente igual:

3.1 CUANDO un usuario **no autenticado** abre el enlace `/?token=<token>&accion=invitacion` ENTONCES el sistema DEBERÁ CONTINUAR mostrando la pantalla "Aceptar invitación" y la opción de registrarse o iniciar sesión conservando el token (R10.6).

3.2 CUANDO un usuario abre el enlace de verificación `/?token=<token>&accion=verificar` ENTONCES el sistema DEBERÁ CONTINUAR mostrando la pantalla de verificación con el token, sin verse afectado por el cambio.

3.3 CUANDO un usuario con sesión válida abre la aplicación **sin** parámetros de invitación en la URL ENTONCES el sistema DEBERÁ CONTINUAR aplicando `OrganizacionGate` normalmente (mostrando "Selecciona una organización" si no tiene organización activa, o la app si la tiene).

3.4 CUANDO se invoca la lógica de dominio `aceptarInvitacion(token, usuario)` ENTONCES el sistema DEBERÁ CONTINUAR aplicando las reglas existentes de validez, expiración, coincidencia de correo e idempotencia de membresía (R10.2–R10.7) sin cambios.

3.5 CUANDO se construye el enlace de invitación con `construirEnlace(token, "invitacion")` ENTONCES el sistema DEBERÁ CONTINUAR generando una URL hacia la raíz con `?token=` y `?accion=invitacion` válidos.

## Derivación de la Condición de Bug

### Función de Condición de Bug

```pascal
FUNCTION isBugCondition(X)
  INPUT: X de tipo EstadoApp { autenticado: boolean, urlToken: string|null, urlAccion: string|null }
  OUTPUT: boolean

  // El bug se manifiesta cuando hay un token de invitación en la URL
  // y el usuario YA está autenticado: el flujo de invitación se ignora.
  RETURN X.autenticado = true
     AND X.urlToken <> null
     AND X.urlAccion = "invitacion"
END FUNCTION
```

### Especificación de Propiedad (Fix Checking)

```pascal
// Propiedad: el usuario autenticado con token de invitación ve la pantalla
// de aceptación, no la selección de organización.
FOR ALL X WHERE isBugCondition(X) DO
  pantalla ← resolverPantalla'(X)
  ASSERT pantalla = "aceptar-invitacion"
     AND pantalla <> "seleccion-organizacion"
END FOR
```

### Objetivo de Preservación (Preservation Checking)

```pascal
// Propiedad: para todo estado que NO dispara el bug, el comportamiento
// del flujo de compuertas es idéntico al original.
FOR ALL X WHERE NOT isBugCondition(X) DO
  ASSERT resolverPantalla(X) = resolverPantalla'(X)
END FOR
```

**Definiciones:**
- **F** (`resolverPantalla`): lógica actual de compuertas (`AuthGate` → `OrganizacionGate`) que ignora el token de invitación cuando el usuario está autenticado.
- **F'** (`resolverPantalla'`): lógica corregida que introduce una compuerta de invitación posterior al login para honrar `?token=&accion=invitacion`.
- **Contraejemplo**: usuario autenticado abre `/?token=abc123&accion=invitacion` → hoy ve "Selecciona una organización"; debería ver "Aceptar invitación".
