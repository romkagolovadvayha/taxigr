ALTER TABLE phone_auth_challenges
  ADD COLUMN provider_authentication_id VARCHAR(64) NULL AFTER code_hash,
  ADD INDEX idx_phone_auth_provider (provider_authentication_id);
