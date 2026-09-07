ALTER TABLE push_tokens
  MODIFY COLUMN token VARCHAR(512) NOT NULL,
  ADD COLUMN provider VARCHAR(16) NOT NULL DEFAULT 'expo' AFTER platform,
  ADD INDEX idx_push_token_provider (provider);
