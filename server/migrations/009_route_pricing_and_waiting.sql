ALTER TABLE tariff_settings
  ADD COLUMN grahovo_fixed_fare_minor INT UNSIGNED NOT NULL DEFAULT 15000,
  ADD COLUMN district_per_kilometer_minor INT UNSIGNED NOT NULL DEFAULT 6000,
  ADD COLUMN intercity_per_kilometer_minor INT UNSIGNED NOT NULL DEFAULT 3000,
  ADD COLUMN waiting_free_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 3,
  ADD COLUMN waiting_per_minute_minor INT UNSIGNED NOT NULL DEFAULT 400;

ALTER TABLE orders
  ADD COLUMN pricing_scope VARCHAR(24) NOT NULL DEFAULT 'intercity' AFTER status,
  ADD COLUMN base_price_minor INT UNSIGNED NOT NULL DEFAULT 0 AFTER route_geometry,
  ADD COLUMN waiting_seconds INT UNSIGNED NOT NULL DEFAULT 0 AFTER commission_bps,
  ADD COLUMN waiting_price_minor INT UNSIGNED NOT NULL DEFAULT 0 AFTER waiting_seconds,
  ADD COLUMN waiting_started_at TIMESTAMP(3) NULL AFTER waiting_price_minor,
  ADD COLUMN waiting_free_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 3 AFTER waiting_started_at,
  ADD COLUMN waiting_per_minute_minor INT UNSIGNED NOT NULL DEFAULT 400 AFTER waiting_free_minutes;

UPDATE orders
SET base_price_minor = price_minor
WHERE base_price_minor = 0;

ALTER TABLE orders
  ADD CONSTRAINT chk_order_pricing_scope
    CHECK (pricing_scope IN ('grahovo', 'district', 'intercity'));
