CREATE TABLE IF NOT EXISTS ride_chat_messages (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  sender_user_id CHAR(36) NOT NULL,
  body VARCHAR(1000) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ride_chat_message_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_ride_chat_message_sender
    FOREIGN KEY (sender_user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ride_chat_message_timeline (order_id, created_at, id),
  INDEX idx_ride_chat_message_sender (sender_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
