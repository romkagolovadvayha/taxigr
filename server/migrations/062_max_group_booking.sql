CREATE TABLE max_group_booking_sessions (
  id CHAR(36) PRIMARY KEY,
  device_id CHAR(36) NOT NULL,
  account_id VARCHAR(20) NOT NULL,
  sender_id VARCHAR(20) NOT NULL,
  draft_json JSON NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  UNIQUE KEY uq_max_group_booking_sender (device_id, account_id, sender_id),
  INDEX idx_max_group_booking_expiry (expires_at),
  FOREIGN KEY (device_id) REFERENCES group_alert_devices(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE max_group_booking_receipts (
  session_id CHAR(36) NOT NULL,
  event_key CHAR(64) NOT NULL,
  reply_text VARCHAR(2000) NULL,
  PRIMARY KEY (session_id, event_key),
  FOREIGN KEY (session_id) REFERENCES max_group_booking_sessions(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
