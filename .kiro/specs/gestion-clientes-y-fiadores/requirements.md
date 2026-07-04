# Requirements Document

## Introduction

Esta especificación cubre un conjunto de correcciones y funcionalidad nueva para **Dego**, el sistema de inventario y ventas multi-tenant (organizaciones) construido con Next.js 16 / React 19 / TypeScript. Todos los textos e interfaces son en español y deben seguir el system design existente (shadcn/ui, Tailwind CSS v4, lucide-react, secciones en `components/sections/`).

El alcance incluye:

1. Corrección del aislamiento multi-tenant en las métricas del dashboard.
2. Nueva métrica de valor de mercancía en inventario (inversión y recaudación potencial).
3. Corrección del filtro por talla en la sección Inventario.
4. Nueva sección de Clientes con la cédula como llave primaria de negocio.
5. Rework de la sección Fiadores como historial de deuda por cliente, con abonos.
6. Cambios en Ventas: cliente opcional (obligatorio solo en ventas fiadas), plazo de deuda para fiado, y descuentos por producto y sobre el total.
7. Notificaciones con acciones rápidas (stock cero, stock crítico, vencimiento de deuda de fiador).
8. Ajustes a las métricas de Ventas (excluir fiado no pagado, mostrar dinero en deuda) y mejoras al filtro de Inventario (stock crítico y rango de stock).

Todo el trabajo debe respetar una restricción crítica de **migración aditiva y retrocompatible**: la introducción de la tabla de clientes y sus relaciones no debe romper ni perder datos existentes. Las ventas ya realizadas sin cliente deben permanecer válidas, y las ventas en estado "fiado" que hoy no tienen cliente asociado deben seguir existiendo.

## Glossary

- **Organizacion**: Tenant del sistema. Todo dato de negocio (productos, ventas, clientes, notificaciones, métricas) pertenece a exactamente una Organizacion y debe estar aislado del resto.
- **Dashboard_Analitico**: Sección Dashboard que muestra métricas agregadas y rankings de la Organizacion activa.
- **Metrica_Dashboard**: Valor agregado calculado (ventas totales, gastos, devoluciones, ganancia estimada, etc.) mostrado en el Dashboard_Analitico.
- **Producto**: Artículo del catálogo de inventario. Tiene `precio_compra`, `precio_venta`, `stock_actual` y `stock_minimo`. Puede tener variantes por talla (`VarianteProducto`).
- **VarianteProducto**: Variante de un Producto identificada por una `talla`, con su propio `stock_actual`. Cuando un Producto tiene variantes, su `talla` de raíz es nula y las tallas viven en las variantes.
- **Valor_Inventario**: Métrica de inventario compuesta por dos cifras: la Inversion_Inventario y la Recaudacion_Potencial.
- **Inversion_Inventario**: Suma sobre todos los Productos activos de la Organizacion de `precio_compra × stock_actual`.
- **Recaudacion_Potencial**: Suma sobre todos los Productos activos de la Organizacion de `precio_venta × stock_actual`.
- **Estado_Stock**: Clasificación del stock de un Producto: "En Stock", "Bajo Stock" o "Crítico". Crítico cuando `stock_actual = 0` o `stock_actual ≤ stock_minimo × 0.3`; Bajo Stock cuando `stock_actual ≤ stock_minimo`; en otro caso En Stock.
- **Cliente**: Persona registrada en la Organizacion, identificada de forma única por su Cedula dentro de la Organizacion. Tiene nombre, correo, teléfono y dirección opcional.
- **Cedula**: Documento de identidad que actúa como llave única de negocio del Cliente dentro de la Organizacion.
- **Venta**: Transacción de venta. Puede tener un Cliente asociado de forma opcional. Tiene método de pago y, cuando es fiada, un Plazo_Deuda.
- **Metodo_Pago**: Uno de: efectivo, tarjeta, transferencia, fiado.
- **Venta_Fiada**: Venta cuyo Metodo_Pago es "fiado". Requiere un Cliente asociado y un Plazo_Deuda.
- **Plazo_Deuda**: Fecha límite asociada a la deuda de una Venta_Fiada.
- **Descuento_Producto**: Reducción de monto aplicada a una línea de la Venta (un Producto).
- **Descuento_Total**: Reducción de monto aplicada sobre el total de la Venta.
- **Fiador**: En el contexto de esta especificación, un Cliente que tiene al menos una deuda pendiente (saldo mayor que cero). La sección Fiadores lista Clientes con deuda.
- **Movimiento_Deuda**: Registro cronológico del historial de deuda de un Cliente. Puede ser un cargo (compra fiada) o un abono (pago).
- **Cargo_Deuda**: Movimiento_Deuda que incrementa el saldo del Cliente (una compra fiada).
- **Abono_Deuda**: Movimiento_Deuda que reduce el saldo del Cliente (un pago).
- **Saldo_Deuda**: Monto total que un Cliente adeuda en un instante dado, igual a la suma de Cargos_Deuda menos la suma de Abonos_Deuda.
- **Total_Clientes_Con_Deuda**: Cantidad de Clientes de la Organizacion cuyo Saldo_Deuda es mayor que cero.
- **Total_Deuda_Pendiente**: Suma de los Saldo_Deuda de todos los Clientes de la Organizacion.
- **Ventas_Totales**: Metrica_Dashboard de ingresos por ventas. No incluye el monto de Ventas_Fiadas mientras la deuda no esté pagada.
- **Notificacion**: Aviso generado por el sistema para la Organizacion (por ejemplo, stock crítico, stock cero, vencimiento de deuda).
- **Accion_Rapida**: Botón dentro de una Notificacion que abre un modal o ejecuta una acción directa relacionada con la notificación.
- **Modal_Ajuste_Stock**: Modal flotante existente que permite ajustar (sumar) stock de un Producto rápidamente.
- **Modal_Confirmacion_Eliminar**: Modal flotante que solicita confirmación antes de eliminar un Producto.

