-- New clients receive the verified phone from the messenger. Existing clients
-- can still supply an expected phone and retain the strict comparison.
ALTER TABLE max_auth_challenges MODIFY COLUMN expected_phone VARCHAR(16) NULL;
ALTER TABLE telegram_auth_challenges MODIFY COLUMN expected_phone VARCHAR(16) NULL;
ALTER TABLE vk_auth_challenges MODIFY COLUMN expected_phone VARCHAR(16) NULL;
