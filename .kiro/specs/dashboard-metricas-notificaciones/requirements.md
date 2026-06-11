# Requirements Document

## Introduction

Esta especificación define una nueva funcionalidad de **Dego** (Sistema de Inventario y Ventas) compuesta por dos partes complementarias que se construyen sobre el modelo de datos y la capa de API del spec `inventario-ventas-core`:

**Parte A — Dashboard de métricas y rankings con filtro de rango de fechas.** Reemplaza el dashboard actual basado en datos mock (`components/sections/dashboard-section.tsx`) por un panel analítico que consume datos reales del backend. Muestra indicadores clave (ventas, devoluciones, gastos/costo de mercancía y ganancia estimada) y rankings de productos (más vendidos, mayor margen, mayor y menor rotación) para un período seleccionable mediante un selector de rango de fechas con presets rápidos. Incluye visualizaciones con `recharts` (tendencias, comparativas, tarjetas KPI con variación, sparklines, margen).

**Parte B — Sistema de notificaciones.** Introduce un centro de notificaciones (campana en el header con badge de no leídas, panel con lista y acción de marcar como leída) y la emisión de un sonido sutil al recibir notificaciones. El alcance actual cubre un único tipo: alerta cuando un Producto entra en estado de stock `Crítico`. El sistema se diseña de forma extensible para soportar tipos adicionales en el futuro, evitando notificaciones duplicadas para un mismo Producto que permanece en estado `Crítico`.

Ambas partes respetan el sistema de diseño existente (shadcn/ui, variables de tema, modo claro/oscuro con `next-themes`), todo el texto de cara al usuario está en español, los endpoints se validan con Zod siguiendo el patrón de `inventario-ventas-core`, y la precisión monetaria usa redondeo bancario a 2 decimales coherente con el spec core.

## Glossary

- **Dego**: aplicación cliente Next.js 16 + React 19 que aloja todos los módulos, incluido el Dashboard y el centro de notificaciones.
- **Dashboard_Analitico**: subsistema de la sección Dashboard que muestra métricas, rankings y visualizaciones para un rango de fechas.
- **API_Backend**: capa de Route Handlers de Next.js bajo `app/api/**/route.ts` que expone endpoints REST/JSON validados con Zod, reutilizada del spec `inventario-ventas-core`.
- **Sistema_Notificaciones**: subsistema responsable de generar, persistir, listar y marcar notificaciones, y de emitir el sonido asociado.
- **Rango_Fechas**: par de fechas `{ desde, hasta }` (inclusivo) que delimita el período de análisis del Dashboard_Analitico, expresado en la zona horaria de la aplicación.
- **Preset_Rango**: opción rápida que fija un Rango_Fechas predefinido. Valores: `hoy`, `esta_semana`, `este_mes`, `mes_anterior`, `personalizado`.
- **Periodo_Actual**: el Rango_Fechas seleccionado por el usuario.
- **Periodo_Anterior**: el Rango_Fechas inmediatamente previo y de igual duración al Periodo_Actual, usado para calcular variaciones porcentuales.
- **Metrica_KPI**: indicador numérico agregado calculado sobre el Periodo_Actual. Conjunto: `totalSales`, `totalReturns`, `totalExpenses`, `estimatedProfit`.
- **totalSales**: suma de `total` de las Ventas con `estado = completada` cuyo `creado_en` cae dentro del Rango_Fechas.
- **totalReturns**: suma del valor de los Movimiento_Stock con `tipo = devolucion` cuyo `creado_en` cae dentro del Rango_Fechas, valorado a `precio_venta` del Producto.
- **totalExpenses**: costo de mercancía vendida en el período, calculado como la suma de `precio_compra × cantidad` de los Venta_Item de Ventas con `estado = completada` dentro del Rango_Fechas.
- **estimatedProfit**: ganancia estimada del período, calculada como `totalSales − totalExpenses`.
- **Ranking_Productos**: lista ordenada de Productos según una métrica para el Rango_Fechas. Tipos: `topSelling`, `topMargin`, `lowRotation`, `topRotation`.
- **topSelling**: Productos ordenados de mayor a menor según unidades vendidas y según monto vendido en el período.
- **topMargin**: Productos ordenados de mayor a menor según margen unitario (`precio_venta − precio_compra`).
- **topRotation**: Productos con mayor rotación (mayor cantidad de unidades con salida) en el período.
- **lowRotation**: Productos con menor rotación (menor cantidad de unidades con salida, incluyendo cero) en el período.
- **Variacion_Porcentual**: cambio relativo de una Metrica_KPI entre Periodo_Actual y Periodo_Anterior, calculado como `(actual − anterior) / anterior × 100`.
- **Serie_Tendencia**: conjunto de puntos `{ fecha, valor }` que describe la evolución de una métrica a lo largo del Rango_Fechas, usado para gráficas de línea/barra y sparklines.
- **Producto**: entidad del catálogo definida en `inventario-ventas-core` con campos `precio_compra`, `precio_venta`, `stock_actual`, `stock_minimo`, entre otros.
- **Venta**: entidad definida en `inventario-ventas-core` con campos `subtotal`, `impuesto`, `total`, `metodo_pago`, `estado`, `creado_en`.
- **Venta_Item**: línea de venta definida en `inventario-ventas-core` con campos `cantidad`, `precio_unitario`, `subtotal_linea`, `producto_id`.
- **Movimiento_Stock**: registro de cambio de stock definido en `inventario-ventas-core` con `tipo` (entrada, salida, merma, devolucion, ajuste, venta).
- **Estado_Stock**: clasificación calculada del Producto definida en `inventario-ventas-core`: `Crítico` cuando `stock_actual = 0` o `stock_actual ≤ stock_minimo × 0.3`.
- **Notificacion**: registro persistido con `id`, `tipo`, `titulo`, `mensaje`, `producto_id` (opcional), `leida`, `clave_deduplicacion`, `creado_en`.
- **Centro_Notificaciones**: componente de UI accesible desde un icono de campana en el header, que muestra el conteo de Notificaciones no leídas y el panel con la lista.
- **Badge_Conteo**: indicador numérico sobre el icono de campana que muestra la cantidad de Notificaciones con `leida = false`.
- **Sonido_Notificacion**: señal auditiva breve y discreta que se reproduce al recibir una Notificacion nueva.
- **Clave_Deduplicacion**: cadena que identifica de forma única el evento que originó una Notificacion (por ejemplo, `stock_critico:{producto_id}`), usada para evitar duplicados mientras la condición persiste.
- **Redondeo_Bancario**: redondeo a 2 decimales con modo half-to-even, coherente con `inventario-ventas-core`.
- **Tema_Activo**: modo de color claro u oscuro provisto por `next-themes`.
- **Capa_Datos**: módulo de acceso a datos basado en Prisma ORM definido en `inventario-ventas-core`, extendido aquí con la tabla `notificaciones`.

