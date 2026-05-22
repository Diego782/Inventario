# Requirements Document

## Introduction

Esta especificación define el desarrollo e integración de extremo a extremo de los módulos **Inventario** y **Ventas** de la aplicación InvenPro. El alcance incluye la persistencia en una base de datos MySQL contenerizada, una capa de backend implementada con Route Handlers de Next.js (TypeScript) que reutiliza tipos y validaciones con Zod, la integración con el sistema de diseño existente (shadcn/ui, ventanas flotantes), y el soporte de hardware periférico: impresora de etiquetas de código de barras y lector de código de barras tipo USB-HID.

El módulo de **Inventario** debe soportar el ciclo de vida completo de productos (alta, edición, baja, búsqueda, filtrado), control de stock con alertas visuales (En Stock / Bajo Stock / Crítico), generación e impresión de etiquetas con código de barras, y trazabilidad de movimientos de stock.

El módulo de **Ventas** debe soportar la creación de una venta mediante escaneo continuo de códigos de barras (modo manos libres), edición de cantidades, cálculo de subtotal/impuestos/total, selección de método de pago (incluyendo fiado), persistencia atómica de la venta junto con el descuento de stock, y emisión de un ticket imprimible.

Todas las acciones de creación, edición y vista de detalle se realizan en **ventanas flotantes** (Dialog/Sheet de shadcn) sin abandonar la sección actual, conservando la navegación de página única ya implementada en `app/page.tsx`.

## Glossary

- **InvenPro**: aplicación cliente Next.js 16 + React 19 que aloja los módulos Inventario y Ventas.
- **Sistema_Inventario**: subsistema responsable del CRUD de productos, control de stock, categorías y movimientos.
- **Sistema_Ventas**: subsistema responsable del registro de ventas, carrito activo, cobro y emisión de ticket.
- **API_Backend**: capa de Route Handlers de Next.js bajo `app/api/**/route.ts` que expone endpoints REST/JSON validados con Zod.
- **BD_MySQL**: instancia MySQL 8 ejecutada en Docker mediante `docker-compose.yml` definida para entornos de desarrollo y producción.
- **Capa_Datos**: módulo de acceso a datos basado en Prisma ORM que mapea el esquema relacional a tipos TypeScript.
- **Producto**: entidad con los campos: `id`, `sku`, `codigo_barras`, `nombre`, `categoria_id`, `precio_compra`, `precio_venta`, `stock_actual`, `stock_minimo`, `unidad`, `activo`, `creado_en`, `actualizado_en`.
- **SKU**: identificador interno del producto, único, formato libre alfanumérico (máx. 32 caracteres).
- **Codigo_Barras**: cadena numérica o alfanumérica imprimible y escaneable. Formato soportado: EAN-13 (13 dígitos) y Code128 (alfanumérico, hasta 48 caracteres).
- **Categoria**: agrupación lógica de productos con `id` y `nombre` único.
- **Movimiento_Stock**: registro de cambio de stock con `id`, `producto_id`, `tipo` (entrada, salida, merma, devolucion, ajuste, venta), `cantidad`, `stock_resultante`, `motivo`, `usuario_id`, `referencia_id`, `creado_en`.
- **Estado_Stock**: clasificación calculada del producto: `En Stock` (stock_actual > stock_minimo), `Bajo Stock` (0 < stock_actual ≤ stock_minimo), `Crítico` (stock_actual = 0 o stock_actual ≤ stock_minimo × 0.3).
- **Lector_Codigo**: dispositivo USB-HID que emula teclado y emite los caracteres del código seguido de `Enter`.
- **Impresora_Etiquetas**: impresora térmica de etiquetas accesible desde el navegador mediante `window.print()` con CSS específico para tamaño de etiqueta.
- **Carrito_Venta**: estructura de datos en memoria del cliente que contiene los ítems escaneados, cantidades, subtotal, impuestos y total de la venta en curso.
- **Ticket**: documento imprimible que resume la venta con folio, fecha, ítems, subtotal, impuestos, total, método de pago.
- **Folio_Venta**: identificador legible y único de la venta con formato `VTA-AAAAMMDD-NNNN`.
- **Impuesto**: porcentaje configurable aplicado al subtotal (por ejemplo, 16% IVA), parametrizable en configuración.
- **Metodo_Pago**: enumeración con valores: `efectivo`, `tarjeta`, `transferencia`, `fiado`.
- **Ventana_Flotante**: componente Dialog o Sheet de shadcn/ui que se abre por encima de la sección activa sin cambiar la URL.
- **Round_Trip_Codigo**: propiedad de que generar un código de barras y luego escanearlo (parsearlo) produce el mismo identificador de producto.

