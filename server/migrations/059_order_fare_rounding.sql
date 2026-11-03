-- Keep the rounding rule attached to the quoted order, including older clients.
-- NULL preserves the calculation of orders created before this pricing change.
SET @column_exists = (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'orders' AND COLUMN_NAME = 'fare_rounding_minor');
SET @ddl = IF(@column_exists = 0,
  'ALTER TABLE orders ADD COLUMN fare_rounding_minor INT UNSIGNED NULL', 'DO 0');
PREPARE migration_statement FROM @ddl;
EXECUTE migration_statement;
DEALLOCATE PREPARE migration_statement;
