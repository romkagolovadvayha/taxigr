ALTER TABLE users
  MODIFY COLUMN vk_id VARCHAR(64) NULL,
  ADD COLUMN gender VARCHAR(16) NULL AFTER name,
  ADD COLUMN profile_completed_at TIMESTAMP(3) NULL AFTER gender,
  ADD COLUMN avatar_mime VARCHAR(32) NULL AFTER avatar_url,
  ADD COLUMN avatar_data MEDIUMBLOB NULL AFTER avatar_mime,
  ADD COLUMN deleted_at TIMESTAMP(3) NULL AFTER order_block_reason,
  ADD CONSTRAINT chk_user_gender CHECK (gender IS NULL OR gender IN ('male','female')),
  ADD UNIQUE KEY uniq_users_phone (phone),
  ADD INDEX idx_users_active (deleted_at);

CREATE TABLE IF NOT EXISTS phone_auth_challenges (
  id CHAR(36) PRIMARY KEY,
  phone VARCHAR(16) NOT NULL,
  code_hash CHAR(64) NOT NULL,
  legal_acceptance JSON NOT NULL,
  consent_ip VARCHAR(64) NULL,
  consent_user_agent VARCHAR(255) NULL,
  attempts TINYINT UNSIGNED NOT NULL DEFAULT 0,
  expires_at TIMESTAMP(3) NOT NULL,
  verified_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_phone_auth_lookup (phone, verified_at, created_at),
  INDEX idx_phone_auth_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
