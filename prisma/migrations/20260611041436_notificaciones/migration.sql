-- CreateTable
CREATE TABLE `notificaciones` (
    `id` CHAR(36) NOT NULL,
    `tipo` VARCHAR(40) NOT NULL,
    `titulo` VARCHAR(160) NOT NULL,
    `mensaje` VARCHAR(400) NOT NULL,
    `producto_id` CHAR(36) NULL,
    `leida` BOOLEAN NOT NULL DEFAULT false,
    `clave_deduplicacion` VARCHAR(120) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `notificaciones_clave_deduplicacion_key`(`clave_deduplicacion`),
    INDEX `notificaciones_leida_idx`(`leida`),
    INDEX `notificaciones_creado_en_idx`(`creado_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `notificaciones` ADD CONSTRAINT `notificaciones_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
