-- Aísla las notificaciones por organización.
-- Migración aditiva y no destructiva: agrega organizacion_id, hace backfill
-- desde el producto relacionado y finalmente impone NOT NULL + FK.

-- ============================================================
-- Paso 1: Agregar columna organizacion_id NULL
-- ============================================================
ALTER TABLE `notificaciones` ADD COLUMN `organizacion_id` CHAR(36) NULL;

-- ============================================================
-- Paso 2: Backfill desde el producto relacionado (cuando exista)
-- ============================================================
UPDATE `notificaciones` n
JOIN `productos` p ON p.`id` = n.`producto_id`
SET n.`organizacion_id` = p.`organizacion_id`
WHERE n.`organizacion_id` IS NULL AND n.`producto_id` IS NOT NULL;

-- ============================================================
-- Paso 3: Para notificaciones sin producto (o producto borrado), asignar a la
-- organización principal del backfill multitenant si existe; de lo contrario a
-- la primera organización disponible.
-- ============================================================
UPDATE `notificaciones`
SET `organizacion_id` = COALESCE(
  (SELECT `id` FROM `organizaciones` WHERE `slug` = 'principal' LIMIT 1),
  (SELECT `id` FROM `organizaciones` ORDER BY `creado_en` ASC LIMIT 1)
)
WHERE `organizacion_id` IS NULL;

-- ============================================================
-- Paso 4: Eliminar las notificaciones que aún no tengan organización
-- (solo ocurre si no existe ninguna organización en la base de datos).
-- ============================================================
DELETE FROM `notificaciones` WHERE `organizacion_id` IS NULL;

-- ============================================================
-- Paso 5: Imponer NOT NULL, índice y FK
-- ============================================================
ALTER TABLE `notificaciones` MODIFY COLUMN `organizacion_id` CHAR(36) NOT NULL;

CREATE INDEX `notificaciones_organizacion_id_idx` ON `notificaciones`(`organizacion_id`);

ALTER TABLE `notificaciones`
  ADD CONSTRAINT `notificaciones_organizacion_id_fkey`
  FOREIGN KEY (`organizacion_id`) REFERENCES `organizaciones`(`id`)
  ON DELETE RESTRICT ON UPDATE CASCADE;
