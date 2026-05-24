-- CreateTable
CREATE TABLE `variantes_producto` (
    `id` CHAR(36) NOT NULL,
    `producto_id` CHAR(36) NOT NULL,
    `talla` VARCHAR(20) NOT NULL,
    `stock_actual` INTEGER NOT NULL DEFAULT 0,
    `codigo_barras` VARCHAR(48) NULL,

    UNIQUE INDEX `variantes_producto_codigo_barras_key`(`codigo_barras`),
    INDEX `variantes_producto_producto_id_idx`(`producto_id`),
    UNIQUE INDEX `variantes_producto_producto_id_talla_key`(`producto_id`, `talla`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `variantes_producto` ADD CONSTRAINT `variantes_producto_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
