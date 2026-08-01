CREATE TABLE IF NOT EXISTS users (
  id CHAR(36) PRIMARY KEY,
  vk_id VARCHAR(64) NOT NULL UNIQUE,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(32) NULL,
  email VARCHAR(254) NULL,
  avatar_url TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS user_roles (
  user_id CHAR(36) NOT NULL,
  role VARCHAR(24) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, role),
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_user_role CHECK (role IN ('passenger','driver','admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS oauth_states (
  state_hash CHAR(64) PRIMARY KEY,
  code_verifier VARCHAR(160) NOT NULL,
  return_to VARCHAR(512) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  used_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_oauth_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS session_codes (
  code_hash CHAR(64) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  used_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_session_codes_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_session_code_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_applications (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  applicant_name VARCHAR(160) NOT NULL,
  phone VARCHAR(32) NOT NULL,
  license_number VARCHAR(64) NOT NULL,
  vehicle_make VARCHAR(80) NOT NULL,
  vehicle_model VARCHAR(80) NOT NULL,
  vehicle_year SMALLINT UNSIGNED NOT NULL,
  vehicle_color VARCHAR(64) NOT NULL,
  plate VARCHAR(24) NOT NULL,
  has_child_seat BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  moderation_comment TEXT NULL,
  moderated_by CHAR(36) NULL,
  moderated_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_app_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_app_admin FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_driver_app_status CHECK (status IN ('draft','pending','approved','rejected')),
  INDEX idx_driver_app_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS drivers (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL UNIQUE,
  status VARCHAR(24) NOT NULL DEFAULT 'offline',
  rating DECIMAL(3,2) NOT NULL DEFAULT 5.00,
  commission_bps SMALLINT UNSIGNED NULL,
  has_child_seat BOOLEAN NOT NULL DEFAULT FALSE,
  approved_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_status CHECK (status IN ('offline','online','busy','suspended')),
  INDEX idx_driver_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS vehicles (
  id CHAR(36) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  make VARCHAR(80) NOT NULL,
  model VARCHAR(80) NOT NULL,
  year SMALLINT UNSIGNED NOT NULL,
  color VARCHAR(64) NOT NULL,
  plate VARCHAR(24) NOT NULL UNIQUE,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_vehicle_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  INDEX idx_vehicle_driver_active (driver_id, active)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tariff_settings (
  id TINYINT UNSIGNED PRIMARY KEY,
  base_fare_minor INT UNSIGNED NOT NULL,
  included_meters INT UNSIGNED NOT NULL,
  per_kilometer_minor INT UNSIGNED NOT NULL,
  per_minute_minor INT UNSIGNED NOT NULL,
  minimum_fare_minor INT UNSIGNED NOT NULL,
  child_surcharge_minor INT UNSIGNED NOT NULL,
  service_commission_bps SMALLINT UNSIGNED NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_tariff_admin FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO tariff_settings (
  id, base_fare_minor, included_meters, per_kilometer_minor, per_minute_minor,
  minimum_fare_minor, child_surcharge_minor, service_commission_bps
) VALUES (1, 15000, 2000, 3000, 500, 18000, 7000, 1200)
ON DUPLICATE KEY UPDATE id = id;

CREATE TABLE IF NOT EXISTS orders (
  id CHAR(36) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NULL,
  vehicle_id CHAR(36) NULL,
  tariff VARCHAR(24) NOT NULL,
  status VARCHAR(32) NOT NULL,
  pickup_label VARCHAR(255) NOT NULL,
  pickup_details VARCHAR(255) NULL,
  pickup_lat DECIMAL(10,7) NOT NULL,
  pickup_lon DECIMAL(10,7) NOT NULL,
  destination_label VARCHAR(255) NOT NULL,
  destination_details VARCHAR(255) NULL,
  destination_lat DECIMAL(10,7) NOT NULL,
  destination_lon DECIMAL(10,7) NOT NULL,
  distance_meters INT UNSIGNED NOT NULL,
  duration_seconds INT UNSIGNED NOT NULL,
  price_minor INT UNSIGNED NOT NULL,
  commission_minor INT UNSIGNED NOT NULL,
  commission_bps SMALLINT UNSIGNED NOT NULL,
  payment_method VARCHAR(24) NOT NULL DEFAULT 'cash',
  comment VARCHAR(500) NULL,
  idempotency_key VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  completed_at TIMESTAMP(3) NULL,
  cancelled_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_order_passenger FOREIGN KEY (passenger_id) REFERENCES users(id),
  CONSTRAINT fk_order_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL,
  CONSTRAINT fk_order_vehicle FOREIGN KEY (vehicle_id) REFERENCES vehicles(id) ON DELETE SET NULL,
  CONSTRAINT chk_order_tariff CHECK (tariff IN ('economy','child')),
  CONSTRAINT chk_order_status CHECK (status IN ('searching','accepted','driver_arriving','driver_waiting','in_progress','completed','cancelled')),
  UNIQUE KEY uniq_passenger_idempotency (passenger_id, idempotency_key),
  INDEX idx_order_status_created (status, created_at),
  INDEX idx_order_passenger_created (passenger_id, created_at),
  INDEX idx_order_driver_created (driver_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  actor_user_id CHAR(36) NULL,
  event_type VARCHAR(64) NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NULL,
  payload JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_order_event_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_event_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_order_event_timeline (order_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_locations (
  driver_id CHAR(36) PRIMARY KEY,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_meters DECIMAL(8,2) NULL,
  recorded_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_location_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_user_id CHAR(36) NULL,
  action VARCHAR(96) NOT NULL,
  entity_type VARCHAR(64) NOT NULL,
  entity_id VARCHAR(64) NULL,
  before_json JSON NULL,
  after_json JSON NULL,
  ip_address VARCHAR(64) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_audit_created (created_at),
  INDEX idx_audit_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_tokens (
  token VARCHAR(255) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  platform VARCHAR(16) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_push_token_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_push_token_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS geocoding_cache (
  cache_key VARCHAR(255) PRIMARY KEY,
  response_json JSON NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_geocoding_cache_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
