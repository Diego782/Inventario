# Requirements Document

## Introduction

Esta especificación define la funcionalidad **Identidad de Marca Dego**, que agrupa tres iniciativas relacionadas para la aplicación de inventario y ventas:

1. **Rebrand de "InvenPro" a "Dego"**: la aplicación pasa a llamarse **Dego**. Todas las apariciones de "InvenPro"/"invenpro" visibles para el usuario deben reemplazarse por "Dego", con una marca de paleta negra/neutral. Los identificadores de infraestructura (nombres de base de datos, usuario MySQL, volúmenes Docker, servicio systemd) se tratan por separado por implicar migración de datos y riesgo operativo.

2. **Rediseño de la pantalla de Login**: nuevo layout de panel dividido (split) con un panel de marca/eslogan y un panel de formulario, sin inicio de sesión con Google, con título "Sistema de Inventario", un subtítulo profesional, y una paleta negra con un color de acento contrastado suave (en lugar de un negro plano agresivo o un azul fuerte). El Login debe ser accesible (WCAG 2.1 AA).

3. **Identidad visual atada a la Organización**: la identidad visual de cada Organización (color/tema y logo) debe persistirse en la base de datos y quedar atada a la Organización, igual que el resto de la configuración operativa (impuestos, etiquetas, tickets) y los datos de negocio (empleados, ventas). Hoy el color/tema se guarda en `localStorage` (claves `invenpro-color` e `invenpro-theme`) mediante `components/theme-provider.tsx`, lo que provoca dos defectos: (a) el color personalizado de una Organización se filtra a la pantalla de Login antes de autenticarse, y (b) el color persiste entre Organizaciones distintas en el mismo navegador, rompiendo el aislamiento multi-inquilino.

El trabajo se enmarca en el stack existente: Next.js 16 App Router + React 19 + TypeScript, Tailwind CSS v4 con variables CSS, shadcn/ui (estilo `new-york`, base `neutral`), `next-themes`, Prisma + MySQL 8, `react-hook-form` + Zod, y `sonner`. Todo el texto de usuario está en español. La aplicación ya cuenta con un subsistema multi-inquilino (`Sistema_Organizaciones`, `Organizacion_Activa`, membresías, roles y permisos) definido en la especificación `usuarios-y-accesos`, y con una tabla `configuracion` atada a `organizacion_id`. La Organización ya dispone de los campos `logo` y `logo_aspecto`.

Esta especificación no altera la lógica de autenticación, registro, verificación de correo ni permisos definida en `usuarios-y-accesos`; reutiliza esos subsistemas y se concentra en marca, presentación del Login y persistencia/aislamiento de la identidad visual.

## Glossary

