# Requirements Document

## Introduction

Esta especificación define la funcionalidad **Usuarios y Accesos** de la aplicación InvenPro. El alcance cubre autenticación y registro de usuarios con verificación de correo electrónico, gestión de organizaciones multi-inquilino (multi-tenancy), invitaciones por correo, un modelo de roles con permisos granulares por sección y acción, la asignación de horarios a los miembros de cada organización, y el control de acceso que oculta o deshabilita las secciones de la aplicación según los permisos del usuario activo.

La capa de backend se implementa con Route Handlers de Next.js (TypeScript) bajo `app/api/**/route.ts`, valida toda entrada con Zod, y persiste en la misma instancia MySQL 8 contenerizada mediante Prisma ORM ya empleada por el módulo `inventario-ventas-core`. La interfaz se construye exclusivamente con el sistema de diseño existente (shadcn/ui, Tailwind v4, modo claro/oscuro vía `next-themes`), con `react-hook-form` + Zod en los formularios, notificaciones con `sonner` y todo el texto de usuario en español.

Una restricción transversal del proyecto es mantener el costo de operación en cero o casi cero: el envío de correo (verificación de cuenta e invitaciones) debe apoyarse en soluciones gratuitas o de capa gratuita (SMTP propio del usuario, servidor SMTP self-hosted, o proveedores con free tier como Resend, Brevo o SMTP de Gmail) y debe ser configurable mediante variables de entorno, sin depender de servicios de pago.

La aplicación conserva la navegación de página única ya implementada en `app/page.tsx` mediante el estado `activeSection`. La pantalla de Login y la selección/creación de organización se presentan antes de mostrar las secciones del producto. Las secciones de **Empleados** y **Horarios** hoy operan con datos mock y deberán conectarse al modelo de membresías y horarios definido en esta especificación.

Esta funcionalidad utiliza color de marca **negro** como color primario, ya que el usuario aún no dispone de selección de color personalizado.

## Glossary

- **InvenPro**: aplicación cliente Next.js 16 + React 19 que aloja los módulos de producto y la funcionalidad de Usuarios y Accesos.
- **Sistema_Acceso**: subsistema responsable de autenticación, registro, verificación de correo, sesiones y control de acceso por permisos.
- **Sistema_Organizaciones**: subsistema responsable de la gestión de organizaciones, membresías, roles, permisos e invitaciones.
- **API_Backend**: capa de Route Handlers de Next.js bajo `app/api/**/route.ts` que expone endpoints REST/JSON validados con Zod.
- **BD_MySQL**: instancia MySQL 8 ejecutada en Docker, compartida con el módulo `inventario-ventas-core`.
- **Capa_Datos**: módulo de acceso a datos basado en Prisma ORM que mapea el esquema relacional a tipos TypeScript.
- **Servicio_Correo**: componente del servidor que envía correos transaccionales (verificación, invitación) mediante un transporte SMTP configurado por variables de entorno.
- **Usuario**: entidad con los campos `id`, `correo`, `nombre`, `hash_contrasena`, `correo_verificado`, `estado`, `creado_en`, `actualizado_en`. Identifica a una persona que puede autenticarse en InvenPro.
- **Correo**: dirección de correo electrónico única que identifica a un Usuario, normalizada en minúsculas.
- **Sesion**: registro que vincula a un Usuario autenticado con un identificador de sesión almacenado en una cookie httpOnly segura, con fecha de expiración.
- **Token_Verificacion**: cadena aleatoria de un solo uso, con expiración, asociada a un Usuario para confirmar la propiedad de su Correo.
- **Token_Invitacion**: cadena aleatoria de un solo uso, con expiración, asociada a una Invitacion para que un invitado se una a una Organizacion.
- **Organizacion**: entidad con los campos `id`, `nombre`, `slug`, `creado_por`, `creado_en`, `actualizado_en`. Representa un inquilino (tenant) que agrupa miembros, roles y datos de negocio.
- **Membresia**: relación entre un Usuario y una Organizacion con un Rol asignado, con los campos `id`, `usuario_id`, `organizacion_id`, `rol_id`, `estado`, `creado_en`.
- **Miembro**: Usuario que posee una Membresia activa en una Organizacion.
- **Rol**: conjunto nombrado de Permisos dentro de una Organizacion, con los campos `id`, `organizacion_id`, `nombre`, `es_sistema`, `creado_en`.
- **Rol_Propietario**: Rol de sistema con todos los Permisos, asignado automáticamente al creador de una Organizacion.
- **Permiso**: par `(seccion, accion)` que autoriza una operación concreta. Las secciones son `dashboard`, `inventario`, `ventas`, `fiadores`, `empleados`, `horarios`, `configuracion`, `usuarios`. Las acciones son `ver`, `crear`, `editar`, `eliminar`, `administrar`.
- **Invitacion**: entidad con los campos `id`, `organizacion_id`, `correo`, `rol_id`, `estado`, `token_hash`, `expira_en`, `invitado_por`, `creado_en`. Representa el ofrecimiento a un Correo para unirse a una Organizacion.
- **Estado_Invitacion**: enumeración con valores `pendiente`, `aceptada`, `expirada`, `revocada`.
- **Horario_Miembro**: asignación de turnos de una Membresia dentro de una Organizacion, con los campos `id`, `membresia_id`, `dia`, `hora_inicio`, `hora_fin`, `tipo`, `creado_en`.
- **Tipo_Horario**: enumeración con valores `normal`, `vacaciones`, `incapacidad`, `descanso`.
- **Usuario_Actual**: Usuario autenticado en la Sesion vigente del navegador.
- **Organizacion_Activa**: Organizacion seleccionada por el Usuario_Actual sobre la cual opera la aplicación tras el login.
- **Ventana_Flotante**: componente Dialog o Sheet de shadcn/ui que se abre por encima de la sección activa sin cambiar la URL.
- **Round_Trip_Token**: propiedad de que generar un token, transmitir su forma pública y luego validarlo resuelve a la misma entidad (Usuario o Invitacion) que lo originó, y solo a esa.

## Requirements

### Requisito 1: Modelo de datos de identidad y organizaciones

**User Story:** Como desarrollador, quiero un modelo de datos completo para usuarios, sesiones, organizaciones, membresías, roles, permisos, invitaciones y horarios, para garantizar la integridad referencial del control de accesos multi-inquilino.

#### Criterios de Aceptación

