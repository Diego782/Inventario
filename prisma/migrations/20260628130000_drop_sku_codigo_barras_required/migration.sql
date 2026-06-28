-- ============================================================
-- Eliminar SKU de productos y convertir codigo_barras en el
-- identificador único obligatorio (NOT NULL).
-- ============================================================

-- 1) Rellenar codigo_barras NULL con un valor único derivado del id.
--    Prefijo "200" (rango interno EAN) + 10 caracteres hex del id.
--    Garantiza unicidad por organización antes de aplicar NOT NULL.
UPDATE `productos`
SET `codigo_barras` = CONCAT('200', UPPER(REPLACE(SUBSTRING(`id`, 1, 13), '-', '')))
WHERE `codigo_barras` IS NULL;

-- 2) Eliminar el índice único compuesto que incluía sku.
DROP INDEX `productos_organizacion_id_sku_key` ON `productos`;

-- 3) Eliminar la columna sku.
ALTER TABLE `productos` DROP COLUMN `sku`;

-- 4) Convertir codigo_barras en NOT NULL.
ALTER TABLE `productos` MODIFY COLUMN `codigo_barras` VARCHAR(48) NOT NULL;
