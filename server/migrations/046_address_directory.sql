CREATE TABLE IF NOT EXISTS address_directory (
  id VARCHAR(255) PRIMARY KEY,
  label VARCHAR(512) NOT NULL,
  house_number VARCHAR(24) NULL,
  coordinate_precision ENUM('approximate','precise') NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  source ENUM('gar','osm') NOT NULL,
  source_url VARCHAR(512) NOT NULL,
  snapshot_date VARCHAR(32) NOT NULL,
  address_json JSON NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_address_directory_active (active, coordinate_precision)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
