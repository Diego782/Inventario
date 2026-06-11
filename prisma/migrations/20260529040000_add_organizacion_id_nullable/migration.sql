-- Migración 2: Agregar organizacion_id NULL a tablas de negocio y backfill
-- Esta migración es aditiva y no destructiva sobre los datos existentes.

-- ============================================================
-- Paso 1: Agregar columna organizacion_id NULL a cada tabla de negocio
-- ============================================================

ALTER TABLE `productos` ADD COLUMN `organizacion_id` CHAR(36) NULL;

ALTER TABLE `categorias` ADD COLUMN `organizacion_id` CHAR(36) NULL;

ALTER TABLE `movimientos_stock` ADD COLUMN `organizacion_id` CHAR(36) NULL;

ALTER TABLE `ventas` ADD COLUMN `organizacion_id` CHAR(36) NULL;

ALTER TABLE `venta_items` ADD COLUMN `organizacion_id` CHAR(36) NULL;

-- configuracion: cambiar PK de solo `clave` a compuesta (organizacion_id, clave)
ALTER TABLE `configuracion` DROP PRIMARY KEY;
ALTER TABLE `configuracion` ADD COLUMN `organizacion_id` CHAR(36) NULL;

-- ============================================================
-- Paso 2: Crear índices sobre organizacion_id
-- ============================================================

CREATE INDEX `productos_organizacion_id_idx` ON `productos`(`organizacion_id`);
CREATE INDEX `categorias_organizacion_id_idx` ON `categorias`(`organizacion_id`);
CREATE INDEX `movimientos_stock_organizacion_id_idx` ON `movimientos_stock`(`organizacion_id`);
CREATE INDEX `ventas_organizacion_id_idx` ON `ventas`(`organizacion_id`);
CREATE INDEX `venta_items_organizacion_id_idx` ON `venta_items`(`organizacion_id`);

-- ============================================================
-- Paso 3: Backfill — crear Organización Principal solo si existen filas sin tenant
-- ============================================================

-- Crear un usuario semilla del sistema si no existe ningún usuario (necesario para creado_por FK)
INSERT IGNORE INTO `usuarios` (`id`, `correo`, `nombre`, `hash_contrasena`, `correo_verificado`, `estado`, `creado_en`, `actualizado_en`)
SELECT '00000000-0000-4000-8000-000000000000', 'sistema@invenpro.local', 'Sistema', '$2a$12$000000000000000000000uGHEGMnfJGVjHqNGxP3MXqROpJxNJ6i', true, 'activo', NOW(), NOW()
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `productos` WHERE `organizacion_id` IS NULL)
  AND NOT EXISTS (SELECT 1 FROM `usuarios` LIMIT 1);

-- Crear la Organización Principal solo si hay filas de negocio sin tenant y no existe ya
INSERT INTO `organizaciones` (`id`, `nombre`, `slug`, `creado_por`, `creado_en`, `actualizado_en`)
SELECT '00000000-0000-4000-8000-000000000001', 'Organización Principal', 'principal',
       COALESCE((SELECT `id` FROM `usuarios` LIMIT 1), '00000000-0000-4000-8000-000000000000'),
       NOW(), NOW()
FROM DUAL
WHERE EXISTS (SELECT 1 FROM `productos` WHERE `organizacion_id` IS NULL
        UNION SELECT 1 FROM `categorias` WHERE `organizacion_id` IS NULL
        UNION SELECT 1 FROM `movimientos_stock` WHERE `organizacion_id` IS NULL
        UNION SELECT 1 FROM `ventas` WHERE `organizacion_id` IS NULL
        UNION SELECT 1 FROM `venta_items` WHERE `organizacion_id` IS NULL
        UNION SELECT 1 FROM `configuracion` WHERE `organizacion_id` IS NULL)
  AND NOT EXISTS (SELECT 1 FROM `organizaciones` WHERE `slug` = 'principal');

-- ============================================================
-- Paso 4: Backfill — asignar organizacion_id a todas las filas sin tenant
-- ============================================================

UPDATE `productos`        SET `organizacion_id` = '00000000-0000-4000-8000-000000000001' WHERE `organizacion_id` IS NULL;
UPDATE `categorias`       SET `organizacion_id` = '00000000-0000-4000-8000-000000000001' WHERE `organizacion_id` IS NULL;
UPDATE `movimientos_stock` SET `organizacion_id` = '00000000-0000-4000-8000-000000000001' WHERE `organizacion_id` IS NULL;
UPDATE `ventas`           SET `organizacion_id` = '00000000-0000-4000-8000-000000000001' WHERE `organizacion_id` IS NULL;
UPDATE `venta_items`      SET `organizacion_id` = '00000000-0000-4000-8000-000000000001' WHERE `organizacion_id` IS NULL;
UPDATE `configuracion`    SET `organizacion_id` = '00000000-0000-4000-8000-000000000001' WHERE `organizacion_id` IS NULL;

-- ============================================================
-- Paso 5: Eliminar índices únicos globales que serán reemplazados por compuestos en migración 3
-- ============================================================

DROP INDEX `productos_sku_key` ON `productos`;
DROP INDEX `productos_codigo_barras_key` ON `productos`;
DROP INDEX `categorias_nombre_key` ON `categorias`;
DROP INDEX `ventas_folio_key` ON `ventas`;
