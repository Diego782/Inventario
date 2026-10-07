-- Cada organización lleva su propio consecutivo diario. El folio solo debe
-- ser único dentro de esa organización; las ventas existentes se conservan.
ALTER TABLE `ventas` DROP INDEX `ventas_folio_key`;
ALTER TABLE `ventas` ADD UNIQUE INDEX `ventas_organizacion_id_folio_key` (`organizacion_id`, `folio`);
