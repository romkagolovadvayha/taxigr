ALTER TABLE vk_auth_challenges
  ADD COLUMN vk_avatar_url TEXT NULL AFTER vk_last_name;

ALTER TABLE max_auth_challenges
  ADD COLUMN max_avatar_url TEXT NULL AFTER max_chat_id;