1. THE Capa_Datos SHALL definir la tabla `usuarios` con las columnas `id` (UUID, PK), `correo` (VARCHAR(255) UNIQUE NOT NULL), `nombre` (VARCHAR(160) NOT NULL), `hash_contrasena` (VARCHAR(255) NOT NULL), `correo_verificado` (BOOLEAN NOT NULL DEFAULT FALSE), `estado` (ENUM `pendiente`, `activo`, `suspendido` NOT NULL DEFAULT `pendiente`), `creado_en` (DATETIME NOT NULL), `actualizado_en` (DATETIME NOT NULL).
2. THE Capa_Datos SHALL definir la tabla `sesiones` con las columnas `id` (UUID, PK), `usuario_id` (UUID FK NOT NULL), `hash_sesion` (VARCHAR(255) UNIQUE NOT NULL), `expira_en` (DATETIME NOT NULL), `creado_en` (DATETIME NOT NULL).
3. THE Capa_Datos SHALL definir la tabla `tokens_verificacion` con las columnas `id` (UUID, PK), `usuario_id` (UUID FK NOT NULL), `token_hash` (VARCHAR(255) UNIQUE NOT NULL), `expira_en` (DATETIME NOT NULL), `consumido_en` (DATETIME NULL), `creado_en` (DATETIME NOT NULL).
4. THE Capa_Datos SHALL definir la tabla `organizaciones` con las columnas `id` (UUID, PK), `nombre` (VARCHAR(160) NOT NULL), `slug` (VARCHAR(80) UNIQUE NOT NULL), `creado_por` (UUID FK NOT NULL), `creado_en` (DATETIME NOT NULL), `actualizado_en` (DATETIME NOT NULL).
5. THE Capa_Datos SHALL definir la tabla `membresias` con las columnas `id` (UUID, PK), `usuario_id` (UUID FK NOT NULL), `organizacion_id` (UUID FK NOT NULL), `rol_id` (UUID FK NOT NULL), `estado` (ENUM `activa`, `suspendida` NOT NULL DEFAULT `activa`), `creado_en` (DATETIME NOT NULL), con un índice único compuesto sobre (`usuario_id`, `organizacion_id`).
6. THE Capa_Datos SHALL definir la tabla `roles` con las columnas `id` (UUID, PK), `organizacion_id` (UUID FK NOT NULL), `nombre` (VARCHAR(80) NOT NULL), `es_sistema` (BOOLEAN NOT NULL DEFAULT FALSE), `creado_en` (DATETIME NOT NULL), con un índice único compuesto sobre (`organizacion_id`, `nombre`).
7. THE Capa_Datos SHALL definir la tabla `permisos_rol` con las columnas `id` (UUID, PK), `rol_id` (UUID FK NOT NULL), `seccion` (VARCHAR(32) NOT NULL), `accion` (VARCHAR(32) NOT NULL), con un índice único compuesto sobre (`rol_id`, `seccion`, `accion`).
8. THE Capa_Datos SHALL definir la tabla `invitaciones` con las columnas `id` (UUID, PK), `organizacion_id` (UUID FK NOT NULL), `correo` (VARCHAR(255) NOT NULL), `rol_id` (UUID FK NOT NULL), `estado` (ENUM `pendiente`, `aceptada`, `expirada`, `revocada` NOT NULL DEFAULT `pendiente`), `token_hash` (VARCHAR(255) UNIQUE NOT NULL), `expira_en` (DATETIME NOT NULL), `invitado_por` (UUID FK NOT NULL), `creado_en` (DATETIME NOT NULL).
9. THE Capa_Datos SHALL definir la tabla `horarios_miembro` con las columnas `id` (UUID, PK), `membresia_id` (UUID FK NOT NULL), `dia` (TINYINT NOT NULL con rango entero de 0 a 6 inclusive), `hora_inicio` (VARCHAR(5) NULL, en formato 24 horas `HH:MM` con rango `00:00` a `23:59`), `hora_fin` (VARCHAR(5) NULL, en formato 24 horas `HH:MM` con rango `00:00` a `23:59`), `tipo` (ENUM `normal`, `vacaciones`, `incapacidad`, `descanso` NOT NULL), `creado_en` (DATETIME NOT NULL).
10. THE Capa_Datos SHALL definir migraciones Prisma versionadas en `prisma/migrations/` que creen estas tablas sin ejecutar operaciones que eliminen, renombren o modifiquen el tipo de tablas o columnas existentes del módulo `inventario-ventas-core`.
11. IF se intenta insertar o actualizar un registro cuyo valor en una columna FK (`usuario_id`, `organizacion_id`, `rol_id`, `membresia_id`, `creado_por`, `invitado_por`) no corresponde al `id` de un registro existente en la tabla referenciada, THEN THE Capa_Datos SHALL rechazar la operación, no persistir el registro y conservar sin cambios los datos existentes.
12. IF se intenta insertar o actualizar un registro que viola una restricción UNIQUE (incluyendo `correo`, `slug`, `hash_sesion`, `token_hash`, y los índices únicos compuestos sobre (`usuario_id`, `organizacion_id`), (`organizacion_id`, `nombre`) y (`rol_id`, `seccion`, `accion`)), THEN THE Capa_Datos SHALL rechazar la operación, no persistir el registro y conservar sin cambios los datos existentes.
13. WHEN se crea un registro en cualquiera de estas tablas, THE Capa_Datos SHALL asignar a `creado_en` la marca temporal UTC del instante de la operación y, en las tablas que definen `actualizado_en` (`usuarios`, `organizaciones`), asignar a `actualizado_en` la marca temporal UTC en la creación y en cada actualización posterior.

### Requisito 2: Registro de usuario

**User Story:** Como persona interesada, quiero registrarme con mi correo, nombre y contraseña, para crear una cuenta en InvenPro.

#### Criterios de Aceptación

