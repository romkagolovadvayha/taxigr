ALTER TABLE tariff_settings
  ADD COLUMN additional_stop_grahovo_surcharge_bps SMALLINT UNSIGNED NOT NULL DEFAULT 6000
    AFTER child_surcharge_minor;

ALTER TABLE orders
  ADD COLUMN destinations_json JSON NULL AFTER destination_lon;

UPDATE orders
SET destinations_json = JSON_ARRAY(JSON_OBJECT(
  'id', 'destination',
  'label', destination_label,
  'details', destination_details,
  'coordinates', JSON_OBJECT(
    'latitude', destination_lat,
    'longitude', destination_lon
  )
))
WHERE destinations_json IS NULL;