- **Dego**: nombre de marca y de producto de la aplicación cliente Next.js + React que aloja los módulos de inventario y ventas. Reemplaza el nombre anterior "InvenPro".
- **Marca_Dego**: conjunto de elementos visibles de identidad de Dego: nombre "Dego", paleta negra/neutral con color de acento, y eslóganes, aplicados cuando no hay una identidad visual de Organización vigente.
- **App_Cliente**: aplicación cliente Next.js + React que renderiza la pantalla de Login, la selección de Organización y las secciones del producto.
- **API_Backend**: capa de Route Handlers de Next.js bajo `app/api/**/route.ts` que expone endpoints REST/JSON validados con Zod.
- **Capa_Datos**: módulo de acceso a datos basado en Prisma ORM sobre MySQL 8.
- **Organizacion**: inquilino (tenant) que agrupa miembros, roles, datos de negocio y su propia configuración; incluye los campos de marca `logo` y `logo_aspecto`.
- **Organizacion_Activa**: Organización seleccionada por el usuario autenticado sobre la cual opera la aplicación tras el login.
- **Usuario_Actual**: usuario autenticado en la sesión vigente del navegador.
- **Sesion**: sesión autenticada del Usuario_Actual cuyo token no ha expirado.
- **Proveedor_Tema**: componente cliente (hoy `components/theme-provider.tsx`) responsable de aplicar el modo claro/oscuro y el color primario inyectando variables CSS sobre `document.documentElement`.
- **Identidad_Visual**: conjunto de ajustes visuales de una Organización compuesto por el color/tema primario y el logo (`logo`, `logo_aspecto`).
- **Color_Tema**: color primario de la Identidad_Visual, expresado como triada (hue, saturation, lightness) y materializado en las variables CSS `--primary`, `--sidebar-accent`, `--ring`, `--chart-*`, entre otras.
- **Configuracion_Organizacion**: conjunto completo de ajustes de una Organización persistidos en la tabla `configuracion` con `organizacion_id`, incluyendo claves operativas (`porcentaje_impuesto`, `etiqueta_ancho_mm`, `etiqueta_alto_mm`, `ticket_ancho_mm`, `imprimir_automaticamente`, `permitir_sobreventa`) y claves de Identidad_Visual.
- **Pantalla_Login**: vista de inicio de sesión renderizada por `components/auth/login-screen.tsx` cuando no existe una Sesion válida.
- **Layout_Split**: disposición de la Pantalla_Login en dos paneles: un panel de marca (Marca_Dego, título y eslogan) y un panel de formulario.
- **Color_Acento**: color secundario contrastado de tono suave aplicado a elementos destacados de la Marca_Dego, distinto de un negro plano y del azul de la referencia visual.
- **Branding_Visible**: toda aparición textual o visual de "InvenPro"/"invenpro" percibida por el usuario final (metadatos de página, títulos, encabezados, textos de UI, remitente de correo).
- **Identificador_Infraestructura**: aparición de "invenpro" en nombres técnicos no visibles al usuario: nombre de base de datos, usuario MySQL, volúmenes Docker, nombre de servicio systemd y cadenas de conexión.

## Requirements

### Requisito 1: Rebrand del branding visible de InvenPro a Dego

**User Story:** Como usuario de la aplicación, quiero ver el nombre "Dego" en lugar de "InvenPro" en toda la interfaz y los textos visibles, para reconocer la marca actual del producto.

#### Criterios de Aceptación

1. THE App_Cliente SHALL mostrar el nombre de marca "Dego" en todos los elementos de Branding_Visible (encabezado, barra lateral, Pantalla_Login, título del documento y mensajes al usuario), sin presentar ninguna variante de mayúsculas/minúsculas del texto "InvenPro" (incluyendo "InvenPro", "invenpro", "INVENPRO") en ninguna superficie visible para el usuario.
2. WHEN el navegador renderiza la pestaña o título del documento, THE App_Cliente SHALL establecer el metadato de título a un valor que contenga "Dego" y no contenga ninguna variante de mayúsculas/minúsculas de "InvenPro".
3. WHEN se renderiza la Pantalla_Login, THE Pantalla_Login SHALL mostrar la Marca_Dego con el nombre "Dego" en lugar del título "InvenPro".
4. WHEN el Servicio_Correo genera el nombre del remitente de los correos transaccionales, THE API_Backend SHALL usar un nombre de remitente que contenga "Dego" y no contenga ninguna variante de mayúsculas/minúsculas de "InvenPro".
5. THE App_Cliente SHALL presentar la documentación de producto de marca (`.kiro/steering/product.md`) con el nombre "Dego" como nombre de producto, sin ninguna variante de mayúsculas/minúsculas de "InvenPro" como nombre de producto.
6. WHERE existan comentarios de código o prefijos de registro (logger) que contengan alguna variante de "InvenPro"/"invenpro", THE App_Cliente SHALL reemplazarlos por "Dego" cuando dicho texto pueda exponerse en salidas observables como los registros de la aplicación.
7. IF el recurso o cadena de marca "Dego" no está disponible al renderizar un elemento de Branding_Visible, THEN THE App_Cliente SHALL mostrar un texto de respaldo neutral ("Sistema de Inventario") sin exponer el texto "InvenPro" y sin interrumpir la funcionalidad de la vista.

### Requisito 2: Tratamiento de identificadores de infraestructura

