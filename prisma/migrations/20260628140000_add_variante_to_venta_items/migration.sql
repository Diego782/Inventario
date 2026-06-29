-- Permite registrar en cada ítem de venta la variante (talla) vendida.
-- Cambio aditivo y no destructivo: columna NULL + FK con ON DELETE SET NULL.

ALTER TABLE `venta_items` ADD COLUMN `variante_id` CHAR(36) NULL;

CREATE INDEX `venta_items_variante_id_idx` ON `venta_items`(`variante_id`);

ALTER TABLE `venta_items`
  ADD CONSTRAINT `venta_items_variante_id_fkey`
  FOREIGN KEY (`variante_id`) REFERENCES `variantes_producto`(`id`)
  ON DELETE SET NULL ON UPDATE CASCADE;
