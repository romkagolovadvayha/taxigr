ALTER TABLE max_auth_challenges
  ADD COLUMN max_username VARCHAR(64) NULL AFTER max_chat_id,
  ADD COLUMN max_display_name VARCHAR(160) NULL AFTER max_username;

ALTER TABLE telegram_auth_challenges
  ADD COLUMN telegram_username VARCHAR(64) NULL AFTER telegram_chat_id,
  ADD COLUMN telegram_first_name VARCHAR(80) NULL AFTER telegram_username,
  ADD COLUMN telegram_last_name VARCHAR(80) NULL AFTER telegram_first_name;

CREATE TABLE user_messenger_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  provider ENUM('max', 'telegram') NOT NULL,
  external_user_id VARCHAR(64) NOT NULL,
  chat_id VARCHAR(64) NOT NULL,
  username VARCHAR(64) NULL,
  display_name VARCHAR(160) NULL,
  first_name VARCHAR(80) NULL,
  last_name VARCHAR(80) NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  bot_contact_available BOOLEAN NOT NULL DEFAULT TRUE,
  marketing_consent_at TIMESTAMP(3) NULL,
  bot_started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  last_seen_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_messenger_account_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_messenger_external_user (provider, external_user_id),
  INDEX idx_messenger_user_provider (user_id, provider, active),
  INDEX idx_messenger_delivery
    (provider, active, bot_contact_available, marketing_consent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO user_messenger_accounts
  (user_id, provider, external_user_id, chat_id, active, bot_contact_available,
   bot_started_at, last_seen_at)
SELECT MIN(u.id), 'max', c.max_user_id, MAX(COALESCE(c.max_chat_id, c.max_user_id)),
  TRUE, TRUE, MIN(c.created_at), MAX(c.created_at)
FROM max_auth_challenges c
JOIN users u ON u.phone = c.expected_phone AND u.deleted_at IS NULL
WHERE c.max_user_id IS NOT NULL AND c.verified_phone = c.expected_phone
GROUP BY c.max_user_id;

INSERT IGNORE INTO user_messenger_accounts
  (user_id, provider, external_user_id, chat_id, active, bot_contact_available,
   bot_started_at, last_seen_at)
SELECT MIN(u.id), 'telegram', c.telegram_user_id,
  MAX(COALESCE(c.telegram_chat_id, c.telegram_user_id)), TRUE, TRUE,
  MIN(c.created_at), MAX(c.created_at)
FROM telegram_auth_challenges c
JOIN users u ON u.phone = c.expected_phone AND u.deleted_at IS NULL
WHERE c.telegram_user_id IS NOT NULL AND c.verified_phone = c.expected_phone
GROUP BY c.telegram_user_id;
