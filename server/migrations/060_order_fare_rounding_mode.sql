-- A missing mode preserves upward rounding on existing orders and signed quotes.
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'fare_rounding_mode');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE orders ADD COLUMN fare_rounding_mode VARCHAR(12) NULL', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
