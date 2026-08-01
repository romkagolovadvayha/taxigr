CREATE TABLE IF NOT EXISTS auth_attempt_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  request_id VARCHAR(64) NOT NULL,
  challenge_id CHAR(36) NULL,
  action VARCHAR(32) NOT NULL,
  outcome VARCHAR(64) NOT NULL,
  ip_address VARCHAR(64) NOT NULL,
  ip_fingerprint CHAR(64) NOT NULL,
  subnet VARCHAR(72) NOT NULL,
  subnet_fingerprint CHAR(64) NOT NULL,
  phone_fingerprint CHAR(64) NULL,
  phone_mask VARCHAR(32) NULL,
  installation_fingerprint CHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  details_json JSON NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_auth_attempt_action_created (action, created_at),
  INDEX idx_auth_attempt_outcome_created (outcome, created_at),
  INDEX idx_auth_attempt_ip_created (ip_fingerprint, created_at),
  INDEX idx_auth_attempt_subnet_created (subnet_fingerprint, created_at),
  INDEX idx_auth_attempt_phone_created (phone_fingerprint, created_at),
  INDEX idx_auth_attempt_installation_created (installation_fingerprint, created_at),
  INDEX idx_auth_attempt_challenge (challenge_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS auth_rate_limit_counters (
  action VARCHAR(32) NOT NULL,
  scope VARCHAR(24) NOT NULL,
  subject_hash CHAR(64) NOT NULL,
  window_seconds INT UNSIGNED NOT NULL,
  window_started_at TIMESTAMP(3) NOT NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (action, scope, subject_hash, window_seconds, window_started_at),
  INDEX idx_auth_rate_limit_expiry (window_started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
