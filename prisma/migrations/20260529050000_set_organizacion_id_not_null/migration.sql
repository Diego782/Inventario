-- Migración 3: Establecer organizacion_id NOT NULL, añadir FKs y crear índices únicos compuestos
-- Prerequisito: La migración 2 ya eliminó todos los NULL mediante backfill.

-- ============================================================
-- Paso 1: ALTER organizacion_id a NOT NULL en cada tabla de negocio
-- ============================================================

ALTER TABLE `productos` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

ALTER TABLE `categorias` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

ALTER TABLE `movimientos_stock` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

ALTER TABLE `ventas` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

ALTER TABLE `venta_items` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

ALTER TABLE `configuracion` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

-- ============================================================
-- Paso 2: Añadir FK constraints a organizaciones(id)
-- ============================================================

ALTER TABLE `productos` ADD CONSTRAINT `productos_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `categorias` ADD CONSTRAINT `categorias_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `movimientos_stock` ADD CONSTRAINT `movimientos_stock_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `ventas` ADD CONSTRAINT `ventas_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `venta_items` ADD CONSTRAINT `venta_items_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE `configuracion` ADD CONSTRAINT `configuracion_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- Paso 3: Crear índices únicos compuestos por organizacion_id
-- ============================================================

-- productos: @@unique([organizacion_id, sku])
CREATE UNIQUE INDEX `productos_organizacion_id_sku_key` ON `productos`(`organizacion_id`, `sku`);

-- productos: @@unique([organizacion_id, codigo_barras])
CREATE UNIQUE INDEX `productos_organizacion_id_codigo_barras_key` ON `productos`(`organizacion_id`, `codigo_barras`);

-- categorias: @@unique([organizacion_id, nombre])
CREATE UNIQUE INDEX `categorias_organizacion_id_nombre_key` ON `categorias`(`organizacion_id`, `nombre`);

-- ============================================================
-- Paso 4: Recrear folio unique en ventas (global, según schema)
-- ============================================================

CREATE UNIQUE INDEX `ventas_folio_key` ON `ventas`(`folio`);

-- ============================================================
-- Paso 5: Establecer PK compuesta en configuracion
-- ============================================================

ALTER TABLE `configuracion` ADD PRIMARY KEY (`organizacion_id`, `clave`);
