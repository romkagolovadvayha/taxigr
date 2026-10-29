ALTER TABLE orders
  ADD COLUMN pricing_mode VARCHAR(16) NOT NULL DEFAULT 'fixed',
  ADD COLUMN manual_price_set BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS messenger_booking_drafts (
  provider VARCHAR(16) NOT NULL,
  external_user_id VARCHAR(64) NOT NULL,
  chat_id VARCHAR(64) NOT NULL,
  draft_json JSON NOT NULL,
  expires_at TIMESTAMP(3) NOT NULL,
  PRIMARY KEY (provider, external_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS messenger_booking_events (
  provider VARCHAR(16) NOT NULL,
  external_user_id VARCHAR(64) NOT NULL,
  event_id VARCHAR(128) NOT NULL,
  response_json JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (provider, external_user_id, event_id),
  INDEX idx_booking_event_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