## Requirements

### Requirement 1: Aislamiento multi-tenant de métricas del Dashboard

**User Story:** Como administrador de una organización, quiero que el Dashboard solo muestre métricas de mi propia organización, para no ver datos que pertenecen a otra organización.

#### Acceptance Criteria

1. WHEN el Dashboard_Analitico solicita las Metricas_Dashboard, THE Sistema SHALL calcular cada Metrica_Dashboard usando exclusivamente registros cuyo `organizacion_id` sea igual al de la Organizacion activa, sin incluir ningún registro cuyo `organizacion_id` sea distinto.
2. WHEN el Dashboard_Analitico solicita los rankings de productos, THE Sistema SHALL calcular cada ranking usando exclusivamente registros cuyo `organizacion_id` sea igual al de la Organizacion activa, sin incluir ningún registro cuyo `organizacion_id` sea distinto.
3. WHEN el Sistema calcula Ventas_Totales, gastos, devoluciones y ganancia estimada, THE Sistema SHALL restringir las agregaciones de ventas, ítems de venta y movimientos de stock exclusivamente a registros de la Organizacion activa.
4. IF una petición de métricas o rankings no tiene una Organizacion activa resuelta, THEN THE Sistema SHALL responder con un error de autorización que indica la ausencia de Organizacion activa, sin devolver ninguna métrica ni ranking y sin exponer datos de otras organizaciones.
5. WHERE existen registros de otras organizaciones en la base de datos, THE Sistema SHALL excluirlos del cálculo de toda Metrica_Dashboard y ranking de la Organizacion activa.
6. IF la Organizacion activa no tiene registros que contribuyan a una métrica o ranking, THEN THE Sistema SHALL devolver esa métrica con valor cero y ese ranking como lista vacía, sin generar error.

### Requirement 2: Métrica de Valor de Inventario

**User Story:** Como administrador, quiero ver cuánto dinero tengo invertido en mercancía y cuánto recaudaría si la vendiera toda, para conocer el valor de mi inventario.

