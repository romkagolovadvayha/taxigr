CREATE TABLE group_alert_devices (
  id CHAR(36) PRIMARY KEY,
  owner_id CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  groups_json JSON NOT NULL,
  pairing_hash CHAR(64) NULL UNIQUE,
  pairing_expires_at DATETIME(3) NOT NULL,
  token_hash CHAR(64) NULL UNIQUE,
  revoked_at DATETIME(3) NULL,
  last_seen_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_group_device_owner (owner_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_alert_events (
  id CHAR(36) PRIMARY KEY,
  device_id CHAR(36) NOT NULL,
  event_key CHAR(64) NOT NULL,
  provider VARCHAR(16) NOT NULL,
  group_title VARCHAR(200) NOT NULL,
  sender_name VARCHAR(200) NULL,
  message_text VARCHAR(2000) NOT NULL,
  message_at DATETIME(3) NOT NULL,
  matched_user_id CHAR(36) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (device_id) REFERENCES group_alert_devices(id) ON DELETE CASCADE,
  FOREIGN KEY (matched_user_id) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE KEY uniq_group_event (device_id, event_key),
  INDEX idx_group_event_retention (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE group_alert_deliveries (
  event_id CHAR(36) NOT NULL,
  account_id BIGINT UNSIGNED NOT NULL,
  attempts INT NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  delivered_at DATETIME(3) NULL,
  PRIMARY KEY (event_id, account_id),
  FOREIGN KEY (event_id) REFERENCES group_alert_events(id) ON DELETE CASCADE,
  FOREIGN KEY (account_id) REFERENCES user_messenger_accounts(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