## Requirements

### Requisito 1: Selección de rango de fechas en el Dashboard

**User Story:** Como administrador, quiero seleccionar un rango de fechas con presets rápidos o un rango personalizado, para analizar las métricas del período que me interesa, por ejemplo las ventas del 2 al 20 de abril.

#### Acceptance Criteria

1. WHEN la sección Dashboard se renderiza por primera vez, THE Dashboard_Analitico SHALL aplicar el Preset_Rango `este_mes` como Rango_Fechas inicial, definido como desde el día 1 del mes actual hasta el día de hoy, ambos inclusive, en la zona horaria configurada de la aplicación.
2. THE Dashboard_Analitico SHALL ofrecer los Preset_Rango `hoy` (el día de hoy), `esta_semana` (desde el lunes de la semana actual hasta hoy), `este_mes` (desde el día 1 del mes actual hasta hoy), `mes_anterior` (desde el día 1 hasta el último día del mes calendario inmediatamente anterior) y `personalizado`, todos interpretados como inclusivos en ambos extremos en la zona horaria configurada de la aplicación.
3. WHEN el usuario selecciona un Preset_Rango distinto de `personalizado`, THE Dashboard_Analitico SHALL fijar el Rango_Fechas correspondiente y recargar las Metrica_KPI y los Ranking_Productos del nuevo período en un máximo de 3 segundos tras recibir la respuesta del API_Backend.
4. WHILE una recarga de Metrica_KPI o Ranking_Productos está en curso, THE Dashboard_Analitico SHALL mostrar un indicador de carga visible hasta que los datos se rendericen o se reciba un error.
5. WHEN el usuario selecciona el Preset_Rango `personalizado`, THE Dashboard_Analitico SHALL mostrar un selector de calendario de rango basado en `react-day-picker` que permita elegir fecha de inicio y fecha de fin.
6. WHEN el usuario confirma un Rango_Fechas personalizado en el que la fecha de inicio es anterior o igual a la fecha de fin, ninguna de las dos fechas es futura, ambas fechas están definidas y la duración no excede 366 días, THE Dashboard_Analitico SHALL aceptar el Rango_Fechas y recargar las Metrica_KPI y los Ranking_Productos del período seleccionado en un máximo de 3 segundos tras recibir la respuesta del API_Backend.
7. IF el usuario confirma un Rango_Fechas personalizado en el que la fecha de inicio es posterior a la fecha de fin, THEN THE Dashboard_Analitico SHALL mostrar el mensaje "La fecha de inicio debe ser anterior o igual a la fecha de fin", conservar el Rango_Fechas previo y no recargar los datos.
8. IF el usuario confirma un Rango_Fechas personalizado incompleto, con una fecha futura o con una duración mayor a 366 días, THEN THE Dashboard_Analitico SHALL mostrar un mensaje de error en español que describa la condición inválida, conservar el Rango_Fechas previo y no recargar los datos.
9. THE Dashboard_Analitico SHALL mostrar de forma visible el Rango_Fechas activo en formato legible en español, por ejemplo "2 abr 2025 – 20 abr 2025".
10. THE Dashboard_Analitico SHALL interpretar el Rango_Fechas como inclusivo en ambos extremos usando la zona horaria configurada de la aplicación.

### Requisito 2: Endpoint de métricas del Dashboard

**User Story:** Como desarrollador, quiero un endpoint que devuelva las métricas agregadas para un rango de fechas, para alimentar las tarjetas KPI del Dashboard.

#### Acceptance Criteria

