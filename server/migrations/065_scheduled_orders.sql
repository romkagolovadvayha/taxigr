ALTER TABLE orders
  ADD COLUMN scheduled_at DATETIME(3) NULL,
  ADD INDEX idx_orders_scheduled (status, scheduled_at),
  ADD INDEX idx_orders_driver_schedule (driver_id, scheduled_at);