1. WHEN el usuario abre la pantalla de Registro, THE Sistema_Acceso SHALL mostrar un formulario con los campos correo electrónico, nombre y contraseña construido con `react-hook-form` y validación Zod.
2. THE API_Backend SHALL validar el payload de registro con un esquema Zod que exija un correo con formato válido de hasta 254 caracteres, un nombre de 1 a 160 caracteres y una contraseña de 8 a 128 caracteres.
3. IF el payload de registro no cumple el esquema Zod, THEN THE API_Backend SHALL rechazar la solicitud con HTTP 422, no crear ningún Usuario y devolver una respuesta que indique cada campo inválido y su motivo.
4. WHEN el usuario envía datos de registro válidos para un Correo no registrado, THE API_Backend SHALL crear un Usuario con `estado = pendiente` y `correo_verificado = false`, y responder con HTTP 201.
5. WHEN se crea el Usuario, THE Sistema_Acceso SHALL almacenar la contraseña como un hash generado con un algoritmo de hashing adaptativo de contraseñas (bcrypt o argon2).
6. THE API_Backend SHALL omitir el campo `hash_contrasena` y cualquier otra representación de la contraseña en todas las respuestas que incluyan datos de un Usuario.
7. WHEN se crea el Usuario, THE Servicio_Correo SHALL enviar un correo de verificación en español que contenga un enlace con un Token_Verificacion válido durante 24 horas (86 400 segundos) a partir de su emisión.
8. IF el envío del correo de verificación falla, THEN THE Servicio_Correo SHALL conservar el Usuario creado con `estado = pendiente` y `correo_verificado = false`, marcar el envío como fallido y habilitar el reenvío posterior del correo de verificación.
9. THE Sistema_Acceso SHALL normalizar el Correo a minúsculas antes de validar unicidad y antes de persistirlo.
10. IF se intenta registrar un Correo ya existente, THEN THE API_Backend SHALL responder con HTTP 409 y el código de error `CORREO_DUPLICADO`.

### Requisito 3: Verificación de correo electrónico

**User Story:** Como usuario registrado, quiero confirmar la propiedad de mi correo mediante un enlace, para activar mi cuenta antes de poder iniciar sesión.

#### Criterios de Aceptación

1. THE Sistema_Acceso SHALL generar el Token_Verificacion como una cadena aleatoria criptográficamente segura de al menos 128 bits de entropía y SHALL persistir únicamente su hash en la columna `token_hash`.
2. THE Token_Verificacion SHALL tener una vigencia configurable mediante variable de entorno, expresada en horas, con un rango válido de 1 a 168 horas y un valor predeterminado de 24 horas.
3. IF la variable de entorno que define la vigencia del Token_Verificacion está ausente, vacía, no es numérica o queda fuera del rango de 1 a 168 horas, THEN THE Sistema_Acceso SHALL aplicar el valor predeterminado de 24 horas.
4. WHEN el usuario abre el enlace de verificación con un Token_Verificacion válido y no expirado, THE API_Backend SHALL marcar `correo_verificado = true`, establecer `estado = activo`, marcar el token como consumido y responder con HTTP 200.
5. WHEN un Token_Verificacion ya consumido se presenta y el Usuario asociado ya tiene `correo_verificado = true`, THE API_Backend SHALL responder con HTTP 200 sin alterar el estado del Usuario (idempotencia de verificación).
6. IF el Token_Verificacion no existe o ha expirado, THEN THE API_Backend SHALL responder con HTTP 400 y el código `TOKEN_INVALIDO`.
7. WHILE el Usuario tiene `correo_verificado = false`, THE Sistema_Acceso SHALL impedir el inicio de sesión respondiendo con HTTP 403 y el código `CORREO_NO_VERIFICADO`.
8. WHILE el Usuario tiene `correo_verificado = false`, THE Sistema_Acceso SHALL ofrecer la opción de reenviar el correo de verificación.
9. WHEN el usuario solicita reenviar la verificación y no ha superado el límite de 5 solicitudes por hora, THE Sistema_Acceso SHALL invalidar los Token_Verificacion previos no consumidos del Usuario, emitir uno nuevo y responder con HTTP 200.
10. IF el usuario solicita reenviar la verificación tras superar el límite de 5 solicitudes por hora, THEN THE Sistema_Acceso SHALL rechazar la solicitud, responder con HTTP 429 y el código `LIMITE_REENVIO_EXCEDIDO`, sin emitir un nuevo Token_Verificacion ni invalidar los existentes.

### Requisito 4: Inicio de sesión y gestión de sesión

**User Story:** Como usuario con cuenta activa, quiero iniciar sesión con mi correo y contraseña, para acceder a mis organizaciones de forma segura.

#### Criterios de Aceptación

1. WHEN el usuario envía un Correo y una contraseña que coinciden con un Usuario de `estado = activo`, THE Sistema_Acceso SHALL crear una Sesion, responder con HTTP 200 estableciendo una cookie de sesión `httpOnly`, `Secure` y `SameSite=Lax` cuyo tiempo de vida coincide con el periodo de inactividad de la Sesion, e incluir en el cuerpo los datos del Usuario_Actual excluyendo la contraseña.
2. THE Sesion SHALL expirar cuando el tiempo transcurrido desde la última solicitud autenticada del Usuario supere el periodo de inactividad configurable mediante variable de entorno, con un valor predeterminado de 7 días y un rango admitido de 1 hora a 30 días.
3. IF las credenciales no coinciden con ningún Usuario activo, THEN THE API_Backend SHALL responder con HTTP 401 y el código `CREDENCIALES_INVALIDAS` sin revelar si el Correo existe.
4. IF el Usuario tiene `estado = pendiente` por falta de verificación, THEN THE API_Backend SHALL responder con HTTP 403 y el código `CORREO_NO_VERIFICADO`.
5. WHEN el usuario cierra sesión, THE Sistema_Acceso SHALL invalidar en BD_MySQL la Sesion asociada a la cookie, eliminar la cookie de sesión y responder con HTTP 200, incluso si no existe una Sesion válida (operación idempotente).
6. WHEN se solicita el endpoint de Usuario_Actual con una cookie de sesión asociada a una Sesion válida y no expirada, THE Sistema_Acceso SHALL responder con HTTP 200 y los datos del Usuario_Actual excluyendo la contraseña.
7. IF se solicita el endpoint de Usuario_Actual sin cookie de sesión o con una cookie asociada a una Sesion inexistente, invalidada o expirada, THEN THE Sistema_Acceso SHALL responder con HTTP 401 y el código `SESION_INVALIDA`.
8. IF se acumulan 5 intentos de inicio de sesión fallidos consecutivos para el mismo Correo dentro de una ventana de 15 minutos, THEN THE API_Backend SHALL rechazar los intentos posteriores de ese Correo durante 15 minutos respondiendo con HTTP 429 y el código `DEMASIADOS_INTENTOS`, sin revelar si el Correo existe.

### Requisito 5: Pantalla de Login con sistema de diseño y marca negra

**User Story:** Como usuario, quiero una pantalla de Login coherente con el sistema de diseño, para reconocer la aplicación y autenticarme con comodidad.

#### Criterios de Aceptación