1. THE API_Backend SHALL exponer el endpoint `GET /api/dashboard/metricas` que acepte los parámetros de consulta obligatorios `desde` y `hasta` como fechas en formato ISO 8601 `YYYY-MM-DD`.
2. THE API_Backend SHALL validar los parámetros `desde` y `hasta` con un esquema Zod que rechace su ausencia o valor vacío, los valores que no cumplan el formato `YYYY-MM-DD`, el caso en que `desde` sea posterior a `hasta`, y los rangos cuya duración exceda 366 días.
3. IF los parámetros `desde` o `hasta` no superan la validación, THEN THE API_Backend SHALL responder con HTTP 422 y un objeto `{ errores: [{ campo, mensaje }] }` con una entrada por cada parámetro inválido, sin ejecutar el cálculo de métricas.
4. THE API_Backend SHALL interpretar el Rango_Fechas como inclusivo en ambos extremos, considerando dentro del rango todo registro cuyo `creado_en` (en UTC) sea mayor o igual al inicio del día `desde` y menor o igual al fin del día `hasta`.
5. WHEN el endpoint recibe un Rango_Fechas válido, THE API_Backend SHALL responder con HTTP 200 y un objeto que contenga `totalSales`, `totalReturns`, `totalExpenses` y `estimatedProfit`.
6. THE API_Backend SHALL calcular `totalSales` como la suma de `total` de las Ventas con `estado = completada` cuyo `creado_en` está dentro del Rango_Fechas.
7. THE API_Backend SHALL calcular `totalReturns` como la suma del valor de los Movimiento_Stock con `tipo = devolucion` cuyo `creado_en` está dentro del Rango_Fechas, valorando cada unidad al `precio_venta` del Producto asociado.
8. THE API_Backend SHALL calcular `totalExpenses` como la suma de `precio_compra × cantidad` de los Venta_Item pertenecientes a Ventas con `estado = completada` cuyo `creado_en` está dentro del Rango_Fechas.
9. THE API_Backend SHALL calcular `estimatedProfit` como `totalSales − totalExpenses`.
10. THE API_Backend SHALL aplicar Redondeo_Bancario a 2 decimales a cada Metrica_KPI antes de responder.
11. THE API_Backend SHALL incluir en la respuesta los mismos cuatro indicadores calculados sobre el Periodo_Anterior, definido como el Rango_Fechas de igual cantidad de días que finaliza el día inmediatamente anterior a `desde`.
12. IF el valor de un indicador en el Periodo_Anterior es 0, THEN THE API_Backend SHALL exponer la Variacion_Porcentual de esa métrica como no calculable (valor `null`) en la respuesta.
13. WHEN el Rango_Fechas no contiene Ventas ni Movimiento_Stock, THE API_Backend SHALL responder con HTTP 200 y cada Metrica_KPI igual a 0.
14. THE API_Backend SHALL responder con `Content-Type: application/json; charset=utf-8`.

### Requisito 3: Endpoint de rankings del Dashboard

**User Story:** Como administrador, quiero obtener los rankings de productos del período, para identificar los productos más vendidos, los de mayor margen y los de alta y baja rotación.

#### Acceptance Criteria

1. THE API_Backend SHALL exponer el endpoint `GET /api/dashboard/rankings` que acepte los parámetros de consulta obligatorios `desde` y `hasta` en formato ISO 8601 `YYYY-MM-DD` y el parámetro entero opcional `limite`.
2. THE API_Backend SHALL validar los parámetros con un esquema Zod que rechace la ausencia de `desde` o `hasta`, fechas que no cumplan el formato `YYYY-MM-DD`, el caso `desde` posterior a `hasta`, y un `limite` que no sea un entero dentro del rango de 1 a 50 inclusive.
3. IF algún parámetro no supera la validación, THEN THE API_Backend SHALL responder con HTTP 422 y un objeto `{ errores: [{ campo, mensaje }] }` que identifique cada parámetro inválido o ausente, sin ejecutar el cálculo ni devolver listas de Ranking_Productos.
4. WHEN el parámetro `limite` no se proporciona, THE API_Backend SHALL usar el valor predeterminado 5.
5. WHEN el endpoint recibe un Rango_Fechas válido, THE API_Backend SHALL responder con HTTP 200 y un objeto con las listas `topSelling`, `topMargin`, `topRotation` y `lowRotation`.
6. THE API_Backend SHALL calcular `topSelling` como los Productos con mayor cantidad de unidades vendidas en el período, ordenados de mayor a menor por unidades vendidas, con desempate en orden ascendente por identificador de Producto, incluyendo para cada Producto las unidades vendidas y el monto vendido.
7. THE API_Backend SHALL calcular `topMargin` como los Productos con mayor margen unitario `precio_venta − precio_compra`, ordenados de mayor a menor por margen, con desempate en orden ascendente por identificador de Producto, incluyendo el margen calculado de cada Producto.
8. THE API_Backend SHALL calcular `topRotation` como los Productos con mayor cantidad de unidades con salida en el período, ordenados de mayor a menor por unidades de salida, con desempate en orden ascendente por identificador de Producto.
9. THE API_Backend SHALL calcular `lowRotation` como los Productos activos con menor cantidad de unidades con salida en el período (incluyendo Productos con cero salidas), ordenados de menor a mayor por unidades de salida, con desempate en orden ascendente por identificador de Producto.
10. THE API_Backend SHALL limitar cada lista de Ranking_Productos al número de elementos indicado por `limite`.
11. THE API_Backend SHALL aplicar Redondeo_Bancario a 2 decimales a todos los valores monetarios incluidos en las listas.
12. WHEN el período no contiene ventas, THE API_Backend SHALL responder con HTTP 200, con `topSelling` y `topRotation` vacíos, y con `lowRotation` poblado por Productos activos con cero salidas.
13. THE API_Backend SHALL responder con `Content-Type: application/json; charset=utf-8`.

