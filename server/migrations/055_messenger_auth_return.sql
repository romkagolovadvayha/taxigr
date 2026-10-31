-- Each DDL is retryable if a deploy stops before recording the migration.
-- Existing and old-client login attempts retain their original return flow.
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'max_auth_challenges' AND COLUMN_NAME = 'return_platform');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE max_auth_challenges ADD COLUMN return_platform VARCHAR(16) NOT NULL DEFAULT ''legacy''', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'telegram_auth_challenges' AND COLUMN_NAME = 'return_platform');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE telegram_auth_challenges ADD COLUMN return_platform VARCHAR(16) NOT NULL DEFAULT ''legacy''', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;

SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'vk_auth_challenges' AND COLUMN_NAME = 'return_platform');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE vk_auth_challenges ADD COLUMN return_platform VARCHAR(16) NOT NULL DEFAULT ''legacy''', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
