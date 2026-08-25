SET @active_driver_column_generated = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'active_driver_id'
    AND extra LIKE '%GENERATED%'
);
SET @normalize_active_driver_column_sql = IF(
  @active_driver_column_generated > 0,
  'ALTER TABLE orders MODIFY COLUMN active_driver_id CHAR(36) NULL',
  'DO 0'
);
PREPARE normalize_active_driver_column_statement FROM @normalize_active_driver_column_sql;
EXECUTE normalize_active_driver_column_statement;
DEALLOCATE PREPARE normalize_active_driver_column_statement;

UPDATE orders
SET active_driver_id = CASE
  WHEN driver_id IS NOT NULL
    AND status IN ('accepted', 'driver_arriving', 'driver_waiting', 'in_progress')
  THEN driver_id
  ELSE NULL
END;
