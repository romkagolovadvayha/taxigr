ALTER TABLE oauth_states
  ADD COLUMN legal_acceptance JSON NULL AFTER return_to,
  ADD COLUMN consent_ip VARCHAR(64) NULL AFTER legal_acceptance,
  ADD COLUMN consent_user_agent VARCHAR(255) NULL AFTER consent_ip;

CREATE TABLE IF NOT EXISTS user_consents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  document_type VARCHAR(64) NOT NULL,
  document_version VARCHAR(32) NOT NULL,
  source VARCHAR(32) NOT NULL,
  ip_address VARCHAR(64) NULL,
  user_agent VARCHAR(255) NULL,
  accepted_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  revoked_at TIMESTAMP(3) NULL,
  CONSTRAINT fk_user_consents_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uq_user_consent_version (user_id, document_type, document_version),
  INDEX idx_user_consents_current (user_id, document_type, revoked_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