### Requisito 4: Tarjetas KPI con variación

**User Story:** Como administrador, quiero ver tarjetas con las métricas clave y su variación respecto al período anterior, para evaluar el desempeño de un vistazo.

#### Acceptance Criteria

1. WHEN el Dashboard_Analitico recibe los datos de métricas, THE Dashboard_Analitico SHALL mostrar exactamente cuatro tarjetas KPI correspondientes a Ventas Totales, Devoluciones, Gastos y Ganancia Estimada, en ese orden.
2. THE Dashboard_Analitico SHALL formatear cada valor monetario en pesos con el símbolo de moneda, separador de miles, exactamente 2 decimales y un rango admitido de 0.00 a 999,999,999.99.
3. THE Dashboard_Analitico SHALL mostrar en cada tarjeta KPI la Variacion_Porcentual respecto al Periodo_Anterior con exactamente 1 decimal, el símbolo de porcentaje y un signo explícito (+ para valores mayores o iguales a 0, − para valores menores que 0).
4. IF la Variacion_Porcentual de una métrica es mayor o igual a 0, THEN THE Dashboard_Analitico SHALL representar la variación con el estilo positivo del sistema de diseño y un icono ascendente.
5. IF la Variacion_Porcentual de una métrica es menor que 0, THEN THE Dashboard_Analitico SHALL representar la variación con el estilo negativo del sistema de diseño y un icono descendente.
6. IF el valor de la métrica en el Periodo_Anterior es 0, THEN THE Dashboard_Analitico SHALL mostrar el texto "Sin datos previos" en lugar de la Variacion_Porcentual, omitiendo el icono de dirección y el estilo positivo o negativo.
7. WHEN el Dashboard_Analitico dispone de al menos dos puntos de datos de la métrica dentro del Rango_Fechas, THE Dashboard_Analitico SHALL mostrar en la tarjeta KPI una Serie_Tendencia compacta de tipo sparkline correspondiente a esa métrica.
8. IF la métrica no dispone de datos o dispone de menos de dos puntos de datos dentro del Rango_Fechas, THEN THE Dashboard_Analitico SHALL ocultar la Serie_Tendencia de esa tarjeta KPI y mostrar el texto "Sin datos suficientes" en el área del sparkline.
9. IF el Dashboard_Analitico no recibe los datos de métricas o la recepción falla, THEN THE Dashboard_Analitico SHALL mostrar en cada tarjeta KPI un indicador de estado de error con un mensaje indicando que las métricas no están disponibles, conservando la estructura de las cuatro tarjetas sin valores numéricos.

### Requisito 5: Visualizaciones del Dashboard

**User Story:** Como administrador, quiero ver gráficas claras y atractivas de la información, para comprender tendencias y comparativas sin leer tablas extensas.

#### Acceptance Criteria

1. THE Dashboard_Analitico SHALL mostrar una gráfica de líneas o barras con la Serie_Tendencia de Ventas a lo largo del Rango_Fechas usando `recharts`, con etiqueta de eje horizontal de fechas, etiqueta de eje vertical de monto y leyenda visible.
2. THE Dashboard_Analitico SHALL mostrar una gráfica comparativa de Ventas frente a Gastos a lo largo del Rango_Fechas, con leyenda que identifique cada serie y etiquetas de ambos ejes.
3. WHEN el usuario coloca el puntero o el foco sobre un punto o barra de una gráfica, THE Dashboard_Analitico SHALL mostrar un tooltip con la fecha o el nombre del Producto y el valor correspondiente.
4. THE Dashboard_Analitico SHALL mostrar una gráfica de barras con los Productos del Ranking_Productos `topSelling`, ordenados de mayor a menor por unidades vendidas y limitados a un máximo de 10 Productos.
5. THE Dashboard_Analitico SHALL mostrar una visualización del Ranking_Productos `topMargin` que represente el margen de cada Producto, ordenada de mayor a menor por margen y limitada a un máximo de 10 Productos.
6. THE Dashboard_Analitico SHALL mostrar el Ranking_Productos `topRotation` en una lista o tabla ordenada de mayor a menor por unidades de salida del período, limitada a un máximo de 10 Productos.
7. THE Dashboard_Analitico SHALL mostrar el Ranking_Productos `lowRotation` en una lista o tabla ordenada de menor a mayor por unidades de salida del período, limitada a un máximo de 10 Productos.
8. THE Dashboard_Analitico SHALL renderizar todas las gráficas usando las variables de color del tema del sistema de diseño, sin valores hex codificados.
9. WHEN el Tema_Activo cambia entre claro y oscuro, THE Dashboard_Analitico SHALL re-renderizar las gráficas con la paleta de colores correspondiente al tema en un máximo de 1 segundo.
10. WHILE los datos del Dashboard se están cargando, THE Dashboard_Analitico SHALL mostrar un estado de carga tipo esqueleto en lugar de las tarjetas y gráficas.
11. IF los datos del Dashboard no se reciben dentro de un límite de 10 segundos, THEN THE Dashboard_Analitico SHALL tratar la carga como fallida y mostrar el comportamiento de error.
12. IF una petición de datos del Dashboard falla, THEN THE Dashboard_Analitico SHALL mostrar un mensaje de error en español y un control para reintentar la carga, conservando el estado previo sin mostrar datos parciales.
13. WHEN el Rango_Fechas no contiene datos, THE Dashboard_Analitico SHALL mostrar un estado vacío con el texto "No hay datos para el período seleccionado".