#### Acceptance Criteria

1. WHEN el usuario visualiza la sección Inventario, THE Sistema SHALL mostrar la métrica Valor_Inventario con dos cifras diferenciadas: "Inversión" (Inversion_Inventario) y "Recaudación potencial" (Recaudacion_Potencial).
2. THE Sistema SHALL calcular la Inversion_Inventario como la suma de `precio_compra × stock_actual` sobre todos los Productos no eliminados (activos) de la Organizacion activa, tratando como cero la contribución de un Producto cuyo `precio_compra` o `stock_actual` sea nulo.
3. THE Sistema SHALL calcular la Recaudacion_Potencial como la suma de `precio_venta × stock_actual` sobre todos los Productos no eliminados (activos) de la Organizacion activa, tratando como cero la contribución de un Producto cuyo `precio_venta` o `stock_actual` sea nulo.
4. WHEN un Producto tiene VarianteProducto, THE Sistema SHALL usar la suma del `stock_actual` de sus variantes como stock del Producto y contar ese Producto una sola vez, sin doble conteo.
5. THE Sistema SHALL calcular el Valor_Inventario usando únicamente Productos cuyo `organizacion_id` coincide con la Organizacion activa.
6. IF la Organizacion activa no tiene Productos no eliminados (activos), THEN THE Sistema SHALL mostrar la Inversion_Inventario y la Recaudacion_Potencial con valor cero (0,00).
7. IF una petición de Valor_Inventario no tiene una Organizacion activa resuelta, THEN THE Sistema SHALL responder con un error de autorización sin devolver la métrica.
8. THE Sistema SHALL aplicar redondeo bancario (redondeo al par más cercano) a 2 decimales a los montos de Inversion_Inventario y Recaudacion_Potencial antes de mostrarlos.
9. THE Sistema SHALL presentar la métrica Valor_Inventario siguiendo el system design existente (componentes de tarjeta de estadística y formato de moneda en español con 2 decimales y separadores regionales).

### Requirement 3: Corrección del filtro por talla en Inventario

**User Story:** Como usuario de inventario, quiero filtrar productos por talla y obtener resultados, para encontrar rápidamente los productos de una talla específica.

#### Acceptance Criteria

1. WHEN el usuario aplica un filtro por una talla específica en la sección Inventario, THE Sistema SHALL devolver los Productos cuyo campo `talla` del Producto raíz coincide con el valor del filtro, o que tienen al menos una VarianteProducto cuya `talla` coincide con el valor del filtro, donde una coincidencia se define como igualdad exacta del texto tras eliminar los espacios en blanco iniciales y finales y sin distinguir mayúsculas de minúsculas.
2. WHEN un Producto coincide con la talla del filtro tanto por su `talla` de raíz como por una o más de sus VarianteProducto, THE Sistema SHALL incluir ese Producto exactamente una vez en el resultado, sin filas duplicadas.
3. WHEN el usuario aplica un filtro por talla y ningún Producto de la Organizacion activa coincide con esa talla según el criterio del punto 1, THE Sistema SHALL devolver una lista vacía y responder de forma satisfactoria sin generar ningún error.
4. WHEN el usuario aplica un filtro por talla junto con otros filtros, THE Sistema SHALL devolver únicamente los Productos que satisfacen simultáneamente el filtro de talla y cada uno de los demás filtros aplicados (conjunción AND).
5. THE Sistema SHALL aplicar el filtro por talla únicamente sobre Productos cuyo `organizacion_id` coincide con la Organizacion activa.
6. WHEN el usuario limpia el filtro por talla, THE Sistema SHALL devolver los Productos de la Organizacion activa sin aplicar ninguna restricción de talla.
7. IF el usuario introduce un valor de talla cuya longitud, tras eliminar espacios en blanco iniciales y finales, supera 20 caracteres, THEN THE Sistema SHALL rechazar el filtro con un error de validación que indica que la talla excede la longitud máxima permitida, sin modificar el resultado mostrado previamente.