1. THE Sistema_Acceso SHALL renderizar la pantalla de Login usando exclusivamente componentes de `components/ui/` (Card, Form, Input, Button, Label) sin introducir nuevas librerías de UI.
2. THE Sistema_Acceso SHALL aplicar el token de color primario del tema, configurado en color negro, a los elementos de marca de la pantalla de Login (logotipo y título de la aplicación) y a los botones primarios, mediante las variables de tema y sin valores hex codificados en los componentes.
3. WHEN el usuario alterna entre el modo claro y el modo oscuro provisto por `next-themes`, THE Sistema_Acceso SHALL re-renderizar la pantalla de Login y la de Registro aplicando los tokens de color del tema correspondiente, sin colores fijos codificados.
4. THE Sistema_Acceso SHALL exponer todas las etiquetas, mensajes de error y textos de botón de Login y Registro en español.
5. THE Sistema_Acceso SHALL garantizar, conforme a WCAG 2.1 nivel AA, una relación de contraste mínima de 4.5:1 para el texto normal y de 3:1 para el texto grande (≥ 18 pt, o ≥ 14 pt en negrita) y los bordes de los controles, entre el contenido y su fondo, en las etiquetas, campos de entrada y botones de la pantalla de Login y de Registro, tanto en modo claro como en modo oscuro.
6. WHILE no exista una Sesion válida (sesión autenticada cuyo token no ha expirado), THE InvenPro SHALL mostrar la pantalla de Login en lugar de las secciones del producto.
7. WHILE exista una Sesion válida, THE InvenPro SHALL mostrar las secciones del producto y ocultar la pantalla de Login.
8. IF el usuario envía el formulario de Login o de Registro con uno o más campos vacíos o con formato inválido, THEN THE Sistema_Acceso SHALL mostrar un mensaje de error en español junto a cada campo afectado, mantener la pantalla visible y conservar los valores ya ingresados.

### Requisito 6: Configuración del envío de correo de costo cero

**User Story:** Como administrador del sistema, quiero configurar el envío de correo mediante variables de entorno con proveedores gratuitos, para operar la verificación e invitaciones sin incurrir en costos.

#### Criterios de Aceptación