### Requisito 6: Modelo de datos de notificaciones

**User Story:** Como administrador, quiero que las notificaciones se persistan, para no perder los avisos al recargar la aplicación.

#### Acceptance Criteria

1. THE Capa_Datos SHALL definir la tabla `notificaciones` con las columnas `id` (UUID, PK), `tipo` (VARCHAR(40) NOT NULL), `titulo` (VARCHAR(160) NOT NULL), `mensaje` (VARCHAR(400) NOT NULL), `producto_id` (UUID FK NULL), `leida` (BOOLEAN NOT NULL DEFAULT FALSE), `clave_deduplicacion` (VARCHAR(120) NULL), `creado_en` (DATETIME NOT NULL almacenado en UTC y asignado por el sistema en el instante de inserción).
2. THE Capa_Datos SHALL definir un índice sobre la columna `leida` que permita filtrar las Notificaciones con `leida = FALSE`.
3. THE Capa_Datos SHALL definir un índice sobre la columna `creado_en` que permita recuperar las Notificaciones en orden descendente por fecha de creación.
4. THE Sistema_Notificaciones SHALL aceptar en el campo `tipo` cualquier cadena no vacía de 1 a 40 caracteres, admitiendo el valor `stock_critico` en el alcance actual y permitiendo valores adicionales en el futuro sin cambios de esquema.
5. THE Capa_Datos SHALL definir una restricción de unicidad sobre `clave_deduplicacion` que aplique únicamente a los valores no nulos y permita múltiples filas con `clave_deduplicacion` NULL.
6. IF se intenta persistir una Notificacion con una `clave_deduplicacion` no nula que ya existe en otra Notificacion, THEN THE Sistema_Notificaciones SHALL rechazar la inserción y conservar sin cambios la Notificacion existente.
7. WHEN la aplicación se recarga, THE Sistema_Notificaciones SHALL recuperar las Notificaciones previamente persistidas conservando su estado `leida`.
8. WHEN el Producto referenciado por `producto_id` es eliminado, THE Capa_Datos SHALL conservar la Notificacion y dejar `producto_id` en NULL.

### Requisito 7: Detección de stock crítico y generación de notificación

**User Story:** Como administrador, quiero recibir una notificación cuando un producto llega a estado crítico de stock, para reponer a tiempo y evitar quiebres de inventario.

#### Acceptance Criteria

1. WHEN una operación de venta o de Movimiento_Stock provoca que el Estado_Stock de un Producto pase de un valor distinto de `Crítico` a `Crítico` (es decir, `stock_actual = 0` o `stock_actual ≤ stock_minimo × 0.3`), THE Sistema_Notificaciones SHALL crear una Notificacion de `tipo = stock_critico` asociada a ese Producto.
2. WHEN el Sistema_Notificaciones crea una Notificacion de stock crítico, THE Sistema_Notificaciones SHALL incluir en el campo `mensaje` el `nombre` del Producto, su `stock_actual` y su `stock_minimo`.
3. WHEN el Sistema_Notificaciones crea una Notificacion de stock crítico, THE Sistema_Notificaciones SHALL asignarle una Clave_Deduplicacion con el formato exacto `stock_critico:{producto_id}`.
4. IF al crear una Notificacion de stock crítico ya existe una Notificacion no leída con la misma Clave_Deduplicacion, THEN THE Sistema_Notificaciones SHALL omitir la creación de la nueva Notificacion, conservar sin cambios la Notificacion no leída existente y no incrementar el conteo de notificaciones del Producto.
5. WHEN una operación lleva el Estado_Stock de un Producto a `Crítico` y no existe ninguna Notificacion no leída con la Clave_Deduplicacion `stock_critico:{producto_id}` (porque la anterior fue marcada como leída tras que el Producto saliera de `Crítico`), THE Sistema_Notificaciones SHALL crear una nueva Notificacion para ese Producto.
6. THE Sistema_Notificaciones SHALL persistir la actualización de stock y la creación de la Notificacion de stock crítico dentro de una única transacción atómica, de modo que ambas se confirmen juntas o ninguna se confirme.
7. IF falla la persistencia del stock o la persistencia de la Notificacion dentro de la transacción, THEN THE Sistema_Notificaciones SHALL revertir por completo la transacción dejando el `stock_actual` del Producto en su valor previo, no dejar ninguna Notificacion persistida para esa operación y exponer una indicación de error al llamador.