### Requirement 4: Gestión de Clientes (CRUD)

**User Story:** Como administrador, quiero registrar y gestionar clientes con su cédula, nombre, correo, teléfono y dirección, para tener una base de clientes de mi organización.

#### Acceptance Criteria

1. WHEN el usuario crea un Cliente con Cedula, nombre y teléfono válidos, THE Sistema SHALL persistir el Cliente asociado a la Organizacion activa, aceptando correo y dirección como campos opcionales.
2. THE Sistema SHALL tratar el correo y la dirección del Cliente como campos opcionales, y la Cedula, el nombre y el teléfono como campos obligatorios.
3. WHEN el usuario crea un Cliente con una Cedula que ya existe en la Organizacion activa, THE Sistema SHALL rechazar la operación con un error de conflicto que indica que la Cedula ya está registrada.
4. WHERE dos organizaciones distintas registran la misma Cedula, THE Sistema SHALL permitir ambos registros porque la unicidad de la Cedula es por Organizacion.
5. WHEN el usuario consulta la lista de Clientes, THE Sistema SHALL devolver únicamente los Clientes de la Organizacion activa.
6. WHEN el usuario edita los datos de un Cliente existente de la Organizacion activa, THE Sistema SHALL actualizar el Cliente con los nuevos valores.
7. IF el usuario intenta editar o eliminar un Cliente que no pertenece a la Organizacion activa, THEN THE Sistema SHALL responder con un error de recurso no encontrado.
8. WHEN el usuario elimina un Cliente que no tiene Ventas ni Movimientos_Deuda asociados, THE Sistema SHALL eliminar el Cliente.
9. IF el usuario intenta eliminar un Cliente que tiene Ventas o Movimientos_Deuda asociados, THEN THE Sistema SHALL impedir la eliminación e informar que el Cliente tiene historial asociado.
10. IF el usuario proporciona un correo cuyo formato no corresponde a `usuario@dominio.tld` o supera 254 caracteres al crear o editar un Cliente, THEN THE Sistema SHALL rechazar la operación con un error de validación.
11. IF el usuario crea o edita un Cliente con Cedula ausente o fuera del rango de 5 a 20 caracteres alfanuméricos, con nombre ausente o mayor a 100 caracteres, o con teléfono ausente o fuera del rango de 7 a 15 dígitos, THEN THE Sistema SHALL rechazar la operación con un error de validación.
12. THE Sistema SHALL presentar la sección Clientes siguiendo el system design existente, mostrando la Cedula, el nombre y el teléfono como campos obligatorios, y el correo y la dirección como campos opcionales.
13. THE Sistema SHALL validar los formatos y longitudes de Cedula (5–20 alfanuméricos), nombre (≤100 caracteres), teléfono (7–15 dígitos) y correo (`usuario@dominio.tld`, ≤254 caracteres) tanto en creación como en edición.
14. WHEN el usuario consulta la lista de Clientes, THE Sistema SHALL paginar el resultado con un máximo de 50 Clientes por página.

### Requirement 5: Sección Fiadores (historial de deuda por cliente)

**User Story:** Como administrador, quiero ver qué clientes me deben dinero y el historial cronológico de sus movimientos de deuda, para dar seguimiento a los cobros.

#### Acceptance Criteria

