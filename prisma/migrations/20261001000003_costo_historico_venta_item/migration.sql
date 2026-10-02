ALTER TABLE `venta_items` ADD COLUMN `precio_compra_unitario` DECIMAL(12, 2) NULL;

-- Congela el costo que los reportes antiguos atribuían a cada venta existente.
UPDATE `venta_items` AS `i`
INNER JOIN `productos` AS `p` ON `p`.`id` = `i`.`producto_id`
SET `i`.`precio_compra_unitario` = `p`.`precio_compra`
WHERE `i`.`precio_compra_unitario` IS NULL;
