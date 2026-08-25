SET @active_driver_column_exists = (
  SELECT COUNT(*)
  FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND column_name = 'active_driver_id'
);
SET @active_driver_column_sql = IF(
  @active_driver_column_exists = 0,
  'ALTER TABLE orders ADD COLUMN active_driver_id CHAR(36) NULL',
  'DO 0'
);
PREPARE active_driver_column_statement FROM @active_driver_column_sql;
EXECUTE active_driver_column_statement;
DEALLOCATE PREPARE active_driver_column_statement;

UPDATE orders
SET active_driver_id = CASE
  WHEN driver_id IS NOT NULL
    AND status IN ('accepted', 'driver_arriving', 'driver_waiting', 'in_progress')
  THEN driver_id
  ELSE NULL
END;

SET @active_driver_index_exists = (
  SELECT COUNT(*)
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'orders'
    AND index_name = 'uq_orders_one_active_per_driver'
);
SET @active_driver_index_sql = IF(
  @active_driver_index_exists = 0,
  'ALTER TABLE orders ADD UNIQUE INDEX uq_orders_one_active_per_driver (active_driver_id)',
  'DO 0'
);
PREPARE active_driver_index_statement FROM @active_driver_index_sql;
EXECUTE active_driver_index_statement;
DEALLOCATE PREPARE active_driver_index_statement;