1. THE Sistema SHALL mostrar en la sección Fiadores únicamente los Clientes de la Organizacion activa cuyo Saldo_Deuda es mayor que cero.
2. WHEN el usuario abre el detalle de un Cliente con deuda, THE Sistema SHALL mostrar sus Movimientos_Deuda en orden cronológico ascendente por fecha, con desempate por orden de registro, indicando por cada movimiento la fecha, el tipo (Cargo_Deuda o Abono_Deuda), el monto y el Saldo_Deuda resultante.
3. THE Sistema SHALL calcular el Saldo_Deuda de un Cliente como la suma de sus Cargos_Deuda menos la suma de sus Abonos_Deuda, aplicando redondeo bancario a 2 decimales.
4. THE Sistema SHALL mostrar en la parte superior de la sección un recuadro con el Total_Clientes_Con_Deuda de la Organizacion activa.
5. THE Sistema SHALL mostrar en la parte superior de la sección un recuadro con el Total_Deuda_Pendiente de la Organizacion activa, con redondeo bancario a 2 decimales.
6. THE Sistema SHALL calcular el Total_Deuda_Pendiente como la suma de los Saldo_Deuda de todos los Clientes de la Organizacion activa, aplicando redondeo bancario a 2 decimales.
7. WHEN el usuario registra un Abono_Deuda para un Cliente por un monto en el rango [0.01, Saldo_Deuda actual] con hasta 2 decimales, THE Sistema SHALL registrar el Abono_Deuda con su fecha y recalcular el Saldo_Deuda del Cliente.
8. IF el usuario intenta registrar un Abono_Deuda mayor que el Saldo_Deuda actual del Cliente, THEN THE Sistema SHALL rechazar la operación con un error de validación, sin registrar movimiento ni alterar el Saldo_Deuda.
9. IF el usuario intenta registrar un Abono_Deuda menor que 0.01, THEN THE Sistema SHALL rechazar la operación con un error de validación, sin registrar movimiento ni alterar el Saldo_Deuda.
10. WHEN un Abono_Deuda deja el Saldo_Deuda de un Cliente en cero, THE Sistema SHALL dejar de listar a ese Cliente entre los Clientes con deuda.
11. IF el usuario intenta registrar un Cargo_Deuda o Abono_Deuda para una persona que no existe como Cliente en la Organizacion activa, THEN THE Sistema SHALL rechazar la operación indicando que debe existir primero como Cliente.
12. THE Sistema SHALL asociar cada Movimiento_Deuda a la Organizacion activa y calcular los totales usando únicamente Movimientos_Deuda y Clientes de esa Organizacion.
13. IF la Organizacion activa no tiene Clientes con Saldo_Deuda mayor que cero, THEN THE Sistema SHALL mostrar la lista de fiadores vacía y los recuadros de Total_Clientes_Con_Deuda y Total_Deuda_Pendiente en cero.
14. THE Sistema SHALL presentar la sección Fiadores siguiendo el system design existente.

### Requirement 6: Cliente en ventas y venta fiada

**User Story:** Como vendedor, quiero registrar una venta con o sin cliente, y cuando sea fiada elegir el cliente y el plazo de la deuda, para no complicar las ventas de contado y a la vez controlar las fiadas.

#### Acceptance Criteria

1. WHEN el usuario registra una Venta cuyo Metodo_Pago no es "fiado", THE Sistema SHALL permitir completar la Venta sin un Cliente asociado.
2. WHEN el usuario registra una Venta cuyo Metodo_Pago no es "fiado" y selecciona un Cliente, THE Sistema SHALL asociar ese Cliente a la Venta, restringiendo las opciones de Cliente a los de la Organizacion activa.
3. WHEN el usuario selecciona el Metodo_Pago "fiado", THE Sistema SHALL requerir la selección de un Cliente existente en la Organizacion activa.
4. WHEN el usuario selecciona el Metodo_Pago "fiado", THE Sistema SHALL requerir un Plazo_Deuda cuya fecha límite sea igual o posterior a la fecha de registro de la Venta.
5. IF el usuario intenta registrar una Venta_Fiada sin Cliente, sin Plazo_Deuda, o con un Plazo_Deuda anterior a la fecha de registro de la Venta, THEN THE Sistema SHALL rechazar la operación con un error de validación que indica el campo faltante o inválido, sin persistir la Venta.
6. WHEN el usuario registra una Venta_Fiada válida, THE Sistema SHALL crear, en la misma transacción que la Venta, un Cargo_Deuda por el total de la Venta tras descuentos e impuestos (según Requirement 7), asociado al Cliente seleccionado.
7. THE Sistema SHALL tratar el Cliente asociado a una Venta como una relación opcional y retrocompatible, de modo que las Ventas existentes sin Cliente permanezcan válidas.
8. WHEN el usuario selecciona un Cliente para una Venta_Fiada, THE Sistema SHALL restringir las opciones de Cliente a los Clientes de la Organizacion activa.
9. IF el usuario intenta registrar una Venta_Fiada con un Cliente que no pertenece a la Organizacion activa, THEN THE Sistema SHALL rechazar la operación con un error de recurso no encontrado, sin persistir la Venta.
10. IF la creación del Cargo_Deuda asociado a una Venta_Fiada falla, THEN THE Sistema SHALL revertir la transacción completa dejando la Venta sin registrar.

