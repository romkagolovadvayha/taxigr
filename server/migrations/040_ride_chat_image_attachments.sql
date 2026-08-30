ALTER TABLE ride_chat_messages
  ADD COLUMN attachment_mime VARCHAR(32) NULL AFTER body,
  ADD COLUMN attachment_data MEDIUMBLOB NULL AFTER attachment_mime,
  ADD COLUMN attachment_size_bytes INT UNSIGNED NULL AFTER attachment_data,
  ADD COLUMN attachment_width SMALLINT UNSIGNED NULL AFTER attachment_size_bytes,
  ADD COLUMN attachment_height SMALLINT UNSIGNED NULL AFTER attachment_width,
  ADD COLUMN attachment_file_name VARCHAR(160) NULL AFTER attachment_height,
  ADD COLUMN attachment_sha256 CHAR(64) NULL AFTER attachment_file_name;
