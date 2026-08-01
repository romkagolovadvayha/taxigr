ALTER TABLE users
  ADD COLUMN phone_verified_at TIMESTAMP(3) NULL AFTER phone,
  ADD COLUMN order_blocked_until TIMESTAMP(3) NULL AFTER avatar_url,
  ADD COLUMN order_block_reason VARCHAR(255) NULL AFTER order_blocked_until,
  ADD INDEX idx_users_verified_phone (phone, phone_verified_at),
  ADD INDEX idx_users_order_block (order_blocked_until);

ALTER TABLE orders
  ADD COLUMN device_fingerprint CHAR(64) NULL AFTER passenger_id,
  ADD INDEX idx_orders_device_status (device_fingerprint, status, created_at);

CREATE TABLE IF NOT EXISTS phone_verification_challenges (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  phone VARCHAR(16) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at TIMESTAMP(3) NOT NULL,
  verified_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_phone_challenge_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_phone_challenge_lookup (user_id, phone, verified_at, created_at),
  INDEX idx_phone_challenge_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS order_identity_locks (
  lock_key CHAR(64) PRIMARY KEY,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
