-- CreateTable
CREATE TABLE `categorias` (
    `id` CHAR(36) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `categorias_nombre_key`(`nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `productos` (
    `id` CHAR(36) NOT NULL,
    `sku` VARCHAR(32) NOT NULL,
    `codigo_barras` VARCHAR(48) NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `categoria_id` CHAR(36) NULL,
    `precio_compra` DECIMAL(12, 2) NOT NULL DEFAULT 0,
    `precio_venta` DECIMAL(12, 2) NOT NULL,
    `stock_actual` INTEGER NOT NULL DEFAULT 0,
    `stock_minimo` INTEGER NOT NULL DEFAULT 0,
    `unidad` VARCHAR(16) NOT NULL DEFAULT 'unidad',
    `activo` BOOLEAN NOT NULL DEFAULT true,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `productos_sku_key`(`sku`),
    UNIQUE INDEX `productos_codigo_barras_key`(`codigo_barras`),
    INDEX `productos_categoria_id_idx`(`categoria_id`),
    INDEX `productos_activo_stock_actual_idx`(`activo`, `stock_actual`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `movimientos_stock` (
    `id` CHAR(36) NOT NULL,
    `producto_id` CHAR(36) NOT NULL,
    `tipo` ENUM('entrada', 'salida', 'merma', 'devolucion', 'ajuste', 'venta') NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `stock_resultante` INTEGER NOT NULL,
    `motivo` VARCHAR(240) NULL,
    `usuario_id` CHAR(36) NULL,
    `referencia_id` CHAR(36) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimientos_stock_producto_id_creado_en_idx`(`producto_id`, `creado_en`),
    INDEX `movimientos_stock_referencia_id_idx`(`referencia_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ventas` (
    `id` CHAR(36) NOT NULL,
    `folio` VARCHAR(24) NOT NULL,
    `subtotal` DECIMAL(12, 2) NOT NULL,
    `impuesto` DECIMAL(12, 2) NOT NULL,
    `total` DECIMAL(12, 2) NOT NULL,
    `metodo_pago` ENUM('efectivo', 'tarjeta', 'transferencia', 'fiado') NOT NULL,
    `fiador_id` CHAR(36) NULL,
    `usuario_id` CHAR(36) NULL,
    `estado` ENUM('completada', 'pendiente', 'cancelada') NOT NULL DEFAULT 'completada',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `ventas_folio_key`(`folio`),
    INDEX `ventas_creado_en_idx`(`creado_en`),
    INDEX `ventas_metodo_pago_creado_en_idx`(`metodo_pago`, `creado_en`),
    INDEX `ventas_fiador_id_idx`(`fiador_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `venta_items` (
    `id` CHAR(36) NOT NULL,
    `venta_id` CHAR(36) NOT NULL,
    `producto_id` CHAR(36) NOT NULL,
    `cantidad` INTEGER NOT NULL,
    `precio_unitario` DECIMAL(12, 2) NOT NULL,
    `subtotal_linea` DECIMAL(12, 2) NOT NULL,

    INDEX `venta_items_venta_id_idx`(`venta_id`),
    INDEX `venta_items_producto_id_idx`(`producto_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `configuracion` (
    `clave` VARCHAR(64) NOT NULL,
    `valor` VARCHAR(255) NOT NULL,
    `actualizado_en` DATETIME(3) NOT NULL,

    PRIMARY KEY (`clave`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `productos` ADD CONSTRAINT `productos_categoria_id_fkey` FOREIGN KEY (`categoria_id`) REFERENCES `categorias`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `movimientos_stock` ADD CONSTRAINT `movimientos_stock_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta_items` ADD CONSTRAINT `venta_items_venta_id_fkey` FOREIGN KEY (`venta_id`) REFERENCES `ventas`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `venta_items` ADD CONSTRAINT `venta_items_producto_id_fkey` FOREIGN KEY (`producto_id`) REFERENCES `productos`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