**User Story:** Como administrador del sistema, quiero un plan claro y seguro para los identificadores técnicos que contienen "invenpro", para evitar la pérdida de datos al renombrar la marca.

#### Criterios de Aceptación

1. WHEN se inicia la planificación del rebrand, THE App_Cliente SHALL producir un catálogo que clasifique y liste cada aparición como Branding_Visible (de reemplazo obligatorio) o como Identificador_Infraestructura (de reemplazo opcional y diferido).
2. WHERE se decida renombrar un Identificador_Infraestructura (nombre de base de datos, usuario MySQL, volumen Docker, servicio systemd o cadena de conexión), THE App_Cliente SHALL documentar el procedimiento de migración de datos asociado y la advertencia de riesgo de pérdida de datos antes de aplicar el cambio, e impedir aplicar el cambio sin dicha documentación.
3. WHERE se vaya a migrar un Identificador_Infraestructura, THE App_Cliente SHALL requerir una copia de respaldo verificada de los datos afectados antes de ejecutar la migración.
4. IF la migración de un Identificador_Infraestructura falla o se interrumpe, THEN THE App_Cliente SHALL restaurar el estado desde la copia de respaldo y conservar el identificador original sin cambios.
5. IF no se ejecuta la migración de los Identificador_Infraestructura, THEN THE App_Cliente SHALL conservar sin cambios dichos identificadores y mantener verificable la conectividad de la aplicación con la base de datos existente.
6. THE App_Cliente SHALL mantener el Branding_Visible con el nombre "Dego" con independencia de que los Identificador_Infraestructura conserven o no el valor "invenpro".

### Requisito 3: Layout de la Pantalla de Login

**User Story:** Como usuario, quiero una pantalla de Login con un panel de marca y un panel de formulario, para identificar la aplicación e iniciar sesión con una experiencia clara y profesional.

#### Criterios de Aceptación

1. THE Pantalla_Login SHALL presentar un Layout_Split compuesto por un panel de marca y un panel de formulario, construido exclusivamente con componentes de `components/ui/` sin introducir nuevas librerías de UI.
2. THE Pantalla_Login SHALL mostrar en el panel de marca el título "Sistema de Inventario".
3. THE Pantalla_Login SHALL mostrar, debajo del título "Sistema de Inventario", un subtítulo en español, no vacío y con una longitud entre 20 y 160 caracteres, cuyo texto mencione la gestión de inventario y de ventas de la organización.
4. THE Pantalla_Login SHALL omitir cualquier control de inicio de sesión con Google o con proveedores de terceros, presentando únicamente el formulario de correo y contraseña.
5. THE Pantalla_Login SHALL presentar el formulario de correo y contraseña gestionado con `react-hook-form` y validación Zod, donde el campo de correo acepta un máximo de 254 caracteres y el campo de contraseña un máximo de 128 caracteres.
6. WHEN el usuario envía el formulario, THE Pantalla_Login SHALL validar con Zod que el correo tenga formato válido y que ambos campos no estén vacíos antes de procesar el inicio de sesión.
7. IF el envío del formulario contiene un correo con formato inválido o un campo obligatorio vacío, THEN THE Pantalla_Login SHALL rechazar el envío, mostrar un mensaje de error en español asociado a cada campo afectado y conservar los valores previamente ingresados en todos los campos.
8. WHILE el ancho de la ventana del navegador es menor a 768 píxeles, THE Pantalla_Login SHALL adaptar el Layout_Split a una disposición de una sola columna que mantenga visibles el título, el subtítulo y el formulario.
9. THE Pantalla_Login SHALL exponer todas las etiquetas, mensajes y textos de botón en español.

### Requisito 4: Paleta de marca de la Pantalla de Login

**User Story:** Como usuario, quiero una Pantalla de Login con una paleta negra de tono suave y un acento contrastado, para una apariencia profesional que no resulte agresiva.

#### Criterios de Aceptación