## Requirements

### Requisito 1: Infraestructura de base de datos contenerizada

**User Story:** Como administrador del sistema, quiero ejecutar la base de datos en un contenedor Docker reproducible, para poder levantar el entorno de desarrollo con un solo comando y mantener consistencia entre máquinas.

#### Criterios de Aceptación

1. THE Sistema_Inventario SHALL incluir un archivo `docker-compose.yml` en la raíz del proyecto que defina un servicio `mysql` basado en la imagen oficial `mysql:8.0`.
2. THE Sistema_Inventario SHALL incluir un archivo `.env.example` con las variables `DATABASE_URL`, `MYSQL_ROOT_PASSWORD`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`.
3. WHEN el comando `docker compose up -d` se ejecuta con un `.env` válido, THE BD_MySQL SHALL aceptar conexiones en el puerto 3306 dentro de los 30 segundos.
4. THE BD_MySQL SHALL persistir los datos en un volumen Docker nombrado `invenpro_mysql_data`.
5. THE Sistema_Inventario SHALL definir migraciones versionadas mediante Prisma en el directorio `prisma/migrations/`.
6. WHEN el comando `pnpm prisma migrate deploy` se ejecuta contra una BD_MySQL vacía, THE Capa_Datos SHALL crear todas las tablas del esquema sin errores.
7. IF la variable `DATABASE_URL` no está definida al iniciar la API_Backend, THEN THE API_Backend SHALL retornar el error `MISSING_DATABASE_URL` y registrar un mensaje en consola indicando la variable faltante.

### Requisito 2: Modelo de datos del producto

**User Story:** Como administrador, quiero un modelo de producto completo y validado, para garantizar la integridad de los datos del catálogo.

#### Criterios de Aceptación

1. THE Capa_Datos SHALL definir la tabla `productos` con las columnas `id` (UUID, PK), `sku` (VARCHAR(32) UNIQUE NOT NULL), `codigo_barras` (VARCHAR(48) UNIQUE NULL), `nombre` (VARCHAR(160) NOT NULL), `categoria_id` (UUID FK NULL), `precio_compra` (DECIMAL(12,2) NOT NULL DEFAULT 0), `precio_venta` (DECIMAL(12,2) NOT NULL), `stock_actual` (INT NOT NULL DEFAULT 0), `stock_minimo` (INT NOT NULL DEFAULT 0), `unidad` (VARCHAR(16) NOT NULL DEFAULT 'unidad'), `activo` (BOOLEAN NOT NULL DEFAULT TRUE), `creado_en` (DATETIME NOT NULL), `actualizado_en` (DATETIME NOT NULL).
2. THE Capa_Datos SHALL definir la tabla `categorias` con las columnas `id` (UUID, PK), `nombre` (VARCHAR(80) UNIQUE NOT NULL), `creado_en` (DATETIME NOT NULL).
3. THE API_Backend SHALL validar el payload de Producto con un esquema Zod que rechace `precio_venta` menor que 0, `stock_actual` menor que 0 y `stock_minimo` menor que 0.
4. IF se intenta crear un Producto con un `sku` ya existente, THEN THE API_Backend SHALL responder con HTTP 409 y el código de error `SKU_DUPLICADO`.
5. IF se intenta crear un Producto con un `codigo_barras` ya existente, THEN THE API_Backend SHALL responder con HTTP 409 y el código de error `CODIGO_BARRAS_DUPLICADO`.
6. THE Capa_Datos SHALL definir un índice único compuesto sobre `codigo_barras` que permita valores NULL.

### Requisito 3: Crear producto desde ventana flotante

**User Story:** Como administrador, quiero crear un producto desde una ventana flotante en la sección Inventario, para no perder el contexto de la lista actual.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en el botón "Nuevo Producto" de la sección Inventario, THE Sistema_Inventario SHALL abrir una Ventana_Flotante de tipo Dialog con el formulario de alta.
2. THE Ventana_Flotante de alta SHALL contener los campos: nombre, SKU, código de barras, categoría, precio de compra, precio de venta, stock inicial, stock mínimo, unidad.
3. WHERE el campo `codigo_barras` se deja vacío, THE Sistema_Inventario SHALL generar automáticamente un código EAN-13 válido al guardar.
4. WHEN el usuario envía el formulario con datos válidos, THE API_Backend SHALL crear el Producto y responder con HTTP 201 incluyendo el objeto creado.
5. WHEN la creación es exitosa, THE Sistema_Inventario SHALL cerrar la Ventana_Flotante, mostrar una notificación toast con el texto "Producto creado" y refrescar la tabla de productos.
6. IF la validación del formulario falla, THEN THE Sistema_Inventario SHALL mostrar los mensajes de error junto a cada campo afectado y mantener la Ventana_Flotante abierta.

### Requisito 4: Editar producto desde ventana flotante

**User Story:** Como administrador, quiero editar los datos de un producto desde una ventana flotante, para corregir información sin navegar a otra pantalla.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en el icono de editar de una fila, THE Sistema_Inventario SHALL abrir una Ventana_Flotante con los campos precargados del Producto seleccionado.
2. WHEN el usuario envía cambios válidos, THE API_Backend SHALL actualizar el Producto y responder con HTTP 200 incluyendo el objeto actualizado.
3. THE API_Backend SHALL rechazar cambios al campo `stock_actual` desde el endpoint de edición de producto y responder con HTTP 400 y el código `USAR_AJUSTE_STOCK`.
4. WHEN la actualización es exitosa, THE Sistema_Inventario SHALL cerrar la Ventana_Flotante, mostrar una notificación toast con el texto "Producto actualizado" y refrescar la fila correspondiente.

### Requisito 5: Eliminar producto con confirmación

**User Story:** Como administrador, quiero eliminar un producto con confirmación previa, para evitar borrados accidentales del catálogo.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en el icono de eliminar, THE Sistema_Inventario SHALL abrir un AlertDialog de confirmación que muestre el nombre y el SKU del Producto.
2. WHEN el usuario confirma la eliminación, THE API_Backend SHALL marcar el Producto como `activo = false` y responder con HTTP 200.
3. THE Sistema_Inventario SHALL excluir de la tabla los productos con `activo = false` por defecto.
4. IF el Producto tiene Movimiento_Stock asociado de tipo `venta`, THEN THE API_Backend SHALL realizar borrado lógico (soft delete) y conservar el historial.

### Requisito 6: Búsqueda y filtrado del catálogo

**User Story:** Como administrador, quiero buscar y filtrar productos por nombre, SKU, código de barras, categoría y estado de stock, para encontrar rápidamente lo que necesito.

#### Criterios de Aceptación

1. WHEN el usuario escribe en el campo de búsqueda, THE Sistema_Inventario SHALL filtrar la tabla por coincidencia parcial en `nombre`, `sku` o `codigo_barras` con un debounce de 300 ms.
2. WHEN el usuario aplica un filtro de categoría, THE API_Backend SHALL devolver únicamente los productos cuya `categoria_id` coincide.
3. WHEN el usuario aplica un filtro de Estado_Stock, THE API_Backend SHALL devolver únicamente los productos cuyo Estado_Stock calculado coincide con el filtro.
4. THE API_Backend SHALL paginar los resultados con un tamaño de página predeterminado de 20 y permitir los valores 10, 20, 50 y 100.
5. WHEN una consulta paginada se ejecuta sobre un catálogo de hasta 10 000 productos, THE API_Backend SHALL responder en menos de 500 ms p95.

### Requisito 7: Cálculo del estado de stock

**User Story:** Como administrador, quiero ver de un vistazo el estado de stock de cada producto, para identificar reposiciones urgentes.

#### Criterios de Aceptación

1. THE Sistema_Inventario SHALL calcular Estado_Stock como `Crítico` cuando `stock_actual = 0` o `stock_actual ≤ stock_minimo × 0.3`.
2. THE Sistema_Inventario SHALL calcular Estado_Stock como `Bajo Stock` cuando `stock_actual > stock_minimo × 0.3` y `stock_actual ≤ stock_minimo`.
3. THE Sistema_Inventario SHALL calcular Estado_Stock como `En Stock` cuando `stock_actual > stock_minimo`.
4. THE Sistema_Inventario SHALL renderizar cada Estado_Stock con la combinación de color definida en el sistema de diseño: `En Stock` con `bg-green-100 text-green-700`, `Bajo Stock` con `bg-yellow-100 text-yellow-700`, `Crítico` con `bg-primary/10 text-primary`.

### Requisito 8: Tarjetas resumen del inventario

**User Story:** Como administrador, quiero ver tarjetas con el total de productos y la distribución por estado, para tener un pulso del inventario.

#### Criterios de Aceptación

1. WHEN la sección Inventario se renderiza, THE Sistema_Inventario SHALL mostrar cuatro tarjetas con los conteos: Total Productos, En Stock, Bajo Stock, Crítico.
2. THE API_Backend SHALL exponer un endpoint `GET /api/inventario/resumen` que retorne los cuatro conteos calculados sobre los productos con `activo = true`.
3. WHEN un Producto cambia de Estado_Stock tras una venta o un Movimiento_Stock, THE Sistema_Inventario SHALL refrescar las tarjetas en la siguiente carga de la sección.

### Requisito 9: Generación de código de barras al crear producto

**User Story:** Como administrador, quiero que cada producto tenga un código de barras válido, para poder etiquetarlo y escanearlo en ventas.

#### Criterios de Aceptación

1. WHEN se crea un Producto sin `codigo_barras`, THE Sistema_Inventario SHALL generar un código EAN-13 con prefijo de uso interno `200` y un dígito verificador calculado según el algoritmo EAN-13.
2. THE Sistema_Inventario SHALL garantizar que el código generado no exista previamente en la tabla `productos`.
3. WHEN un usuario captura manualmente un `codigo_barras`, THE API_Backend SHALL validar el formato como EAN-13 (13 dígitos con dígito verificador correcto) o Code128 (1 a 48 caracteres alfanuméricos).
4. IF el `codigo_barras` capturado no coincide con ningún formato soportado, THEN THE API_Backend SHALL responder con HTTP 400 y el código `CODIGO_BARRAS_INVALIDO`.

### Requisito 10: Vista previa e impresión de etiqueta

**User Story:** Como administrador, quiero imprimir la etiqueta con el código de barras desde una ventana flotante, para colocarla físicamente en el producto.

#### Criterios de Aceptación

1. WHEN el usuario selecciona la acción "Imprimir etiqueta" en una fila, THE Sistema_Inventario SHALL abrir una Ventana_Flotante con la vista previa de la etiqueta que incluye nombre, precio de venta y código de barras renderizado como SVG.
2. THE Sistema_Inventario SHALL renderizar el código de barras como SVG mediante una librería cliente sin solicitudes a servicios externos.
3. WHEN el usuario hace clic en el botón "Imprimir", THE Sistema_Inventario SHALL invocar `window.print()` con una hoja de estilos específica de etiqueta (tamaño 50 x 30 mm por defecto, configurable).
4. THE Sistema_Inventario SHALL permitir seleccionar la cantidad de etiquetas a imprimir entre 1 y 100 antes de invocar la impresión.
5. WHERE existe una configuración guardada de tamaño de etiqueta, THE Sistema_Inventario SHALL aplicar dicho tamaño en la vista previa y en la hoja de impresión.

### Requisito 11: Round-trip del código de barras

**User Story:** Como administrador, quiero que cualquier código de barras impreso pueda ser leído de vuelta y resuelva al mismo producto, para garantizar la confiabilidad del flujo de venta.

#### Criterios de Aceptación

1. FOR ALL códigos generados por el Sistema_Inventario, escanear el código con el Lector_Codigo SHALL resolver al mismo Producto que lo originó (propiedad Round_Trip_Codigo).
2. THE API_Backend SHALL exponer un endpoint `GET /api/productos/por-codigo/{codigo}` que reciba el `codigo_barras` y retorne el Producto correspondiente o HTTP 404 si no existe.
3. WHEN el endpoint recibe un código no registrado, THE API_Backend SHALL responder con HTTP 404 y el código `PRODUCTO_NO_ENCONTRADO`.

### Requisito 12: Ajuste manual de stock

**User Story:** Como administrador, quiero ajustar el stock de un producto registrando el motivo, para mantener el inventario alineado con la realidad física.

#### Criterios de Aceptación

1. WHEN el usuario abre la acción "Ajustar stock" en una fila, THE Sistema_Inventario SHALL abrir una Ventana_Flotante con los campos: tipo (entrada, salida, merma, devolución, ajuste), cantidad, motivo.
2. WHEN el usuario envía el ajuste con datos válidos, THE API_Backend SHALL aplicar el cambio de stock en una transacción que también inserta un registro en la tabla `movimientos_stock`.
3. IF el ajuste resulta en `stock_actual` menor que 0, THEN THE API_Backend SHALL rechazar la operación con HTTP 400 y el código `STOCK_NEGATIVO`.
4. THE Capa_Datos SHALL definir la tabla `movimientos_stock` con las columnas `id` (UUID, PK), `producto_id` (UUID FK NOT NULL), `tipo` (ENUM), `cantidad` (INT NOT NULL), `stock_resultante` (INT NOT NULL), `motivo` (VARCHAR(240)), `usuario_id` (UUID FK NULL), `referencia_id` (UUID NULL), `creado_en` (DATETIME NOT NULL).
5. WHEN se inserta un Movimiento_Stock, THE Capa_Datos SHALL almacenar el `stock_resultante` igual al `stock_actual` del Producto después del cambio.

### Requisito 13: Historial de movimientos por producto

**User Story:** Como administrador, quiero ver el historial de movimientos de un producto, para auditar cambios de stock.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en "Ver historial" desde una fila de producto, THE Sistema_Inventario SHALL abrir una Ventana_Flotante con la lista paginada de Movimiento_Stock asociados al Producto.
2. THE API_Backend SHALL exponer un endpoint `GET /api/productos/{id}/movimientos` que retorne los movimientos ordenados por `creado_en` descendente.
3. THE Sistema_Inventario SHALL mostrar para cada movimiento: fecha, tipo, cantidad con signo, stock resultante, motivo y referencia (folio de venta cuando aplica).

### Requisito 14: Carrito de venta y captura por escaneo

**User Story:** Como cajero, quiero escanear códigos con el lector y ver los productos acumularse en el carrito, para cobrar sin usar el teclado.

#### Criterios de Aceptación

1. WHEN el usuario abre la Ventana_Flotante "Nueva Venta", THE Sistema_Ventas SHALL colocar el foco en un campo de captura oculto que recibe los caracteres del Lector_Codigo.
2. WHEN el Lector_Codigo emite una secuencia de caracteres terminada en `Enter` dentro de los 80 ms entre caracteres, THE Sistema_Ventas SHALL interpretar la secuencia como un escaneo y consultar `GET /api/productos/por-codigo/{codigo}`.
3. WHEN el escaneo resuelve a un Producto existente, THE Sistema_Ventas SHALL agregar el Producto al Carrito_Venta con cantidad 1.
4. WHEN el escaneo resuelve a un Producto ya presente en el Carrito_Venta, THE Sistema_Ventas SHALL incrementar su cantidad en 1 sin agregar una fila duplicada.
5. IF el escaneo no resuelve a ningún Producto, THEN THE Sistema_Ventas SHALL mostrar una notificación toast con el texto "Código no encontrado" y emitir un sonido de error opcional.
6. WHEN un Producto se agrega al Carrito_Venta, THE Sistema_Ventas SHALL devolver el foco al campo de captura dentro de 100 ms.
7. THE Sistema_Ventas SHALL permitir editar manualmente la cantidad de cada ítem mediante un control numérico con valor mínimo 1.
8. THE Sistema_Ventas SHALL permitir eliminar un ítem del Carrito_Venta mediante un botón con icono de basura por fila.

### Requisito 15: Validación de stock al agregar al carrito

**User Story:** Como cajero, quiero que el sistema me impida vender más unidades de las que hay en stock, para no quedar en negativo.

#### Criterios de Aceptación

1. WHEN un escaneo intenta agregar un Producto al Carrito_Venta cuya cantidad acumulada superaría el `stock_actual`, THE Sistema_Ventas SHALL mantener la cantidad en el máximo disponible y mostrar una notificación toast con el texto "Stock insuficiente para {nombre}".
2. WHEN el usuario edita manualmente la cantidad por encima del `stock_actual` disponible, THE Sistema_Ventas SHALL rechazar la entrada y restaurar el valor anterior.
3. WHERE la configuración `permitir_sobreventa` está activada, THE Sistema_Ventas SHALL permitir cantidades superiores al stock y registrar una advertencia visible junto al ítem.

### Requisito 16: Cálculo de subtotal, impuestos y total

**User Story:** Como cajero, quiero ver el subtotal, los impuestos y el total actualizados en tiempo real, para informar al cliente del importe a pagar.

#### Criterios de Aceptación

1. WHEN el contenido del Carrito_Venta cambia, THE Sistema_Ventas SHALL recalcular subtotal, impuestos y total en menos de 50 ms.
2. THE Sistema_Ventas SHALL calcular el subtotal como la suma de `precio_venta × cantidad` de cada ítem.
3. THE Sistema_Ventas SHALL calcular los impuestos como `subtotal × porcentaje_impuesto / 100` con `porcentaje_impuesto` leído desde la configuración (valor por defecto 0).
4. THE Sistema_Ventas SHALL calcular el total como `subtotal + impuestos`.
5. THE Sistema_Ventas SHALL redondear todos los montos monetarios a 2 decimales usando redondeo bancario (half-to-even).

### Requisito 17: Selección de método de pago

**User Story:** Como cajero, quiero elegir el método de pago de la venta, para registrar correctamente la transacción.

#### Criterios de Aceptación

1. THE Sistema_Ventas SHALL ofrecer los métodos de pago: efectivo, tarjeta, transferencia, fiado.
2. WHEN el método elegido es `efectivo`, THE Sistema_Ventas SHALL solicitar el monto recibido y calcular el cambio como `monto_recibido − total`.
3. IF el `monto_recibido` es menor que el total, THEN THE Sistema_Ventas SHALL deshabilitar el botón "Cobrar" y mostrar un mensaje de error junto al campo.
4. WHEN el método elegido es `fiado`, THE Sistema_Ventas SHALL solicitar la selección de un Fiador existente del módulo Fiadores antes de habilitar el botón "Cobrar".
5. WHERE el módulo Fiadores no contiene Fiadores activos, THE Sistema_Ventas SHALL mostrar un enlace para abrir la sección Fiadores en una Ventana_Flotante adicional.

### Requisito 18: Persistencia atómica de la venta

**User Story:** Como administrador, quiero que cada venta se guarde junto con el descuento de stock en una sola transacción, para garantizar la consistencia del inventario.

#### Criterios de Aceptación

1. WHEN el usuario hace clic en "Cobrar" con un Carrito_Venta válido, THE API_Backend SHALL ejecutar una transacción que inserte una fila en `ventas`, una fila por ítem en `venta_items`, y una fila por ítem en `movimientos_stock` con `tipo = 'venta'`.
2. THE Capa_Datos SHALL definir la tabla `ventas` con `id` (UUID, PK), `folio` (VARCHAR(24) UNIQUE NOT NULL), `subtotal` (DECIMAL(12,2)), `impuesto` (DECIMAL(12,2)), `total` (DECIMAL(12,2)), `metodo_pago` (ENUM), `fiador_id` (UUID FK NULL), `usuario_id` (UUID FK NULL), `estado` (ENUM `completada`, `pendiente`, `cancelada`), `creado_en` (DATETIME NOT NULL).
3. THE Capa_Datos SHALL definir la tabla `venta_items` con `id` (UUID, PK), `venta_id` (UUID FK NOT NULL), `producto_id` (UUID FK NOT NULL), `cantidad` (INT NOT NULL), `precio_unitario` (DECIMAL(12,2)), `subtotal_linea` (DECIMAL(12,2)).
4. IF cualquier paso de la transacción falla, THEN THE API_Backend SHALL revertir todos los cambios y responder con HTTP 500 y el código `VENTA_FALLIDA` sin alterar el `stock_actual` de ningún Producto.
5. WHEN la transacción es exitosa, THE API_Backend SHALL responder con HTTP 201 incluyendo el folio y el detalle persistido.
6. THE API_Backend SHALL generar el Folio_Venta con formato `VTA-AAAAMMDD-NNNN` donde `NNNN` es un consecutivo diario reiniciado a las 00:00 hora local.

### Requisito 19: Emisión e impresión del ticket

**User Story:** Como cajero, quiero imprimir un ticket al finalizar la venta, para entregárselo al cliente.

#### Criterios de Aceptación

1. WHEN una venta se persiste correctamente, THE Sistema_Ventas SHALL abrir una Ventana_Flotante con el ticket renderizado.
2. THE Ticket SHALL incluir folio, fecha y hora, lista de ítems con cantidad y subtotal de línea, subtotal, impuestos, total, método de pago, monto recibido y cambio cuando aplica.
3. WHEN el usuario hace clic en "Imprimir ticket", THE Sistema_Ventas SHALL invocar `window.print()` con una hoja de estilos específica de ticket (ancho 58 mm o 80 mm, configurable).
4. THE Sistema_Ventas SHALL ofrecer un botón "Nueva venta" que cierra el ticket y reinicia el Carrito_Venta vacío con el foco en el campo de captura del Lector_Codigo.
5. WHERE la configuración `imprimir_automaticamente` está activada, THE Sistema_Ventas SHALL invocar la impresión sin requerir clic adicional.

### Requisito 20: Listado, búsqueda y reimpresión de ventas

**User Story:** Como administrador, quiero listar, buscar y reimprimir ventas anteriores, para resolver dudas o devoluciones.

#### Criterios de Aceptación

1. WHEN la sección Ventas se renderiza, THE Sistema_Ventas SHALL mostrar la tabla de ventas con folio, fecha, ítems, total, método de pago y estado.
2. WHEN el usuario escribe en el campo de búsqueda, THE Sistema_Ventas SHALL filtrar la tabla por coincidencia parcial en `folio` o nombre de Fiador con un debounce de 300 ms.
3. WHEN el usuario aplica un filtro de fecha, THE API_Backend SHALL devolver únicamente las ventas dentro del rango seleccionado.
4. WHEN el usuario hace clic en el icono de impresora de una fila, THE Sistema_Ventas SHALL abrir la Ventana_Flotante del ticket con los datos persistidos y permitir reimprimir.
5. WHEN el usuario hace clic en el icono de ojo de una fila, THE Sistema_Ventas SHALL abrir una Ventana_Flotante de detalle con todos los ítems y movimientos de stock asociados.

### Requisito 21: Endpoints de la API_Backend

**User Story:** Como desarrollador, quiero endpoints REST consistentes para operar inventario y ventas, para integrarlos desde el frontend con tipos compartidos.

#### Criterios de Aceptación

1. THE API_Backend SHALL exponer `GET /api/productos`, `POST /api/productos`, `GET /api/productos/{id}`, `PATCH /api/productos/{id}`, `DELETE /api/productos/{id}`.
2. THE API_Backend SHALL exponer `GET /api/productos/por-codigo/{codigo}`.
3. THE API_Backend SHALL exponer `POST /api/productos/{id}/ajuste-stock` y `GET /api/productos/{id}/movimientos`.
4. THE API_Backend SHALL exponer `GET /api/categorias` y `POST /api/categorias`.
5. THE API_Backend SHALL exponer `GET /api/inventario/resumen`.
6. THE API_Backend SHALL exponer `GET /api/ventas`, `POST /api/ventas`, `GET /api/ventas/{id}`.
7. THE API_Backend SHALL validar todas las entradas con esquemas Zod y rechazar payloads con errores de validación devolviendo HTTP 422 y un objeto `{ errores: [{ campo, mensaje }] }`.
8. THE API_Backend SHALL responder con `Content-Type: application/json; charset=utf-8` en todos los endpoints.

### Requisito 22: Integración con el sistema de diseño existente

**User Story:** Como usuario, quiero que las nuevas ventanas y formularios respeten el sistema de diseño actual, para mantener una experiencia visual coherente.

#### Criterios de Aceptación

1. THE Sistema_Inventario SHALL usar exclusivamente componentes shadcn/ui presentes en `components/ui/` (Dialog, Sheet, AlertDialog, Form, Input, Select, Button, Table, Badge) sin introducir nuevas librerías de UI.
2. THE Sistema_Ventas SHALL usar las mismas variables de color del tema (`bg-card`, `text-foreground`, `bg-primary`, etc.) sin valores hex codificados.
3. THE Sistema_Inventario SHALL renderizar todas las Ventana_Flotante con animación, overlay y cierre por tecla `Escape` heredados del componente Dialog de shadcn.
4. THE Sistema_Ventas SHALL respetar el modo oscuro y claro provisto por `next-themes`.
5. THE Sistema_Inventario SHALL mantener la estructura de archivos existente: las nuevas ventanas viven en `components/inventario/` y `components/ventas/`, y los formularios usan `react-hook-form` con `@hookform/resolvers/zod`.

### Requisito 23: Notificaciones, accesibilidad e internacionalización

**User Story:** Como usuario, quiero recibir retroalimentación clara y poder usar la app con teclado y lector de pantalla, para trabajar de forma eficiente y accesible.

#### Criterios de Aceptación

1. THE Sistema_Inventario SHALL emitir notificaciones toast con `sonner` para cada operación de creación, edición, eliminación y ajuste de stock.
2. THE Sistema_Ventas SHALL emitir notificaciones toast para escaneo no encontrado, stock insuficiente, venta exitosa y venta fallida.
3. THE Sistema_Inventario SHALL exponer todas las etiquetas, mensajes de error y textos de botón en español.
4. THE Sistema_Inventario SHALL asignar atributos `aria-label` descriptivos a los iconos-botón (editar, eliminar, imprimir, ajustar stock).
5. THE Sistema_Ventas SHALL permitir cerrar la Ventana_Flotante "Nueva Venta" con la tecla `Escape` sólo cuando el Carrito_Venta está vacío, y solicitar confirmación cuando contiene ítems.
6. THE Sistema_Inventario SHALL garantizar contraste mínimo AA (relación 4.5:1) entre texto y fondo en todos los estados de los Badge de Estado_Stock.

### Requisito 24: Rendimiento y robustez del escaneo

**User Story:** Como cajero, quiero que el sistema procese escaneos rápidos sin perder caracteres, para no detener la línea de cobro.

#### Criterios de Aceptación

1. WHEN el Lector_Codigo emite hasta 10 escaneos por segundo, THE Sistema_Ventas SHALL procesar cada escaneo y reflejarlo en el Carrito_Venta sin pérdida de caracteres.
2. WHEN un escaneo dispara una consulta a `GET /api/productos/por-codigo/{codigo}`, THE API_Backend SHALL responder en menos de 150 ms p95 sobre un catálogo de hasta 10 000 productos.
3. WHILE una consulta de escaneo está en curso, THE Sistema_Ventas SHALL acumular en cola los siguientes escaneos y procesarlos en el orden recibido.
4. THE Capa_Datos SHALL definir un índice secundario sobre la columna `codigo_barras` de la tabla `productos`.

### Requisito 25: Manejo de errores y observabilidad mínima

**User Story:** Como administrador, quiero ver mensajes de error útiles y un registro mínimo de operaciones críticas, para diagnosticar problemas.

#### Criterios de Aceptación

1. IF la API_Backend pierde la conexión con BD_MySQL durante una venta, THEN THE API_Backend SHALL revertir la transacción, responder con HTTP 503 y el código `BD_NO_DISPONIBLE`, y registrar un evento de error en consola con la marca de tiempo y el folio intentado.
2. IF la validación Zod falla, THEN THE API_Backend SHALL responder con HTTP 422 e incluir el array de errores por campo.
3. THE API_Backend SHALL registrar en la consola del servidor cada venta completada con folio, total y método de pago, sin incluir datos sensibles del Fiador más allá de su `id`.
4. WHEN el frontend recibe un error de red, THE Sistema_Inventario SHALL mostrar un toast con el texto "Error de conexión. Revise el servidor." y conservar los datos del formulario en pantalla.

### Requisito 26: Configuración parametrizable

**User Story:** Como administrador, quiero configurar el porcentaje de impuesto, el tamaño de etiqueta y el tamaño de ticket, para adaptar el sistema a mi negocio.

#### Criterios de Aceptación

1. THE Sistema_Inventario SHALL leer la configuración desde una tabla `configuracion` con pares `clave/valor` en BD_MySQL.
2. THE Sistema_Inventario SHALL exponer en la sección Configuración los parámetros: `porcentaje_impuesto`, `etiqueta_ancho_mm`, `etiqueta_alto_mm`, `ticket_ancho_mm`, `imprimir_automaticamente`, `permitir_sobreventa`.
3. WHEN el usuario guarda cambios de configuración, THE API_Backend SHALL persistirlos y refrescar los valores en cada nueva sesión del cliente.
4. WHERE un parámetro no está definido, THE Sistema_Inventario SHALL aplicar el valor predeterminado correspondiente declarado en el código fuente.
