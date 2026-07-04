-- Migración aditiva y retrocompatible: introduce la tabla de Clientes,
-- la tabla de MovimientosDeuda y columnas nullable en Ventas.
-- Sin DROP ni MODIFY de columnas existentes (Req 11.4).
-- CREATE TABLE IF NOT EXISTS para idempotencia al reaplicar (Req 11.8).

-- CreateTable: clientes
-- Índice único (organizacion_id, cedula) garantiza unicidad de cédula por tenant (Req 4.3, 4.4).
-- organizacion_id indexado para aislamiento multi-tenant (Req 11.6).
CREATE TABLE IF NOT EXISTS `clientes` (
    `id` CHAR(36) NOT NULL,
    `organizacion_id` CHAR(36) NOT NULL,
    `cedula` VARCHAR(20) NOT NULL,
    `nombre` VARCHAR(100) NOT NULL,
    `telefono` VARCHAR(15) NOT NULL,
    `correo` VARCHAR(254) NULL,
    `direccion` VARCHAR(240) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    INDEX `clientes_organizacion_id_idx`(`organizacion_id`),
    UNIQUE INDEX `clientes_organizacion_id_cedula_key`(`organizacion_id`, `cedula`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable: movimientos_deuda
-- Almacena cargos (compras fiadas) y abonos (pagos) de Clientes.
-- organizacion_id indexado para aislamiento multi-tenant (Req 11.6).
-- venta_id nullable: solo los cargos originados por una venta fiada lo llevan.
CREATE TABLE IF NOT EXISTS `movimientos_deuda` (
    `id` CHAR(36) NOT NULL,
    `organizacion_id` CHAR(36) NOT NULL,
    `cliente_id` CHAR(36) NOT NULL,
    `tipo` ENUM('cargo', 'abono') NOT NULL,
    `monto` DECIMAL(12, 2) NOT NULL,
    `venta_id` CHAR(36) NULL,
    `plazo_deuda` DATETIME(3) NULL,
    `fecha` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `movimientos_deuda_organizacion_id_idx`(`organizacion_id`),
    INDEX `movimientos_deuda_cliente_id_fecha_idx`(`cliente_id`, `fecha`),
    INDEX `movimientos_deuda_venta_id_idx`(`venta_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddColumn: cliente_id nullable en ventas (Req 11.2, 11.5)
-- NULL preserva las ventas históricas sin cliente, incluidas las fiadas (Req 11.3).
ALTER TABLE `ventas` ADD COLUMN IF NOT EXISTS `cliente_id` CHAR(36) NULL;

-- AddColumn: plazo_deuda nullable en ventas (Req 6.4, 11.2)
ALTER TABLE `ventas` ADD COLUMN IF NOT EXISTS `plazo_deuda` DATETIME(3) NULL;

-- CreateIndex: ventas.cliente_id para FK lookup eficiente
CREATE INDEX IF NOT EXISTS `ventas_cliente_id_idx` ON `ventas`(`cliente_id`);

-- AddForeignKey: clientes → organizaciones
ALTER TABLE `clientes`
    ADD CONSTRAINT `clientes_organizacion_id_fkey`
    FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: movimientos_deuda → organizaciones
ALTER TABLE `movimientos_deuda`
    ADD CONSTRAINT `movimientos_deuda_organizacion_id_fkey`
    FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: movimientos_deuda → clientes
ALTER TABLE `movimientos_deuda`
    ADD CONSTRAINT `movimientos_deuda_cliente_id_fkey`
    FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: ventas.cliente_id → clientes (nullable, Req 11.5)
-- ON DELETE RESTRICT impide borrar un cliente con ventas asociadas.
ALTER TABLE `ventas`
    ADD CONSTRAINT `ventas_cliente_id_fkey`
    FOREIGN KEY (`cliente_id`) REFERENCES `clientes`(`id`)
    ON DELETE RESTRICT ON UPDATE CASCADE;