1. THE Pantalla_Login SHALL aplicar la paleta de la Marca_Dego basada en negro/neutral mediante variables de tema, sin que ningún componente contenga valores de color literales (hexadecimal, `rgb`/`rgba`, `hsl` o nombres de color CSS).
2. THE Pantalla_Login SHALL aplicar un Color_Acento contrastado de tono suave a los elementos destacados de la marca, con un hue fuera del rango azul (210–270°) y una relación de contraste mínima de 3:1 respecto al fondo del panel de marca, distinto de un negro plano uniforme.
3. THE Pantalla_Login SHALL garantizar, conforme a WCAG 2.1 nivel AA, una relación de contraste mínima de 4.5:1 para el texto normal y de 3:1 para el texto grande (≥ 18 pt, o ≥ 14 pt en negrita) y los bordes de los controles, entre el contenido y su fondo, tanto en el panel de marca como en el panel de formulario, medida en modo claro y en modo oscuro.
4. WHEN el usuario alterna entre el modo claro y el modo oscuro provisto por `next-themes`, THE Pantalla_Login SHALL re-renderizar aplicando los tokens de color del tema correspondiente en un máximo de 1 segundo, sin colores fijos codificados y manteniendo las relaciones de contraste del criterio 3.
5. WHILE el tema de `next-themes` aún no se ha resuelto en el arranque, THE Pantalla_Login SHALL aplicar los tokens del tema por defecto sin emplear colores literales codificados.

### Requisito 5: Aislamiento de la identidad visual respecto de la Pantalla de Login

**User Story:** Como usuario, quiero que la Pantalla de Login muestre siempre la identidad de marca de Dego y nunca el color de una organización, para que ningún ajuste previo se filtre antes de autenticarme.

#### Criterios de Aceptación

1. WHILE no exista una Sesion válida, THE App_Cliente SHALL renderizar la Pantalla_Login con la paleta de la Marca_Dego y SHALL NOT aplicar el Color_Tema de ninguna Organizacion en ningún momento durante la carga ni después.
2. WHILE no exista una Organizacion_Activa, THE Proveedor_Tema SHALL aplicar la paleta neutral/negra predeterminada de la Marca_Dego y SHALL NOT leer un Color_Tema desde `localStorage`.
3. WHEN la App_Cliente arranca sin una Sesion válida, THE Proveedor_Tema SHALL inicializar las variables CSS de color con los valores predeterminados de la Marca_Dego antes del primer renderizado de la Pantalla_Login, sin mostrar transitoriamente un Color_Tema de ninguna Organizacion.
4. IF existe en `localStorage` un Color_Tema persistido por una versión anterior (claves `invenpro-color` o `invenpro-theme`), THEN THE Proveedor_Tema SHALL ignorar dicho valor para la Pantalla_Login y aplicar la paleta de la Marca_Dego.
5. IF un Color_Tema persistido en `localStorage` está ausente, vacío, corrupto o tiene un formato no interpretable, THEN THE Proveedor_Tema SHALL aplicar la paleta de la Marca_Dego sin interrumpir el renderizado de la Pantalla_Login.
6. WHEN una Sesion válida termina (cierre de sesión), THE App_Cliente SHALL restaurar la paleta de la Marca_Dego en la Pantalla_Login antes del siguiente renderizado y SHALL NOT conservar el Color_Tema de la Organizacion previamente activa.

### Requisito 6: Persistencia de la identidad visual en la Organización

**User Story:** Como administrador de una organización, quiero que el color/tema y el logo de mi organización se guarden en la base de datos atados a la organización, para que mi identidad visual persista entre dispositivos y navegadores.

#### Criterios de Aceptación