### Requisito 8: Endpoints de notificaciones

**User Story:** Como desarrollador, quiero endpoints para listar y actualizar notificaciones, para alimentar el centro de notificaciones desde el frontend.

#### Acceptance Criteria

1. WHEN el endpoint `GET /api/notificaciones` recibe una petición, THE API_Backend SHALL responder con HTTP 200 y las Notificaciones ordenadas de forma descendente por `creado_en`, con desempate en orden descendente por `id` cuando `creado_en` coincide, limitando el resultado a un máximo de 100 Notificaciones por solicitud.
2. THE API_Backend SHALL aceptar en `GET /api/notificaciones` el parámetro de consulta opcional `solo_no_leidas` que admite únicamente los valores `true` y `false`, usar `false` como valor por defecto cuando se omite, y rechazar con HTTP 422 cualquier otro valor.
3. WHEN `solo_no_leidas` es `true`, THE API_Backend SHALL limitar el resultado a Notificaciones con `leida = false`.
4. WHEN no existen Notificaciones que cumplan los criterios de la consulta, THE API_Backend SHALL responder con HTTP 200 y una lista vacía.
5. WHEN el endpoint `GET /api/notificaciones/conteo` recibe una petición, THE API_Backend SHALL responder con HTTP 200 y la cantidad de Notificaciones con `leida = false` como un entero mayor o igual a 0.
6. WHEN el endpoint `PATCH /api/notificaciones/{id}` recibe un `id` que corresponde a una Notificacion existente, THE API_Backend SHALL marcarla como `leida = true` y responder con HTTP 200.
7. WHEN el endpoint `PATCH /api/notificaciones/{id}` recibe un `id` de una Notificacion que ya tiene `leida = true`, THE API_Backend SHALL responder con HTTP 200 sin alterar su estado (operación idempotente).
8. IF el `id` indicado en `PATCH /api/notificaciones/{id}` no corresponde a ninguna Notificacion, THEN THE API_Backend SHALL responder con HTTP 404 y el código `NOTIFICACION_NO_ENCONTRADA` sin alterar ninguna Notificacion.
9. WHEN el endpoint `POST /api/notificaciones/marcar-todas-leidas` recibe una petición, THE API_Backend SHALL marcar todas las Notificaciones como `leida = true` y responder con HTTP 200.
10. THE API_Backend SHALL validar todas las entradas con esquemas Zod y responder con HTTP 422 y un objeto `{ errores: [{ campo, mensaje }] }` ante payloads inválidos.
11. THE API_Backend SHALL responder con `Content-Type: application/json; charset=utf-8` en todos los endpoints de notificaciones.

### Requisito 9: Centro de notificaciones en el header

**User Story:** Como administrador, quiero un icono de campana en el header con un panel de notificaciones, para revisar y gestionar los avisos sin salir de la pantalla actual.

#### Acceptance Criteria

1. THE Sistema_Notificaciones SHALL mostrar un icono de campana en el header de la aplicación en todas las secciones de la aplicación.
2. WHILE existen entre 1 y 99 Notificaciones con `leida = false`, THE Sistema_Notificaciones SHALL mostrar un Badge_Conteo sobre el icono de campana con la cantidad exacta de Notificaciones no leídas.
3. WHILE la cantidad de Notificaciones no leídas es mayor que 99, THE Sistema_Notificaciones SHALL mostrar el texto "99+" en el Badge_Conteo.
4. WHEN el usuario hace clic en el icono de campana, THE Sistema_Notificaciones SHALL abrir, en un máximo de 1 segundo, un panel con la lista de Notificaciones ordenadas de forma descendente por `creado_en` (de la más reciente a la más antigua).
5. WHEN el panel está abierto, THE Sistema_Notificaciones SHALL mostrar para cada Notificacion el título, el mensaje y el tiempo transcurrido desde `creado_en` en español según estos rangos: menos de 60 segundos muestra "Hace un momento"; de 1 a 59 minutos muestra "Hace N min"; de 1 a 23 horas muestra "Hace N h"; de 1 a 6 días muestra "Hace N d"; y a partir de 7 días muestra la fecha en formato día/mes/año.
6. WHEN el panel está abierto, THE Sistema_Notificaciones SHALL distinguir visualmente las Notificaciones no leídas de las leídas mediante un indicador visual persistente y observable presente únicamente en las no leídas.
7. WHEN el usuario hace clic en una Notificacion no leída, THE Sistema_Notificaciones SHALL marcarla como leída mediante `PATCH /api/notificaciones/{id}`, decrementar el Badge_Conteo en 1 y actualizar el indicador visual de esa Notificacion al estado leído.
8. IF la petición `PATCH /api/notificaciones/{id}` falla, THEN THE Sistema_Notificaciones SHALL conservar la Notificacion en estado no leída, mantener el Badge_Conteo sin cambios y mostrar un mensaje de error indicando que no se pudo marcar la notificación como leída.
9. WHEN el usuario activa la acción "Marcar todas como leídas", THE Sistema_Notificaciones SHALL invocar `POST /api/notificaciones/marcar-todas-leidas`, marcar todas las Notificaciones como leídas y dejar el Badge_Conteo en cero.
10. IF la petición `POST /api/notificaciones/marcar-todas-leidas` falla, THEN THE Sistema_Notificaciones SHALL conservar el estado no leído de las Notificaciones, mantener el Badge_Conteo sin cambios y mostrar un mensaje de error indicando que no se pudieron marcar las notificaciones como leídas.
11. WHILE no existen Notificaciones, THE Sistema_Notificaciones SHALL mostrar en el panel un estado vacío con el texto "No tienes notificaciones" y ocultar el Badge_Conteo.

