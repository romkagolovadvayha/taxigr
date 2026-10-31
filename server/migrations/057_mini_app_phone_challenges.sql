CREATE TABLE IF NOT EXISTS mini_app_phone_challenges (
  external_user_id VARCHAR(64) NOT NULL PRIMARY KEY,
  request_id CHAR(36) NOT NULL,
  verified_phone VARCHAR(20) NULL,
  verified_at DATETIME(3) NULL,
  consumed_at DATETIME(3) NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_mini_app_phone_request (request_id),
  KEY idx_mini_app_phone_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