1. THE Capa_Datos SHALL persistir de forma durable el Color_Tema de cada Organizacion como parte de la Configuracion_Organizacion asociada a `organizacion_id`, en lugar de en `localStorage`, de modo que el valor sobreviva al cierre de sesión, al cambio de dispositivo y al cambio de navegador.
2. THE Capa_Datos SHALL persistir de forma durable el logo de cada Organizacion mediante los campos `logo` y `logo_aspecto` de la Organizacion, atados a `organizacion_id`.
3. WHEN la App_Cliente carga con una Sesion válida y una Organizacion_Activa, THE App_Cliente SHALL recuperar de la base de datos y aplicar exactamente los últimos valores de Color_Tema y logo persistidos para esa Organizacion.
4. WHEN el Usuario_Actual actualiza el Color_Tema de la Organizacion_Activa con un payload válido, THE API_Backend SHALL validar la entrada con un esquema Zod, persistir el nuevo Color_Tema en la Configuracion_Organizacion de esa Organizacion y devolver el Color_Tema persistido coincidente con el enviado.
5. IF el payload de actualización del Color_Tema no cumple el esquema Zod, THEN THE API_Backend SHALL rechazar la solicitud con HTTP 422, conservar sin cambios el Color_Tema vigente y devolver el detalle de cada campo inválido identificando el campo y el motivo.
6. IF una Organizacion no tiene un Color_Tema persistido, THEN THE App_Cliente SHALL aplicar un Color_Tema predeterminado definido en los valores por defecto de la Configuracion_Organizacion, sin persistir dicho valor por defecto hasta que el usuario lo actualice explícitamente.
7. WHEN el Usuario_Actual actualiza el Color_Tema, THE App_Cliente SHALL reflejar el nuevo color en la interfaz inyectando las variables CSS correspondientes (`--primary`, `--sidebar-accent`, `--ring`, `--chart-*`) en un máximo de 1000 ms tras la persistencia exitosa y sin requerir recargar la página.

### Requisito 7: Carga y limpieza de la identidad visual por sesión

**User Story:** Como usuario que pertenece a varias organizaciones, quiero que la identidad visual cambie al seleccionar cada organización y se limpie al salir, para no ver el color de una organización en otra.

#### Criterios de Aceptación

1. WHEN el Usuario_Actual establece una Organizacion_Activa, THE App_Cliente SHALL solicitar el Color_Tema y el logo de esa Organizacion desde la API_Backend y, al recibir una respuesta correcta en un máximo de 5 segundos, aplicarlos a la interfaz de modo que el color visible coincida con el Color_Tema recibido.
2. WHEN el Usuario_Actual cambia de una Organizacion_Activa a otra, THE App_Cliente SHALL reemplazar por completo el Color_Tema y el logo aplicados por los de la nueva Organizacion_Activa, sin conservar ningún valor visual de la Organizacion previa.
3. WHEN el Usuario_Actual cierra sesión, THE App_Cliente SHALL restablecer las variables CSS de color a la paleta predeterminada de la Marca_Dego y descartar de la memoria de la sesión el Color_Tema y el logo de la Organizacion previa.
4. WHILE se carga la Identidad_Visual de una Organizacion_Activa recién seleccionada, THE App_Cliente SHALL aplicar la paleta predeterminada de la Marca_Dego hasta completar la carga o hasta que transcurran 5 segundos, lo que ocurra primero.
5. IF la carga de la Identidad_Visual de la Organizacion_Activa falla o no se completa en 5 segundos, THEN THE App_Cliente SHALL conservar la paleta predeterminada de la Marca_Dego como Color_Tema aplicado y mostrar un mensaje en español que indique que no se pudo cargar la identidad visual.
6. IF la Organizacion_Activa no tiene un logo definido en la respuesta de la API_Backend, THEN THE App_Cliente SHALL mostrar el logo predeterminado de la Marca_Dego en lugar del logo de la Organizacion.

### Requisito 8: Aislamiento multi-inquilino de la configuración de organización

**User Story:** Como administrador, quiero que todas las configuraciones de mi organización (operativas, color y logo) estén atadas a mi organización y aisladas de las demás, para garantizar la separación de datos entre inquilinos.

#### Criterios de Aceptación