1. THE Servicio_Correo SHALL leer su configuración de transporte desde variables de entorno (`SMTP_HOST`, `SMTP_PORT` entero de 1 a 65535, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM`, `SMTP_SECURE` booleano `true`/`false`) usando el protocolo SMTP estándar, sin depender de una API propietaria de pago.
2. THE Sistema_Acceso SHALL documentar en `.env.example` las variables del Servicio_Correo con valores de ejemplo para un proveedor de capa gratuita.
3. WHERE al menos una de las variables `SMTP_HOST`, `SMTP_USER` o `SMTP_PASSWORD` está ausente, THE Servicio_Correo SHALL registrar en la consola del servidor el destinatario, el asunto y el enlace del correo en lugar de enviarlo, y reportar la operación como exitosa, para permitir el desarrollo local sin costo.
4. IF el transporte SMTP devuelve un error o no responde dentro de 15 segundos, THEN THE API_Backend SHALL responder con HTTP 502 y el código `ENVIO_CORREO_FALLIDO`, conservar el token asociado para permitir un reintento posterior, y no revelar al cliente las credenciales del transporte.
5. THE Servicio_Correo SHALL construir los enlaces de verificación e invitación a partir de la variable de entorno `APP_URL` que define el origen público de la aplicación.
6. IF la variable de entorno `APP_URL` no está definida o está vacía al construir un enlace de correo, THEN THE API_Backend SHALL responder con el código `APP_URL_NO_CONFIGURADA` y registrar en consola un mensaje que indique la variable faltante, sin enviar el correo.

### Requisito 7: Listado y selección de organizaciones

**User Story:** Como usuario autenticado, quiero ver la lista de organizaciones a las que pertenezco y seleccionar una, para trabajar dentro de su contexto.

#### Criterios de Aceptación

1. WHEN el Usuario_Actual completa correctamente el inicio de sesión, THE Sistema_Organizaciones SHALL mostrar, en un máximo de 2 segundos, la lista de Organizaciones en las que tiene una Membresia activa, ordenada alfabéticamente (A-Z) por nombre de Organizacion, indicando para cada una su nombre y el Rol del Usuario_Actual en ella.
2. THE API_Backend SHALL exponer un endpoint que devuelva únicamente las Organizaciones en las que el Usuario_Actual posee una Membresia activa, excluyendo toda Organizacion con Membresia inactiva o revocada, y SHALL responder en menos de 500 ms p95 para un Usuario_Actual con hasta 100 Membresias.
3. WHEN el Usuario_Actual selecciona de la lista una Organizacion en la que mantiene una Membresia activa, THE Sistema_Organizaciones SHALL establecerla como Organizacion_Activa, conservar dicha selección mientras dure la sesión del Usuario_Actual, y mostrar únicamente las secciones del producto permitidas por los Permisos asociados a su Rol, ocultando las secciones no permitidas.
4. IF el Usuario_Actual no posee ninguna Membresia activa en ninguna Organizacion, THEN THE Sistema_Organizaciones SHALL mostrar únicamente la opción de crear una nueva Organizacion y la opción de aceptar invitaciones pendientes, sin mostrar ninguna sección del producto.
5. WHILE no exista una Organizacion_Activa seleccionada, THE InvenPro SHALL impedir el acceso a todas las secciones del producto y mostrar la pantalla de selección de Organizacion.
6. IF la consulta del listado de Organizaciones falla o la BD_MySQL no está disponible, THEN THE Sistema_Organizaciones SHALL mostrar un mensaje de error que indique que no se pudieron cargar las Organizaciones, ofrecer la opción de reintentar y no establecer ninguna Organizacion_Activa.
7. IF el Usuario_Actual selecciona una Organizacion en la que su Membresia ya no está activa, THEN THE Sistema_Organizaciones SHALL impedir establecerla como Organizacion_Activa, mostrar un mensaje de error que indique que la Membresia no está activa y refrescar la lista de Organizaciones.

### Requisito 8: Creación de organización y propietario único

**User Story:** Como usuario autenticado, quiero crear una organización, para administrar mi negocio y obtener automáticamente el rol de propietario.

#### Criterios de Aceptación

1. WHEN el Usuario_Actual envía el formulario de creación de Organizacion con un nombre válido, THE API_Backend SHALL crear la Organizacion dentro de una única transacción de base de datos y responder con HTTP 201 incluyendo el objeto Organizacion creado con al menos sus campos `id`, `nombre` y `slug`.
2. WHEN se crea una Organizacion, THE Sistema_Organizaciones SHALL crear el Rol_Propietario como Rol de sistema (`es_sistema = true`) con todos los Permisos y asignarlo al Usuario_Actual creador mediante una Membresia con `estado = activa`, dentro de la misma transacción.
3. THE Sistema_Organizaciones SHALL garantizar que, al completarse la creación, cada Organizacion tenga exactamente un (1) Rol_Propietario asignado a exactamente un (1) Miembro.
4. THE Sistema_Organizaciones SHALL generar el `slug` de la Organizacion como una cadena única, en minúsculas, compuesta únicamente por caracteres `a`–`z`, dígitos `0`–`9` y guiones, derivada del `nombre` y con una longitud máxima de 80 caracteres, anexando e incrementando un sufijo numérico entero (a partir de `2`) cuando el slug derivado ya exista, hasta obtener un valor no utilizado dentro del límite de 80 caracteres.
5. IF la transacción de creación falla en cualquier paso, THEN THE API_Backend SHALL revertir todos los cambios y responder con HTTP 500 y el código `ORGANIZACION_FALLIDA`, sin dejar Organizaciones, Roles ni Membresias huérfanas.
6. THE API_Backend SHALL validar el payload de creación con un esquema Zod que exija un `nombre` de 1 a 160 caracteres tras eliminar los espacios en blanco al inicio y al final.
7. IF el payload de creación no cumple el esquema Zod, THEN THE API_Backend SHALL rechazar la solicitud con HTTP 422 y un objeto `{ errores: [{ campo, mensaje }] }`, sin crear ninguna Organizacion, Rol ni Membresia.
8. IF una solicitud de creación de Organizacion no presenta una Sesion válida, THEN THE API_Backend SHALL responder con HTTP 401 y el código `NO_AUTENTICADO`, sin crear ninguna Organizacion.

### Requisito 9: Invitación de miembros por correo

**User Story:** Como propietario o miembro con permiso de administración, quiero invitar a otras personas por correo, para incorporarlas a mi organización con un rol asignado.

#### Criterios de Aceptación

1. WHERE el Usuario_Actual posee el Permiso (`usuarios`, `administrar`) en la Organizacion_Activa, THE Sistema_Organizaciones SHALL mostrar la acción de invitar a un nuevo Miembro.
2. WHEN el Usuario_Actual envía una invitación con un Correo de formato válido (normalizado a minúsculas) y un `rol_id` que corresponde a un Rol existente de la Organizacion_Activa, THE API_Backend SHALL crear una Invitacion con `estado = pendiente` asociada a ese Rol y responder con HTTP 201 incluyendo la Invitacion creada.
3. WHEN se crea una Invitacion, THE Servicio_Correo SHALL enviar al Correo invitado un mensaje en español con un enlace que contiene un Token_Invitacion.
4. THE Token_Invitacion SHALL generarse como una cadena aleatoria criptográficamente segura de al menos 128 bits de entropía, persistirse únicamente como hash y expirar en un periodo configurable mediante variable de entorno con valor predeterminado de 72 horas.
5. IF se intenta invitar a un Correo que ya posee una Membresia activa en la Organizacion_Activa, THEN THE API_Backend SHALL rechazar la operación, no crear ninguna Invitacion y responder con HTTP 409 y el código `MIEMBRO_EXISTENTE`.
6. IF ya existe una Invitacion en `estado = pendiente` para el mismo Correo y la misma Organizacion, THEN THE API_Backend SHALL regenerar su Token_Invitacion, restablecer su `expira_en` a una nueva ventana de expiración, mantener `estado = pendiente`, reenviar el correo y responder con HTTP 200, sin crear un registro duplicado.
7. WHEN el Usuario_Actual revoca una Invitacion en `estado = pendiente`, THE API_Backend SHALL establecer `estado = revocada`, invalidar su Token_Invitacion y responder con HTTP 200.
8. IF la invitación se envía con un Correo de formato inválido, THEN THE API_Backend SHALL rechazar la operación, no crear ninguna Invitacion y responder con HTTP 422 incluyendo el array de errores por campo.
9. IF la invitación se envía con un `rol_id` que no corresponde a ningún Rol de la Organizacion_Activa, THEN THE API_Backend SHALL rechazar la operación, no crear ninguna Invitacion y responder con HTTP 400 y el código `ROL_FUERA_DE_ORGANIZACION`.
10. IF el Usuario_Actual intenta revocar una Invitacion que no está en `estado = pendiente`, THEN THE API_Backend SHALL responder con HTTP 409 y el código `INVITACION_NO_PENDIENTE`, sin alterar su estado.

### Requisito 10: Aceptación de invitación

**User Story:** Como persona invitada, quiero aceptar la invitación desde el enlace del correo, para unirme a la organización con el rol que me asignaron.

#### Criterios de Aceptación

1. WHEN un invitado abre un enlace con un Token_Invitacion existente, no expirado (fecha actual ≤ `expira_en`) y con `estado = pendiente`, THE Sistema_Organizaciones SHALL mostrar el nombre de la Organizacion y el Rol ofrecido antes de confirmar.
2. WHEN un invitado autenticado cuyo Correo normalizado a minúsculas coincide con el Correo de la Invitacion confirma la aceptación, THE API_Backend SHALL crear una Membresia con `estado = activa` y el Rol de la Invitacion, y establecer `estado = aceptada` de la Invitacion, dentro de una única transacción, y responder con HTTP 200.
3. WHEN una Invitacion ya aceptada se procesa nuevamente para un Correo que ya posee la Membresia correspondiente, THE API_Backend SHALL responder con HTTP 200 sin crear una Membresia adicional (idempotencia de aceptación).
4. IF el Token_Invitacion no existe, ha expirado o su `estado` es `revocada`, THEN THE API_Backend SHALL responder con HTTP 400 y el código `INVITACION_INVALIDA`.
5. IF la fecha actual supera `expira_en` de una Invitacion en `estado = pendiente`, THEN THE API_Backend SHALL establecer su `estado = expirada`, rechazar su aceptación y responder con HTTP 400 y el código `INVITACION_INVALIDA`.
6. IF el Correo del invitado no corresponde a ningún Usuario, THEN THE Sistema_Organizaciones SHALL dirigir al invitado al Registro conservando el Token_Invitacion para completar la aceptación tras verificar su Correo.
7. IF el Correo normalizado a minúsculas del Usuario_Actual no coincide con el Correo de la Invitacion, THEN THE API_Backend SHALL responder con HTTP 403 y el código `INVITACION_OTRO_CORREO`.
8. IF la transacción de aceptación falla en cualquier paso, THEN THE API_Backend SHALL revertir todos los cambios y responder con HTTP 500 y el código `ACEPTACION_FALLIDA`, sin crear Membresias ni alterar el `estado` de la Invitacion.

### Requisito 11: Modelo de roles y permisos granulares

**User Story:** Como propietario, quiero definir roles con permisos por sección y acción, para controlar con precisión qué puede hacer cada miembro.

#### Criterios de Aceptación

1. THE Sistema_Organizaciones SHALL modelar cada Permiso como el par (`seccion`, `accion`), donde `seccion` pertenece al conjunto {`dashboard`, `inventario`, `ventas`, `fiadores`, `empleados`, `horarios`, `configuracion`, `usuarios`} y `accion` pertenece al conjunto {`ver`, `crear`, `editar`, `eliminar`, `administrar`}.
2. THE Rol_Propietario SHALL incluir todos los Permisos definidos para todas las secciones.
3. WHERE el Usuario_Actual posee el Permiso (`usuarios`, `administrar`) en la Organizacion_Activa, THE Sistema_Organizaciones SHALL permitir crear, editar y eliminar Roles distintos del Rol_Propietario y editar su conjunto de Permisos, donde cada Rol tiene un `nombre` de 1 a 80 caracteres único dentro de la Organizacion_Activa y un conjunto de Permisos contenido en los conjuntos definidos en el criterio 1.
4. IF el Usuario_Actual intenta crear, editar o eliminar un Rol sin poseer el Permiso (`usuarios`, `administrar`) en la Organizacion_Activa, THEN THE API_Backend SHALL rechazar la operación con HTTP 403 y el código `PERMISO_DENEGADO`, sin alterar ningún Rol.
5. IF se intenta crear o editar un Rol con un `nombre` fuera del rango de 1 a 80 caracteres, un `nombre` duplicado dentro de la Organizacion_Activa, o un Permiso fuera de los conjuntos definidos en el criterio 1, THEN THE API_Backend SHALL rechazar la operación con HTTP 400 y el código `ROL_INVALIDO`, sin alterar ningún Rol.
6. IF el Usuario_Actual intenta editar o eliminar el Rol_Propietario, THEN THE API_Backend SHALL rechazar la operación con HTTP 409 y el código `ROL_PROPIETARIO_PROTEGIDO`, sin alterar el Rol_Propietario.
7. IF una operación dejaría a la Organizacion sin ningún Miembro con el Rol_Propietario, THEN THE API_Backend SHALL rechazar la operación con HTTP 409 y el código `PROPIETARIO_REQUERIDO`, sin aplicar el cambio.
8. WHEN el Usuario_Actual asigna un Rol a una Membresia, THE API_Backend SHALL actualizar la Membresia y responder con HTTP 200.
9. THE API_Backend SHALL validar que el Rol asignado a una Membresia pertenezca a la misma Organizacion de la Membresia y, en caso contrario, responder con HTTP 400 y el código `ROL_FUERA_DE_ORGANIZACION`.
10. THE API_Backend SHALL evaluar los Permisos del Usuario_Actual siempre del lado del servidor antes de ejecutar cualquier operación protegida, con independencia de lo que muestre la interfaz.

### Requisito 12: Control de acceso en la interfaz por permisos

**User Story:** Como miembro de una organización, quiero ver solo las secciones y acciones para las que tengo permiso, para no acceder a funciones que no me corresponden.

#### Criterios de Aceptación

1. WHILE existe una Organizacion_Activa, THE InvenPro SHALL mostrar en el `Sidebar` únicamente las secciones para las que el Usuario_Actual posee el Permiso (`seccion`, `ver`), y SHALL omitir del `Sidebar` toda sección para la que el Usuario_Actual carezca de dicho Permiso.
2. WHEN el Usuario_Actual intenta establecer `activeSection` en una sección para la que no posee el Permiso (`seccion`, `ver`), THE InvenPro SHALL impedir el renderizado del contenido de esa sección y SHALL mantener mostrada la sección permitida que estaba activa previamente.
3. IF el Usuario_Actual carece del Permiso (`seccion`, `crear`), (`seccion`, `editar`) o (`seccion`, `eliminar`) de la sección mostrada, THEN THE InvenPro SHALL ocultar (no renderizar) el control correspondiente a cada Permiso ausente.
4. IF la API_Backend recibe una solicitud a un endpoint de una sección para la que el Usuario_Actual no posee el Permiso requerido, THEN THE API_Backend SHALL rechazar la solicitud con HTTP 403 y el código `PERMISO_DENEGADO` sin modificar ningún dato.
5. WHEN la interfaz solicita los Permisos del Usuario_Actual, THE Sistema_Acceso SHALL exponer un endpoint que devuelva el conjunto de Permisos del Usuario_Actual en la Organizacion_Activa y SHALL responder en menos de 500 ms p95.
6. WHEN InvenPro carga la interfaz con una Organizacion_Activa, THE InvenPro SHALL establecer `activeSection` en la primera sección, según el orden de aparición en el `Sidebar`, para la que el Usuario_Actual posea el Permiso (`seccion`, `ver`).
7. IF el Usuario_Actual no posee el Permiso (`seccion`, `ver`) de ninguna sección, THEN THE InvenPro SHALL mostrar un mensaje indicando que no hay secciones disponibles y SHALL no renderizar el contenido de ninguna sección.

### Requisito 13: Aislamiento multi-inquilino de datos

**User Story:** Como propietario, quiero que los datos de mi organización estén aislados de los de otras organizaciones, para proteger la confidencialidad de mi negocio.

#### Criterios de Aceptación

1. THE Capa_Datos SHALL asociar las entidades de negocio del módulo `inventario-ventas-core` (productos, categorías, movimientos de stock, ventas, ítems de venta y configuración) a una Organizacion mediante una columna `organizacion_id` declarada NOT NULL con clave foránea a la tabla de organizaciones.
2. WHEN la API_Backend atiende una solicitud de lectura sobre datos de negocio, THE API_Backend SHALL devolver exclusivamente los registros cuyo `organizacion_id` coincide con la Organizacion_Activa del Usuario_Actual.
3. IF el Usuario_Actual solicita un recurso de negocio que pertenece a una Organizacion distinta de su Organizacion_Activa, THEN THE API_Backend SHALL responder con HTTP 404 y el código `RECURSO_NO_ENCONTRADO`, sin revelar la existencia del recurso.
4. THE Capa_Datos SHALL definir migraciones que añadan `organizacion_id` a las tablas de negocio existentes y un índice secundario sobre dicha columna en cada tabla.
5. THE API_Backend SHALL derivar la Organizacion_Activa exclusivamente de la Sesion del servidor del Usuario_Actual.
6. WHEN la API_Backend crea o modifica un recurso de negocio, THE API_Backend SHALL asignar el `organizacion_id` del recurso igual a la Organizacion_Activa del Usuario_Actual.
7. IF una solicitud incluye un `organizacion_id` proporcionado por el cliente, THEN THE API_Backend SHALL ignorar dicho valor y usar la Organizacion_Activa derivada de la Sesion.
8. IF el Usuario_Actual no tiene una Membresia activa que determine una Organizacion_Activa, THEN THE API_Backend SHALL rechazar la solicitud sobre datos de negocio con el código `SIN_ORGANIZACION_ACTIVA`, sin exponer datos de ninguna Organizacion.

### Requisito 14: Asignación de horarios a miembros

**User Story:** Como propietario o miembro con permiso, quiero asignar horarios a los miembros de mi organización, para planificar turnos, vacaciones, incapacidades y descansos.

#### Criterios de Aceptación

1. WHERE el Usuario_Actual posee el Permiso (`horarios`, `crear`) o (`horarios`, `editar`) en la Organizacion_Activa, THE Sistema_Organizaciones SHALL permitir asignar o modificar un Horario_Miembro a una Membresia de esa Organizacion.
2. WHEN el Usuario_Actual asigna un Horario_Miembro cuyo `dia` es un entero de 0 a 6, cuyo `tipo` pertenece al conjunto {`normal`, `vacaciones`, `incapacidad`, `descanso`} y cuyos `hora_inicio` y `hora_fin`, cuando se proporcionan, cumplen el formato de 24 horas `HH:MM` (de `00:00` a `23:59`), THE API_Backend SHALL persistir el registro asociado a la Membresia indicada y responder con HTTP 201.
3. THE API_Backend SHALL validar que la Membresia destino del Horario_Miembro pertenezca a la Organizacion_Activa y, en caso contrario, responder con HTTP 400 y el código `MEMBRESIA_FUERA_DE_ORGANIZACION`.
4. THE Sistema_Organizaciones SHALL clasificar cada Horario_Miembro con un Tipo_Horario del conjunto {`normal`, `vacaciones`, `incapacidad`, `descanso`}, alineado con la leyenda existente de la sección Horarios.
5. IF un Horario_Miembro de tipo `normal` define `hora_inicio` y `hora_fin` y `hora_fin` no es posterior a `hora_inicio`, THEN THE API_Backend SHALL rechazar la operación con HTTP 422 sin persistir el registro e indicar el campo inválido.
6. WHEN la sección Horarios se renderiza para la Organizacion_Activa, THE Sistema_Organizaciones SHALL mostrar los Horario_Miembro persistidos de cada Membresia activa en lugar de los datos mock actuales.
7. THE Sistema_Organizaciones SHALL conectar la sección Empleados con las Membresias de la Organizacion_Activa, mostrando cada Miembro con su Rol y su estado en lugar de los datos mock actuales.
8. IF un Horario_Miembro presenta un `dia` fuera del rango 0 a 6, un `tipo` fuera del conjunto {`normal`, `vacaciones`, `incapacidad`, `descanso`}, o un `hora_inicio` o `hora_fin` que no cumple el formato de 24 horas `HH:MM`, THEN THE API_Backend SHALL rechazar la operación con HTTP 422 sin persistir el registro e indicar el campo inválido.
9. IF un Horario_Miembro de tipo `normal` omite `hora_inicio` o `hora_fin`, THEN THE API_Backend SHALL rechazar la operación con HTTP 422 sin persistir el registro e indicar el campo faltante.
10. WHEN el Usuario_Actual modifica un Horario_Miembro existente de la Organizacion_Activa con datos que cumplen las validaciones de `dia`, `tipo`, `hora_inicio` y `hora_fin`, THE API_Backend SHALL actualizar el registro y responder con HTTP 200.

### Requisito 15: Endpoints de la API de Usuarios y Accesos

**User Story:** Como desarrollador, quiero endpoints REST consistentes para autenticación, organizaciones, invitaciones, roles y horarios, para integrarlos desde el frontend con tipos compartidos.

#### Criterios de Aceptación

1. THE API_Backend SHALL exponer `POST /api/auth/registro`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/sesion`, `POST /api/auth/verificar-correo` y `POST /api/auth/reenviar-verificacion`.
2. THE API_Backend SHALL exponer `GET /api/organizaciones`, `POST /api/organizaciones` y `GET /api/organizaciones/{id}/miembros`.
3. THE API_Backend SHALL exponer `POST /api/organizaciones/{id}/invitaciones`, `GET /api/organizaciones/{id}/invitaciones`, `POST /api/invitaciones/aceptar` y `DELETE /api/invitaciones/{id}`.
4. THE API_Backend SHALL exponer `GET /api/organizaciones/{id}/roles`, `POST /api/organizaciones/{id}/roles`, `PATCH /api/roles/{id}`, `DELETE /api/roles/{id}` y `PATCH /api/membresias/{id}`.
5. THE API_Backend SHALL exponer `GET /api/organizaciones/{id}/horarios`, `POST /api/organizaciones/{id}/horarios`, `PATCH /api/horarios/{id}` y `DELETE /api/horarios/{id}`.
6. THE API_Backend SHALL exponer `GET /api/permisos` que devuelva los Permisos del Usuario_Actual en la Organizacion_Activa.
7. THE API_Backend SHALL validar todas las entradas con esquemas Zod y rechazar payloads con errores de validación devolviendo HTTP 422 y un objeto `{ errores: [{ campo, mensaje }] }`.
8. THE API_Backend SHALL responder con `Content-Type: application/json; charset=utf-8` en todos los endpoints.

### Requisito 16: Seguridad de tokens, sesiones y límites de tasa

**User Story:** Como administrador del sistema, quiero protecciones de seguridad en autenticación y tokens, para reducir el riesgo de abuso y accesos no autorizados.

#### Criterios de Aceptación

1. THE Sistema_Acceso SHALL almacenar Token_Verificacion, Token_Invitacion y el identificador de Sesion únicamente como hash en BD_MySQL, nunca en texto plano.
2. WHEN la fecha actual supera `expira_en` de un token o de una Sesion, THE API_Backend SHALL tratarlo como inválido y rechazar la operación asociada.
3. THE API_Backend SHALL aplicar un límite de tasa básico a los endpoints `POST /api/auth/login` y `POST /api/auth/registro`, rechazando solicitudes que excedan un umbral configurable por dirección de origen con HTTP 429 y el código `DEMASIADOS_INTENTOS`.
4. IF una solicitud a un endpoint protegido no presenta una Sesion válida, THEN THE API_Backend SHALL responder con HTTP 401 y el código `NO_AUTENTICADO`.
5. THE Sistema_Acceso SHALL emitir respuestas de error de autenticación que no revelen si un Correo está registrado, para mitigar la enumeración de cuentas.
6. THE Sistema_Acceso SHALL invalidar todas las Sesiones activas de un Usuario cuando su contraseña se modifique.

### Requisito 17: Notificaciones, accesibilidad e internacionalización

**User Story:** Como usuario, quiero retroalimentación clara y una interfaz accesible en español, para gestionar accesos de forma eficiente.

#### Criterios de Aceptación

1. THE Sistema_Acceso SHALL emitir notificaciones toast con `sonner` para registro, verificación, inicio de sesión, cierre de sesión y errores de autenticación.
2. THE Sistema_Organizaciones SHALL emitir notificaciones toast para creación de Organizacion, envío de Invitacion, aceptación de Invitacion, asignación de Rol y asignación de Horario_Miembro.
3. THE Sistema_Acceso SHALL exponer todas las etiquetas, mensajes de error y textos de botón de esta funcionalidad en español.
4. THE Sistema_Organizaciones SHALL renderizar las acciones de invitar, asignar Rol y asignar Horario_Miembro en Ventana_Flotante de shadcn con cierre por tecla `Escape` y overlay heredados.
5. THE Sistema_Acceso SHALL asignar atributos `aria-label` descriptivos a los iconos-botón de la funcionalidad (invitar, revocar, asignar rol, asignar horario).
6. THE Sistema_Acceso SHALL garantizar contraste mínimo AA (relación 4.5:1) entre texto y fondo en los estados de los Badge de Estado_Invitacion y de Rol.

### Requisito 18: Coherencia con el sistema de diseño y la estructura del proyecto

**User Story:** Como usuario, quiero que las nuevas pantallas respeten el sistema de diseño y la arquitectura actuales, para mantener una experiencia visual y técnica coherente.

#### Criterios de Aceptación

1. THE Sistema_Acceso SHALL usar exclusivamente componentes shadcn/ui presentes en `components/ui/` sin introducir nuevas librerías de UI.
2. THE Sistema_Organizaciones SHALL usar las variables de color del tema (`bg-card`, `text-foreground`, `bg-primary`, etc.) sin valores hex codificados.
3. THE Sistema_Acceso SHALL conservar la navegación de página única basada en `activeSection` de `app/page.tsx`, integrando el Login y la selección de Organizacion como estados previos a la visualización de las secciones.
4. THE Sistema_Organizaciones SHALL ubicar las nuevas vistas en `components/sections/` y `components/usuarios/`, y los formularios SHALL usar `react-hook-form` con `@hookform/resolvers/zod`.
5. THE Sistema_Acceso SHALL agregar la sección `usuarios` (gestión de usuarios, roles e invitaciones) al `Sidebar` y al `switch` de `renderSection()`, visible solo con el Permiso (`usuarios`, `ver`).

## Propiedades de Correctitud (Property-Based Testing)

Las siguientes propiedades se identifican como candidatas a verificación mediante pruebas basadas en propiedades. Cada una se ejecuta contra la lógica propia del código (hashing, generación y validación de tokens, evaluación de permisos, transacciones de dominio) usando dependencias en memoria o simuladas; la integración real con SMTP y BD_MySQL se valida aparte con pruebas de integración de 1 a 3 ejemplos representativos.

1. **Round-trip de tokens (Round_Trip_Token)**: para todo Token_Verificacion y Token_Invitacion generado, validar su forma pública resuelve a la misma entidad que lo originó y a ninguna otra. Cubre los Requisitos 3.1, 9.4 y 16.1.
2. **Round-trip de hashing de contraseña**: para toda contraseña válida, verificar la contraseña original contra su hash devuelve verdadero, y verificar cualquier contraseña distinta devuelve falso. Cubre el Requisito 2.4.
3. **Idempotencia de verificación de correo**: aplicar la verificación con un token consumido sobre un Usuario ya verificado deja el estado del Usuario sin cambios. Cubre el Requisito 3.4.
4. **Idempotencia de aceptación de invitación**: aceptar dos o más veces una misma Invitacion para el mismo Correo produce como máximo una Membresia. Cubre el Requisito 10.3.
5. **Invariante de control de acceso**: para todo conjunto de Permisos que no incluya (`seccion`, `ver`), el Usuario_Actual nunca obtiene acceso a esa sección ni a sus endpoints. Cubre los Requisitos 12.2 y 12.4.
6. **Unicidad de propietario al crear organización**: para toda Organizacion creada, existe exactamente un Rol_Propietario asignado al creador, y nunca cero ni más de uno tras la transacción de creación. Cubre los Requisitos 8.2 y 8.3.
7. **Invariante de aislamiento multi-inquilino**: para todo Usuario_Actual y toda consulta de datos de negocio, el conjunto de resultados está contenido en la Organizacion_Activa y nunca incluye recursos de otra Organizacion. Cubre los Requisitos 13.2 y 13.3.
8. **Invariante de expiración de tokens y sesiones**: para toda fecha posterior a `expira_en`, la validación del token o de la Sesion correspondiente siempre falla. Cubre el Requisito 16.2.
9. **Coherencia rol-organización**: para toda asignación de Rol a una Membresia, la operación tiene éxito si y solo si el Rol y la Membresia pertenecen a la misma Organizacion. Cubre el Requisito 11.6.
10. **Condiciones de error de entrada**: para toda entrada inválida (correo mal formado, contraseña corta, horario con `hora_fin` no posterior a `hora_inicio`), la API_Backend siempre señala el error con el código y el estado HTTP definidos, sin persistir cambios. Cubre los Requisitos 2.2, 14.5 y 15.7.
