CREATE TABLE messenger_order_messages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  messenger_account_id BIGINT UNSIGNED NOT NULL,
  audience ENUM('passenger', 'driver') NOT NULL,
  message_id VARCHAR(128) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_messenger_order_message_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_messenger_order_message_account
    FOREIGN KEY (messenger_account_id) REFERENCES user_messenger_accounts(id) ON DELETE CASCADE,
  UNIQUE KEY uniq_messenger_order_message (messenger_account_id, order_id, message_id),
  INDEX idx_messenger_order_sync (order_id, audience, messenger_account_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
