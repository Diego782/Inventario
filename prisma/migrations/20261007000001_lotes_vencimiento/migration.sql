-- Los productos existentes siguen sin control de vencimiento. Su stock actual
-- permanece intacto y se considera sin fecha asignada hasta que el usuario lo
-- distribuya entre lotes.
ALTER TABLE `productos` ADD COLUMN `controla_vencimiento` BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE `lotes_producto` (
  `id` CHAR(36) NOT NULL,
  `organizacion_id` CHAR(36) NOT NULL,
  `producto_id` CHAR(36) NOT NULL,
  `variante_id` CHAR(36) NULL,
  `fecha_vencimiento` DATE NOT NULL,
  `cantidad_inicial` INTEGER NOT NULL,
  `stock_actual` INTEGER NOT NULL,
  `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `lotes_org_venc_stock_idx` (`organizacion_id`, `fecha_vencimiento`, `stock_actual`),
  INDEX `lotes_producto_variante_venc_idx` (`producto_id`, `variante_id`, `fecha_vencimiento`),
  CONSTRAINT `lotes_producto_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT `lotes_producto_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `lotes_producto_variante_id_fkey` FOREIGN KEY (`variante_id`) REFERENCES `variantes_producto`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `venta_item_lotes` (
  `venta_item_id` CHAR(36) NOT NULL,
  `lote_id` CHAR(36) NOT NULL,
  `cantidad` INTEGER NOT NULL,
  PRIMARY KEY (`venta_item_id`, `lote_id`),
  INDEX `venta_item_lotes_lote_id_idx` (`lote_id`),
  CONSTRAINT `venta_item_lotes_venta_item_id_fkey` FOREIGN KEY (`venta_item_id`) REFERENCES `venta_items`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `venta_item_lotes_lote_id_fkey` FOREIGN KEY (`lote_id`) REFERENCES `lotes_producto`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
