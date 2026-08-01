CREATE TABLE IF NOT EXISTS geocoding_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  response_json JSON NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_geocoding_cache_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
