ALTER TABLE orders
  ADD COLUMN cancellation_code VARCHAR(32) NULL AFTER cancelled_at,
  ADD COLUMN cancellation_reason VARCHAR(500) NULL AFTER cancellation_code;
