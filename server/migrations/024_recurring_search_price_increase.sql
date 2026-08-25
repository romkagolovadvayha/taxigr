ALTER TABLE tariff_settings
  ADD COLUMN search_price_increase_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 4
    AFTER waiting_per_minute_minor,
  ADD COLUMN search_price_increase_step_minor INT UNSIGNED NOT NULL DEFAULT 3000
    AFTER search_price_increase_interval_minutes;

ALTER TABLE orders
  ADD COLUMN search_price_increase_interval_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 4
    AFTER search_price_increase_minor,
  ADD COLUMN search_price_increase_step_minor INT UNSIGNED NOT NULL DEFAULT 3000
    AFTER search_price_increase_interval_minutes,
  ADD COLUMN search_price_increase_last_slot INT UNSIGNED NOT NULL DEFAULT 0
    AFTER search_price_increase_step_minor;

UPDATE orders
SET search_price_increase_last_slot = 1
WHERE search_price_increase_minor > 0;
