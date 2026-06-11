-- CreateTable
CREATE TABLE `usuarios` (
    `id` CHAR(36) NOT NULL,
    `correo` VARCHAR(255) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `hash_contrasena` VARCHAR(255) NOT NULL,
    `correo_verificado` BOOLEAN NOT NULL DEFAULT false,
    `estado` ENUM('pendiente', 'activo', 'suspendido') NOT NULL DEFAULT 'pendiente',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `usuarios_correo_key`(`correo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sesiones` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `hash_sesion` VARCHAR(255) NOT NULL,
    `organizacion_activa_id` CHAR(36) NULL,
    `expira_en` DATETIME(3) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `sesiones_hash_sesion_key`(`hash_sesion`),
    INDEX `sesiones_usuario_id_idx`(`usuario_id`),
    INDEX `sesiones_expira_en_idx`(`expira_en`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tokens_verificacion` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `token_hash` VARCHAR(255) NOT NULL,
    `expira_en` DATETIME(3) NOT NULL,
    `consumido_en` DATETIME(3) NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `tokens_verificacion_token_hash_key`(`token_hash`),
    INDEX `tokens_verificacion_usuario_id_idx`(`usuario_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizaciones` (
    `id` CHAR(36) NOT NULL,
    `nombre` VARCHAR(160) NOT NULL,
    `slug` VARCHAR(80) NOT NULL,
    `creado_por` CHAR(36) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `actualizado_en` DATETIME(3) NOT NULL,

    UNIQUE INDEX `organizaciones_slug_key`(`slug`),
    INDEX `organizaciones_creado_por_idx`(`creado_por`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `membresias` (
    `id` CHAR(36) NOT NULL,
    `usuario_id` CHAR(36) NOT NULL,
    `organizacion_id` CHAR(36) NOT NULL,
    `rol_id` CHAR(36) NOT NULL,
    `estado` ENUM('activa', 'suspendida') NOT NULL DEFAULT 'activa',
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `membresias_organizacion_id_idx`(`organizacion_id`),
    INDEX `membresias_rol_id_idx`(`rol_id`),
    UNIQUE INDEX `membresias_usuario_id_organizacion_id_key`(`usuario_id`, `organizacion_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `roles` (
    `id` CHAR(36) NOT NULL,
    `organizacion_id` CHAR(36) NOT NULL,
    `nombre` VARCHAR(80) NOT NULL,
    `es_sistema` BOOLEAN NOT NULL DEFAULT false,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `roles_organizacion_id_nombre_key`(`organizacion_id`, `nombre`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `permisos_rol` (
    `id` CHAR(36) NOT NULL,
    `rol_id` CHAR(36) NOT NULL,
    `seccion` VARCHAR(32) NOT NULL,
    `accion` VARCHAR(32) NOT NULL,

    INDEX `permisos_rol_rol_id_idx`(`rol_id`),
    UNIQUE INDEX `permisos_rol_rol_id_seccion_accion_key`(`rol_id`, `seccion`, `accion`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `invitaciones` (
    `id` CHAR(36) NOT NULL,
    `organizacion_id` CHAR(36) NOT NULL,
    `correo` VARCHAR(255) NOT NULL,
    `rol_id` CHAR(36) NOT NULL,
    `estado` ENUM('pendiente', 'aceptada', 'expirada', 'revocada') NOT NULL DEFAULT 'pendiente',
    `token_hash` VARCHAR(255) NOT NULL,
    `expira_en` DATETIME(3) NOT NULL,
    `invitado_por` CHAR(36) NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `invitaciones_token_hash_key`(`token_hash`),
    INDEX `invitaciones_organizacion_id_estado_idx`(`organizacion_id`, `estado`),
    INDEX `invitaciones_correo_idx`(`correo`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `horarios_miembro` (
    `id` CHAR(36) NOT NULL,
    `membresia_id` CHAR(36) NOT NULL,
    `dia` TINYINT NOT NULL,
    `hora_inicio` VARCHAR(5) NULL,
    `hora_fin` VARCHAR(5) NULL,
    `tipo` ENUM('normal', 'vacaciones', 'incapacidad', 'descanso') NOT NULL,
    `creado_en` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `horarios_miembro_membresia_id_idx`(`membresia_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `sesiones` ADD CONSTRAINT `sesiones_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `tokens_verificacion` ADD CONSTRAINT `tokens_verificacion_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `organizaciones` ADD CONSTRAINT `organizaciones_creado_por_fkey` FOREIGN KEY (`creado_por`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membresias` ADD CONSTRAINT `membresias_usuario_id_fkey` FOREIGN KEY (`usuario_id`) REFERENCES `usuarios`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membresias` ADD CONSTRAINT `membresias_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `membresias` ADD CONSTRAINT `membresias_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `roles` ADD CONSTRAINT `roles_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `permisos_rol` ADD CONSTRAINT `permisos_rol_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitaciones` ADD CONSTRAINT `invitaciones_organizacion_id_fkey` FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitaciones` ADD CONSTRAINT `invitaciones_rol_id_fkey` FOREIGN KEY (`rol_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `invitaciones` ADD CONSTRAINT `invitaciones_invitado_por_fkey` FOREIGN KEY (`invitado_por`) REFERENCES `usuarios`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `horarios_miembro` ADD CONSTRAINT `horarios_miembro_membresia_id_fkey` FOREIGN KEY (`membresia_id`) REFERENCES `membresias`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
