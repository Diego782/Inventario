-- La configuración existente conserva el precio único. No cambia stock ni ventas.
ALTER TABLE `productos` ADD COLUMN `precio_por_variante` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `variantes_producto` ADD COLUMN `precio_venta` DECIMAL(12, 2) NULL;