1. THE API_Backend SHALL asociar toda lectura y escritura de la Configuracion_Organizacion (claves operativas, Color_Tema y logo) a la Organizacion_Activa del Usuario_Actual.
2. WHEN el Usuario_Actual solicita la Configuracion_Organizacion, THE API_Backend SHALL devolver únicamente los valores cuyo identificador de Organizacion coincide con la Organizacion_Activa, sin incluir ningún valor perteneciente a otra Organizacion.
3. WHEN el Usuario_Actual actualiza un valor de la Configuracion_Organizacion, THE API_Backend SHALL aplicar el cambio únicamente a la Organizacion_Activa y conservar sin cambios todos los valores de configuración de las demás Organizaciones.
4. IF una solicitud de lectura o escritura de la Configuracion_Organizacion no presenta una Sesion válida, THEN THE API_Backend SHALL responder con HTTP 401, sin exponer ni modificar configuración alguna y sin alterar el estado almacenado.
5. IF una solicitud de lectura o escritura de la Configuracion_Organizacion presenta una Sesion válida pero el Usuario_Actual no tiene una Organizacion_Activa, THEN THE API_Backend SHALL responder con HTTP 403, sin exponer ni modificar configuración alguna y sin alterar el estado almacenado.
6. IF una solicitud de lectura o escritura de la Configuracion_Organizacion referencia una Organizacion distinta a la Organizacion_Activa del Usuario_Actual, THEN THE API_Backend SHALL rechazar la solicitud con HTTP 403, sin exponer ni modificar la configuración de esa Organizacion y sin alterar el estado almacenado.
7. FOR ALL pares de Organizaciones distintas con sus respectivas Configuracion_Organizacion, actualizar la configuración de una Organizacion SHALL preservar inalterados todos los valores de configuración de la otra Organizacion (aislamiento entre inquilinos).

### Requisito 9: Migración de la persistencia de color desde localStorage

**User Story:** Como mantenedor del sistema, quiero migrar la persistencia del color desde localStorage hacia la base de datos, para eliminar la fuente del defecto de filtración de color sin romper la experiencia existente.

#### Criterios de Aceptación

1. THE App_Cliente SHALL utilizar exclusivamente el Color_Tema persistido en la base de datos como única fuente de verdad de la Identidad_Visual de una Organizacion, sin escribir ni leer el Color_Tema desde las claves de `localStorage` `invenpro-color` e `invenpro-theme` como fuente de verdad.
2. WHEN la App_Cliente se inicializa y detecta un valor heredado con formato de Color_Tema válido (según la definición de Color_Tema en el Glosario) en las claves `invenpro-color` o `invenpro-theme` y existe una Organizacion_Activa sin Color_Tema persistido, THE App_Cliente SHALL ofrecer al usuario, en un máximo de 2 segundos tras completar la inicialización, aplicar dicho valor heredado como Color_Tema inicial de esa Organizacion y, al aceptarlo el usuario, persistirlo en la base de datos.
3. IF la App_Cliente detecta un valor heredado en las claves `invenpro-color` o `invenpro-theme` cuyo formato no es un Color_Tema válido, THEN THE App_Cliente SHALL omitir la oferta de migración para ese valor y conservar las claves heredadas sin modificarlas.
4. WHEN el usuario acepta la migración y el Color_Tema heredado se persiste correctamente en la base de datos para una Organizacion, THE App_Cliente SHALL eliminar las claves heredadas `invenpro-color` e `invenpro-theme` del `localStorage`.
5. IF la persistencia en la base de datos del Color_Tema heredado falla durante la migración, THEN THE App_Cliente SHALL conservar las claves heredadas `invenpro-color` e `invenpro-theme` sin eliminarlas, mantener la Organizacion sin Color_Tema persistido y mostrar un mensaje de error indicando que la migración no se completó.
6. IF la eliminación de las claves heredadas `invenpro-color` o `invenpro-theme` falla después de persistir correctamente el Color_Tema en la base de datos, THEN THE App_Cliente SHALL conservar el Color_Tema ya persistido como fuente de verdad y no volver a ofrecer la migración para esa Organizacion.
7. THE App_Cliente SHALL conservar la preferencia de modo claro/oscuro de `next-themes` como ajuste del navegador, independiente del Color_Tema atado a la Organizacion.
