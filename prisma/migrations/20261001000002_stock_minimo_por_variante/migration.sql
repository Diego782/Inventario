ALTER TABLE `variantes_producto` ADD COLUMN `stock_minimo` INTEGER NOT NULL DEFAULT 0;

-- Conserva el mínimo total de cada producto existente, repartiéndolo entre
-- sus variantes de forma determinista para no cambiar sus alertas generales.
UPDATE `variantes_producto` AS `v`
INNER JOIN (
  SELECT `id`, `producto_id`,
    ROW_NUMBER() OVER (PARTITION BY `producto_id` ORDER BY `id`) AS `orden`,
    COUNT(*) OVER (PARTITION BY `producto_id`) AS `cantidad`
  FROM `variantes_producto`
) AS `distribucion` ON `distribucion`.`id` = `v`.`id`
INNER JOIN `productos` AS `p` ON `p`.`id` = `v`.`producto_id`
SET `v`.`stock_minimo` = FLOOR(`p`.`stock_minimo` / `distribucion`.`cantidad`)
  + IF(`distribucion`.`orden` <= MOD(`p`.`stock_minimo`, `distribucion`.`cantidad`), 1, 0);
