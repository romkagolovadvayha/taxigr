ALTER TABLE tariff_settings
  CHANGE COLUMN fare_07_22_minor grahovo_fare_07_22_minor INT UNSIGNED NOT NULL DEFAULT 15000,
  CHANGE COLUMN fare_22_02_minor grahovo_fare_22_02_minor INT UNSIGNED NOT NULL DEFAULT 15000,
  CHANGE COLUMN fare_02_07_minor grahovo_fare_02_07_minor INT UNSIGNED NOT NULL DEFAULT 15000,
  ADD COLUMN district_per_kilometer_07_22_minor INT UNSIGNED NOT NULL DEFAULT 6000,
  ADD COLUMN district_per_kilometer_22_02_minor INT UNSIGNED NOT NULL DEFAULT 6000,
  ADD COLUMN district_per_kilometer_02_07_minor INT UNSIGNED NOT NULL DEFAULT 6000;

UPDATE tariff_settings
SET district_per_kilometer_07_22_minor = district_per_kilometer_minor,
    district_per_kilometer_22_02_minor = district_per_kilometer_minor,
    district_per_kilometer_02_07_minor = district_per_kilometer_minor;
