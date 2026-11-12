ALTER TABLE messenger_order_messages
  ADD COLUMN synced_order_updated_at DATETIME(3) NULL,
  ADD COLUMN next_sync_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ADD COLUMN sync_attempts INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN last_sync_error VARCHAR(500) NULL,
  ADD COLUMN sync_locked_until DATETIME(3) NULL,
  ADD COLUMN sync_disabled_at DATETIME(3) NULL,
  ADD INDEX idx_messenger_message_retry (next_sync_at, order_id);
