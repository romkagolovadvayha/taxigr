-- Intercity rates approved by the owner: 50 / 70 / 100 RUB per km (Samara time).
-- Preserve existing columns and values when resuming a partially applied migration.
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tariff_settings' AND COLUMN_NAME = 'intercity_per_kilometer_07_22_minor');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE tariff_settings ADD COLUMN intercity_per_kilometer_07_22_minor INT UNSIGNED NOT NULL DEFAULT 5000', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tariff_settings' AND COLUMN_NAME = 'intercity_per_kilometer_22_02_minor');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE tariff_settings ADD COLUMN intercity_per_kilometer_22_02_minor INT UNSIGNED NOT NULL DEFAULT 7000', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'tariff_settings' AND COLUMN_NAME = 'intercity_per_kilometer_02_07_minor');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE tariff_settings ADD COLUMN intercity_per_kilometer_02_07_minor INT UNSIGNED NOT NULL DEFAULT 10000', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

-- Keep the old field as the daytime rate for older admin clients.
UPDATE tariff_settings SET intercity_per_kilometer_minor = intercity_per_kilometer_07_22_minor;
