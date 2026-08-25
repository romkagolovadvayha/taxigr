ALTER TABLE orders
  ADD COLUMN search_price_increase_minor INT UNSIGNED NOT NULL DEFAULT 0
  AFTER base_price_minor;