### Requirement 7: Descuentos en la venta

**User Story:** Como vendedor, quiero aplicar descuentos por producto y un descuento sobre el total, para ofrecer rebajas al momento de la venta.

#### Acceptance Criteria

1. WHEN el usuario aplica un Descuento_Producto, expresado como un monto en la moneda de la Venta con hasta 2 decimales, a una línea de la Venta, THE Sistema SHALL restar ese Descuento_Producto del subtotal de esa línea, permitiendo que el subtotal de línea resultante sea cero cuando el Descuento_Producto es igual al subtotal de la línea.
2. WHEN el usuario aplica un Descuento_Total, expresado como un monto en la moneda de la Venta con hasta 2 decimales, a la Venta, THE Sistema SHALL restar ese Descuento_Total de la suma de los subtotales de línea (ya con Descuento_Producto aplicado) antes de sumar los impuestos que correspondan.
3. THE Sistema SHALL calcular el total de la Venta como la suma de los subtotales de línea (ya con Descuento_Producto aplicado) menos el Descuento_Total, más los impuestos que correspondan; WHERE la Organizacion activa no tiene impuestos configurados, THE Sistema SHALL usar un monto de impuestos igual a cero.
4. IF un Descuento_Producto es mayor que el subtotal de su línea, THEN THE Sistema SHALL rechazar la operación con un error de validación que indica que el Descuento_Producto excede el subtotal de la línea, y SHALL preservar la Venta sin aplicar ese descuento.
5. IF el Descuento_Total es mayor que la suma de los subtotales de línea (ya con Descuento_Producto aplicado), THEN THE Sistema SHALL rechazar la operación con un error de validación que indica que el Descuento_Total excede la suma de subtotales, y SHALL preservar la Venta sin aplicar ese descuento.
6. IF un Descuento_Producto o un Descuento_Total es menor que cero, THEN THE Sistema SHALL rechazar la operación con un error de validación que indica que los descuentos no pueden ser negativos, y SHALL preservar la Venta sin cambios.
7. THE Sistema SHALL aplicar redondeo bancario (redondeo al par más cercano) a 2 decimales a cada subtotal de línea y al total de la Venta tras aplicar los descuentos.
8. WHEN el usuario no aplica descuentos, es decir Descuento_Producto y Descuento_Total ausentes o iguales a cero, THE Sistema SHALL calcular el total de la Venta como la suma de los subtotales de línea más los impuestos que correspondan, produciendo el mismo resultado que antes de esta funcionalidad (retrocompatibilidad).

### Requirement 8: Notificaciones con acciones rápidas

**User Story:** Como administrador, quiero recibir notificaciones accionables cuando un producto se queda sin stock, está en stock crítico o vence la deuda de un fiador, para resolver la situación con un clic.

#### Acceptance Criteria

