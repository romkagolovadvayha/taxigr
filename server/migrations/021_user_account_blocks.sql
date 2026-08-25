ALTER TABLE users
  ADD COLUMN blocked_at TIMESTAMP(3) NULL AFTER order_block_reason,
  ADD COLUMN block_reason VARCHAR(500) NULL AFTER blocked_at,
  ADD COLUMN blocked_by CHAR(36) NULL AFTER block_reason,
  ADD CONSTRAINT fk_users_blocked_by
    FOREIGN KEY (blocked_by) REFERENCES users(id) ON DELETE SET NULL,
  ADD INDEX idx_users_blocked (blocked_at);
