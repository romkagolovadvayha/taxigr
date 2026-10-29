ALTER TABLE orders
  ADD COLUMN promotion_code VARCHAR(40) NULL,
  ADD COLUMN original_price_minor INT NULL,
  ADD COLUMN promotion_phone_fingerprint CHAR(64) NULL,
  ADD INDEX idx_orders_promotion_phone (promotion_phone_fingerprint, status);
