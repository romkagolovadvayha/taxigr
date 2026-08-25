ALTER TABLE user_messenger_accounts
  MODIFY COLUMN provider ENUM('max', 'telegram', 'vk') NOT NULL;

CREATE TABLE IF NOT EXISTS vk_auth_challenges (
  id CHAR(36) PRIMARY KEY,
  state_token VARCHAR(64) NOT NULL,
  code_verifier VARCHAR(128) NOT NULL,
  exchange_secret_hash CHAR(64) NOT NULL,
  expected_phone VARCHAR(16) NOT NULL,
  verified_phone VARCHAR(16) NULL,
  vk_user_id VARCHAR(32) NULL,
  vk_first_name VARCHAR(80) NULL,
  vk_last_name VARCHAR(80) NULL,
  legal_acceptance JSON NOT NULL,
  consent_ip VARCHAR(64) NULL,
  consent_user_agent VARCHAR(255) NULL,
  failure_code VARCHAR(64) NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  verified_at TIMESTAMP(3) NULL,
  completed_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uniq_vk_auth_state (state_token),
  INDEX idx_vk_auth_phone_created (expected_phone, created_at),
  INDEX idx_vk_auth_user_pending (vk_user_id, verified_at, expires_at),
  INDEX idx_vk_auth_expiry (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
