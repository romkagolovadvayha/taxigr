ALTER TABLE tariff_settings
  ADD COLUMN passenger_cancellation_limit TINYINT UNSIGNED NOT NULL DEFAULT 3
    AFTER service_commission_bps,
  ADD COLUMN passenger_cancellation_window_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24
    AFTER passenger_cancellation_limit,
  ADD COLUMN passenger_cancellation_block_hours SMALLINT UNSIGNED NOT NULL DEFAULT 24
    AFTER passenger_cancellation_window_hours;
