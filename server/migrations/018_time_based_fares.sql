ALTER TABLE tariff_settings
  ADD COLUMN fare_07_22_minor INT UNSIGNED NOT NULL DEFAULT 15000,
  ADD COLUMN fare_22_02_minor INT UNSIGNED NOT NULL DEFAULT 15000,
  ADD COLUMN fare_02_07_minor INT UNSIGNED NOT NULL DEFAULT 15000;

UPDATE tariff_settings
SET fare_07_22_minor = grahovo_fixed_fare_minor,
    fare_22_02_minor = grahovo_fixed_fare_minor,
    fare_02_07_minor = grahovo_fixed_fare_minor;
