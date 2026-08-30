ALTER TABLE user_messenger_accounts
  ADD COLUMN notifications_enabled BOOLEAN NOT NULL DEFAULT FALSE
    AFTER bot_contact_available;

ALTER TABLE users
  ADD COLUMN notification_channels_configured_at TIMESTAMP(3) NULL
    AFTER profile_completed_at;

UPDATE user_messenger_accounts account
JOIN (
  SELECT ranked.id
  FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY FIELD(provider, 'vk', 'max', 'telegram'), created_at, id
      ) AS channel_rank
    FROM user_messenger_accounts
    WHERE active = TRUE AND bot_contact_available = TRUE
  ) ranked
  WHERE ranked.channel_rank = 1
) selected ON selected.id = account.id
SET account.notifications_enabled = TRUE;

CREATE INDEX idx_messenger_notifications
  ON user_messenger_accounts
    (user_id, notifications_enabled, active, bot_contact_available);