### Requisito 10: Sonido de notificación

**User Story:** Como administrador, quiero escuchar un sonido sutil cuando llega una notificación, para enterarme sin tener que mirar la pantalla constantemente.

#### Acceptance Criteria

1. WHEN el Sistema_Notificaciones detecta en un ciclo de detección una o más Notificaciones nuevas no leídas que no existían en la consulta previa, THE Sistema_Notificaciones SHALL reproducir el Sonido_Notificacion una sola vez por ciclo de detección.
2. THE Sonido_Notificacion SHALL tener una duración no mayor a 2 segundos y un volumen no mayor al 50% del volumen máximo disponible.
3. THE Sistema_Notificaciones SHALL ofrecer un control con dos estados explícitos, activado y silenciado, para el Sonido_Notificacion.
4. WHILE el Sonido_Notificacion está silenciado, THE Sistema_Notificaciones SHALL mostrar las Notificaciones nuevas en el Centro_Notificaciones sin reproducir ningún audio.
5. THE Sistema_Notificaciones SHALL persistir la preferencia de activación o silencio del Sonido_Notificacion entre sesiones del navegador.
6. WHEN no existe una preferencia previamente almacenada del Sonido_Notificacion, THE Sistema_Notificaciones SHALL usar el estado activado como valor por defecto.
7. THE Sistema_Notificaciones SHALL mostrar siempre la Notificacion de forma visual en el Centro_Notificaciones, de modo que el Sonido_Notificacion nunca sea el único medio para enterarse de una Notificacion.
8. IF la reproducción del Sonido_Notificacion falla (por ejemplo, por bloqueo de reproducción automática del navegador), THEN THE Sistema_Notificaciones SHALL mostrar la Notificacion de forma visual sin interrumpir la operación ni mostrar un mensaje de error.

### Requisito 11: Detección de notificaciones nuevas en el cliente

**User Story:** Como administrador, quiero que el centro de notificaciones se mantenga al día mientras trabajo, para ver los avisos poco después de que ocurren.

#### Acceptance Criteria

1. WHILE la aplicación está abierta, THE Sistema_Notificaciones SHALL consultar `GET /api/notificaciones/conteo` cada 30 segundos.
2. WHEN una consulta periódica detecta un aumento en la cantidad de Notificaciones no leídas respecto a la consulta anterior, THE Sistema_Notificaciones SHALL actualizar el Badge_Conteo con la nueva cantidad, mostrando "99+" cuando esa cantidad es mayor que 99.
3. WHERE el Sonido_Notificacion no está silenciado, WHEN una consulta periódica detecta un aumento en la cantidad de Notificaciones no leídas, THE Sistema_Notificaciones SHALL reproducir el Sonido_Notificacion una vez por cada consulta con aumento.
4. IF una consulta periódica de conteo no responde dentro de un límite de 10 segundos, THEN THE Sistema_Notificaciones SHALL tratar la consulta como fallida.
5. IF una consulta periódica de notificaciones falla, THEN THE Sistema_Notificaciones SHALL conservar el último Badge_Conteo conocido sin modificarlo, no reproducir el Sonido_Notificacion y reintentar en el siguiente intervalo sin detener el ciclo.
6. WHEN el usuario abre el panel de Notificaciones, THE Sistema_Notificaciones SHALL recargar la lista mediante `GET /api/notificaciones`.
7. IF la recarga de la lista al abrir el panel falla o no responde dentro de un límite de 10 segundos, THEN THE Sistema_Notificaciones SHALL mostrar un indicador de error visible en el panel y ofrecer un control para reintentar.

### Requisito 12: Integración con el sistema de diseño

**User Story:** Como usuario, quiero que el dashboard y el centro de notificaciones respeten el sistema de diseño actual, para mantener una experiencia visual coherente.

#### Acceptance Criteria

