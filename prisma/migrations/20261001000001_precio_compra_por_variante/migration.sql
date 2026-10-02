ALTER TABLE `variantes_producto` ADD COLUMN `precio_compra` DECIMAL(12, 2) NULL;

-- Los productos que ya usaban precios de venta por variante heredan su costo común.
UPDATE `variantes_producto` AS `v`
INNER JOIN `productos` AS `p` ON `p`.`id` = `v`.`producto_id`
SET `v`.`precio_compra` = `p`.`precio_compra`
WHERE `p`.`precio_por_variante` = 1 AND `v`.`precio_compra` IS NULL;
