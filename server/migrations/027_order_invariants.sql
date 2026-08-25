ALTER TABLE orders
  ADD COLUMN active_driver_id CHAR(36)
    GENERATED ALWAYS AS (
      CASE
        WHEN driver_id IS NOT NULL
          AND status IN ('accepted', 'driver_arriving', 'driver_waiting', 'in_progress')
        THEN driver_id
        ELSE NULL
      END
    ) STORED,
  ADD UNIQUE INDEX uq_orders_one_active_per_driver (active_driver_id);
