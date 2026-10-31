CREATE TABLE vk_broadcast_audience (
  community_key VARCHAR(24) NOT NULL,
  peer_id BIGINT UNSIGNED NOT NULL,
  PRIMARY KEY (community_key, peer_id),
  allowed BOOLEAN NULL,
  checked_at DATETIME(3) NULL,
  INDEX idx_broadcast_permission (community_key, checked_at, peer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vk_broadcast_sync (
  community_key VARCHAR(24) PRIMARY KEY,
  generation CHAR(36) NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'idle',
  stage VARCHAR(24) NOT NULL DEFAULT 'members',
  page_offset INT UNSIGNED NOT NULL DEFAULT 0,
  members_count INT UNSIGNED NOT NULL DEFAULT 0,
  started_at DATETIME(3) NULL,
  finished_at DATETIME(3) NULL,
  next_attempt_at DATETIME(3) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(300) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO vk_broadcast_sync (community_key) VALUES ('taxi'), ('afisha');

CREATE TABLE vk_broadcast_campaigns (
  id CHAR(36) PRIMARY KEY,
  community_key VARCHAR(24) NOT NULL,
  title VARCHAR(120) NOT NULL,
  message_text TEXT NOT NULL,
  image_mime VARCHAR(32) NULL,
  image_bytes MEDIUMBLOB NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 1,
  launched BOOLEAN NOT NULL DEFAULT FALSE,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_broadcast_campaign_date (community_key, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vk_broadcast_runs (
  id CHAR(36) PRIMARY KEY,
  community_key VARCHAR(24) NOT NULL,
  campaign_id CHAR(36) NOT NULL,
  revision INT UNSIGNED NOT NULL,
  mode VARCHAR(8) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'queued',
  message_text TEXT NOT NULL,
  image_mime VARCHAR(32) NULL,
  image_bytes MEDIUMBLOB NULL,
  attachment VARCHAR(200) NULL,
  created_by CHAR(36) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  next_attempt_at DATETIME(3) NULL,
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  last_error VARCHAR(300) NULL,
  FOREIGN KEY (campaign_id) REFERENCES vk_broadcast_campaigns(id),
  INDEX idx_broadcast_run_queue (community_key, status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE vk_broadcast_deliveries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  run_id CHAR(36) NOT NULL,
  peer_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  attempts INT UNSIGNED NOT NULL DEFAULT 0,
  next_attempt_at DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  vk_message_id VARCHAR(100) NULL,
  last_error VARCHAR(300) NULL,
  FOREIGN KEY (run_id) REFERENCES vk_broadcast_runs(id),
  UNIQUE KEY uniq_broadcast_recipient (run_id, peer_id),
  INDEX idx_broadcast_delivery_queue (run_id, status, next_attempt_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