1. WHEN el `stock_actual` de un Producto llega a cero, THE Sistema SHALL generar, dentro de los 5 segundos posteriores al cambio de stock, una Notificacion de tipo "stock cero" para la Organizacion del Producto.
2. THE Sistema SHALL incluir en la Notificacion de tipo "stock cero" dos Acciones_Rapidas: "Ajustar stock" y "Eliminar producto".
3. WHEN el usuario activa la Accion_Rapida "Ajustar stock" de una Notificacion, THE Sistema SHALL abrir el Modal_Ajuste_Stock para el Producto correspondiente.
4. WHEN el usuario activa la Accion_Rapida "Eliminar producto" de una Notificacion, THE Sistema SHALL abrir el Modal_Confirmacion_Eliminar para el Producto correspondiente y solo eliminarlo tras la confirmación del usuario.
5. WHEN el Estado_Stock de un Producto pasa a "Crítico" sin que `stock_actual` sea cero, THE Sistema SHALL generar, dentro de los 5 segundos posteriores al cambio de stock, una Notificacion de tipo "stock crítico" que incluye únicamente la Accion_Rapida "Ajustar stock".
6. THE Sistema SHALL excluir la Accion_Rapida "Eliminar producto" de las Notificaciones de tipo "stock crítico".
7. WHEN el Plazo_Deuda de una Venta_Fiada con Saldo_Deuda mayor que cero llega a su fecha límite, THE Sistema SHALL generar una Notificacion de tipo "vencimiento de deuda" que incluye únicamente la Accion_Rapida "Extender deuda".
8. WHEN el usuario activa la Accion_Rapida "Extender deuda" e indica una nueva fecha posterior al Plazo_Deuda vigente, THE Sistema SHALL asignar ese nuevo Plazo_Deuda a la deuda del Cliente.
9. IF el usuario indica en "Extender deuda" una fecha igual o anterior al Plazo_Deuda vigente, THEN THE Sistema SHALL rechazar la operación con un error de validación, conservando el Plazo_Deuda vigente.
10. THE Sistema SHALL asociar cada Notificacion a la Organizacion correspondiente mediante `organizacion_id` y mostrar a cada usuario únicamente las Notificaciones de su Organizacion activa.
11. THE Sistema SHALL definir la clave de deduplicación de una Notificacion como la combinación de `organizacion_id`, tipo de Notificacion e identificador del Producto o de la deuda asociada.
12. WHERE ya existe una Notificacion no leída con la misma clave de deduplicación, THE Sistema SHALL evitar generar una Notificacion duplicada.

### Requirement 9: Métricas de ventas y dinero en deuda

**User Story:** Como administrador, quiero que las ventas totales no incluyan las fiadas hasta que se paguen y ver por separado el dinero en deuda, para entender mi ingreso real.

#### Acceptance Criteria

1. WHEN el Sistema calcula las Ventas_Totales, THE Sistema SHALL excluir el monto de las Ventas_Fiadas cuyo Saldo_Deuda asociado sea mayor que cero.
2. WHILE una Venta_Fiada tiene abonos parciales pero su Saldo_Deuda asociado sigue siendo mayor que cero, THE Sistema SHALL excluir por completo el monto de esa Venta_Fiada de las Ventas_Totales.
3. WHEN el Saldo_Deuda asociado a una Venta_Fiada llega a cero, THE Sistema SHALL incluir el monto total de esa Venta_Fiada en las Ventas_Totales.
4. THE Sistema SHALL mostrar junto a las Ventas_Totales una métrica "Total de dinero en deuda" con el valor del Total_Deuda_Pendiente de la Organizacion activa.
5. THE Sistema SHALL calcular el "Total de dinero en deuda" con el mismo criterio y valor que el Total_Deuda_Pendiente de la sección Fiadores, para la misma Organizacion activa en el mismo instante.
6. IF la Organizacion activa no tiene Clientes con Saldo_Deuda mayor que cero, THEN THE Sistema SHALL mostrar el "Total de dinero en deuda" con valor cero.
7. THE Sistema SHALL calcular las Ventas_Totales y el "Total de dinero en deuda" usando únicamente registros cuyo `organizacion_id` coincide con la Organizacion activa, aplicando redondeo bancario a 2 decimales.

### Requirement 10: Filtro de Inventario por stock crítico y rango de stock

**User Story:** Como usuario de inventario, quiero filtrar por productos en stock crítico y por un rango de stock, para encontrar rápidamente los productos que necesitan atención.

#### Acceptance Criteria