1. THE Dashboard_Analitico SHALL renderizar su interfaz sin importar ni declarar librerías de UI adicionales a los componentes shadcn/ui presentes en `components/ui/` y el componente `recharts` ya disponible.
2. WHEN el usuario abre el Centro_Notificaciones, THE Sistema_Notificaciones SHALL renderizar el panel con un componente `Popover` o `Sheet` de `components/ui/` sin contenedores de librerías ajenas al sistema de diseño.
3. THE Dashboard_Analitico SHALL aplicar colores únicamente mediante las variables de color del tema (`bg-card`, `text-foreground`, `bg-primary`, `text-muted-foreground`, `border-border`), sin valores codificados en hex, rgb, hsl ni nombres de color CSS en clases o estilos en línea.
4. WHEN el Tema_Activo cambia entre claro y oscuro, THE Dashboard_Analitico SHALL re-renderizar sus componentes con la paleta del tema correspondiente sin conservar colores del tema anterior.
5. THE Sistema_Notificaciones SHALL mostrar todas las etiquetas, mensajes y textos de botón en español, sin texto visible en otro idioma.
6. WHEN el Dashboard_Analitico monta sus componentes, THE Dashboard_Analitico SHALL ubicar los nuevos componentes en `components/dashboard/` y el Centro_Notificaciones en `components/notificaciones/`, conservando `components/sections/dashboard-section.tsx` como punto de montaje.
7. IF un componente shadcn/ui requerido no está disponible en `components/ui/`, THEN THE Dashboard_Analitico SHALL mostrar un indicador de error visible sin recurrir a una librería de UI externa.

### Requisito 13: Accesibilidad

**User Story:** Como usuario que utiliza teclado o lector de pantalla, quiero que el dashboard y las notificaciones sean accesibles, para operar la aplicación sin depender de señales visuales o auditivas únicas.

#### Acceptance Criteria

1. THE Sistema_Notificaciones SHALL asignar al icono de campana un atributo `aria-label` descriptivo que incluya la cantidad de Notificaciones no leídas en el rango de 0 a 99, y el texto "99+" cuando la cantidad es mayor que 99.
2. WHEN la cantidad de Notificaciones no leídas cambia, THE Sistema_Notificaciones SHALL actualizar el `aria-label` del icono de campana en un máximo de 1 segundo.
3. WHEN llega una Notificacion nueva, THE Sistema_Notificaciones SHALL anunciarla mediante una región ARIA con `aria-live` cortés, de modo que el Sonido_Notificacion no sea la única señal de aviso.
4. THE Dashboard_Analitico SHALL permitir alcanzar el selector de Rango_Fechas y todos los elementos del panel de Notificaciones mediante la tecla Tab en un orden lógico y sin atrapar el foco del teclado.
5. THE Dashboard_Analitico SHALL permitir activar los controles del selector de Rango_Fechas y del panel de Notificaciones mediante las teclas Enter o Espacio, mostrando un indicador de foco visible con una relación de contraste mínima de 3:1.
6. THE Dashboard_Analitico SHALL garantizar una relación de contraste mínima de 4.5:1 entre texto y fondo en tarjetas KPI, etiquetas de gráficas y elementos del panel de Notificaciones, en el modo claro y en el modo oscuro.
7. THE Dashboard_Analitico SHALL proporcionar para cada gráfica una alternativa textual o tabla accesible, navegable por teclado y lector de pantalla, que contenga los mismos valores de datos representados en la gráfica.
8. WHERE el color comunica la dirección de una Variacion_Porcentual, THE Dashboard_Analitico SHALL acompañar el color con un icono o texto que indique si la variación es positiva o negativa.

### Requisito 14: Rendimiento

**User Story:** Como administrador, quiero que el dashboard y las notificaciones respondan rápido, para consultar la información sin esperas notables.

#### Acceptance Criteria

1. WHEN el endpoint `GET /api/dashboard/metricas` recibe una petición sobre un conjunto de hasta 100 000 Ventas, THE API_Backend SHALL responder con un tiempo de respuesta p95 inferior a 800 ms, medido sobre una muestra de al menos 100 peticiones consecutivas ejecutadas bajo carga nominal de hasta 10 peticiones concurrentes.
2. WHEN el endpoint `GET /api/dashboard/rankings` recibe una petición sobre un conjunto de hasta 100 000 Venta_Item, THE API_Backend SHALL responder con un tiempo de respuesta p95 inferior a 800 ms, medido sobre una muestra de al menos 100 peticiones consecutivas ejecutadas bajo carga nominal de hasta 10 peticiones concurrentes.
3. WHEN el endpoint `GET /api/notificaciones/conteo` recibe una petición, THE API_Backend SHALL responder con un tiempo de respuesta p95 inferior a 150 ms, medido sobre una muestra de al menos 100 peticiones consecutivas ejecutadas bajo carga nominal de hasta 10 peticiones concurrentes.
4. WHEN el usuario cambia el Rango_Fechas, THE Dashboard_Analitico SHALL reflejar las nuevas Metrica_KPI y Ranking_Productos en menos de 1 segundo tras recibir la respuesta del API_Backend.
5. WHILE el Dashboard_Analitico espera la respuesta del API_Backend tras un cambio de Rango_Fechas, THE Dashboard_Analitico SHALL mostrar un indicador de carga visible hasta que los datos se rendericen o se reciba un error.
6. THE Capa_Datos SHALL ejecutar las consultas agregadas del Dashboard utilizando los índices definidos sobre `ventas.creado_en` y `movimientos_stock.creado_en` en `inventario-ventas-core`, de forma que el plan de ejecución no realice un escaneo completo de tabla (full table scan) sobre `ventas` ni `movimientos_stock`.
7. IF una consulta agregada del Dashboard no produce respuesta dentro de un límite de 5 segundos, THEN THE API_Backend SHALL cancelar la consulta y responder con un error indicando que se excedió el tiempo de espera, sin dejar la petición bloqueada de forma indefinida.
