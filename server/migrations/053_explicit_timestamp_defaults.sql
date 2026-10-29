-- Old MySQL/MariaDB installations may implicitly add ON UPDATE CURRENT_TIMESTAMP
-- to the first TIMESTAMP column. Expiry and event times must never move when
-- another field (for example a failed verification attempt) changes.
-- An omitted expiry is deliberately expired, independent of server defaults.
ALTER TABLE oauth_states MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE session_codes MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE geocoding_cache MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE phone_auth_challenges MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE phone_verification_challenges MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE max_auth_challenges MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE telegram_auth_challenges MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE vk_auth_challenges MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE messenger_booking_drafts MODIFY expires_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
ALTER TABLE driver_locations MODIFY recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE passenger_locations MODIFY recorded_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
ALTER TABLE ride_chat_reads MODIFY last_read_created_at TIMESTAMP(3) NOT NULL DEFAULT '2000-01-01 00:00:00';