1. WHEN el usuario activa el filtro "stock crítico" en la sección Inventario, THE Sistema SHALL devolver únicamente los Productos de la Organizacion activa cuyo Estado_Stock es "Crítico" según la definición del glosario.
2. THE Sistema SHALL reemplazar el campo de filtro "Stock inicial" por un filtro "Stock" definido como un rango con límite mínimo y máximo, ambos enteros opcionales de forma independiente en el intervalo de 0 a 999.999.999.
3. WHEN el usuario aplica un rango de "Stock" con mínimo y máximo, THE Sistema SHALL devolver los Productos cuyo `stock_actual` está entre el mínimo y el máximo, ambos inclusive.
4. WHEN el usuario aplica un rango de "Stock" solo con mínimo, THE Sistema SHALL devolver los Productos cuyo `stock_actual` es mayor o igual al mínimo.
5. WHEN el usuario aplica un rango de "Stock" solo con máximo, THE Sistema SHALL devolver los Productos cuyo `stock_actual` es menor o igual al máximo.
6. IF el usuario aplica un rango de "Stock" cuyo mínimo es mayor que el máximo, THEN THE Sistema SHALL rechazar el filtro con un mensaje de validación que indica que el mínimo no puede superar al máximo, conservando el resultado mostrado previamente sin modificar la lista.
7. IF el usuario introduce en el rango de "Stock" un valor negativo, no entero o fuera del intervalo de 0 a 999.999.999, THEN THE Sistema SHALL rechazar el filtro con un mensaje de validación, conservando el resultado mostrado previamente.
8. WHEN el usuario aplica filtros de stock que ningún Producto de la Organizacion activa satisface, THE Sistema SHALL devolver una lista vacía sin generar error.
9. WHEN el usuario combina el filtro "stock crítico" con el rango de "Stock" u otros filtros, THE Sistema SHALL devolver únicamente los Productos que satisfacen simultáneamente todos los filtros aplicados (conjunción AND).
10. THE Sistema SHALL aplicar los filtros de stock crítico y rango de stock únicamente sobre Productos cuyo `organizacion_id` coincide con la Organizacion activa.

### Requirement 11: Migración de datos aditiva y retrocompatible

**User Story:** Como propietario del sistema, quiero que la introducción de clientes y las nuevas relaciones no rompan ni pierdan datos existentes, para conservar la información histórica.

#### Acceptance Criteria

1. WHEN se aplica la migración de base de datos que introduce la tabla de Clientes y las relaciones de deuda, THE Sistema SHALL conservar el mismo conteo de registros de Productos, Ventas, ítems de venta, movimientos de stock y notificaciones que existían antes de la migración, sin modificar los valores de sus columnas preexistentes.
2. THE Sistema SHALL definir la relación entre Venta y Cliente como opcional (nullable), de modo que las Ventas existentes sin Cliente permanezcan válidas tras la migración.
3. WHERE existen Ventas en estado "fiado" sin Cliente asociado antes de la migración, THE Sistema SHALL mantenerlas existentes, válidas y con su estado "fiado" después de la migración.
4. THE Sistema SHALL aplicar solo cambios aditivos al esquema (nuevas tablas y nuevas columnas opcionales) sin eliminar ni volver obligatorias columnas de las que dependan datos existentes.
5. WHEN la migración crea nuevas relaciones que referencian Clientes, THE Sistema SHALL permitir valores nulos en esas referencias para las filas históricas que no tienen Cliente.
6. THE Sistema SHALL asociar la tabla de Clientes y toda entidad de deuda a una Organizacion mediante `organizacion_id` para preservar el aislamiento multi-tenant.
7. IF la migración falla durante su aplicación, THEN THE Sistema SHALL revertir por completo los cambios al estado previo a la migración e indicar el error, sin dejar el esquema en un estado parcial.
8. WHEN la migración se reaplica sobre una base de datos ya migrada, THE Sistema SHALL completarse sin duplicar tablas ni columnas y sin alterar los datos existentes (idempotencia).
