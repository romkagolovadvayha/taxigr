CREATE TABLE IF NOT EXISTS ride_chat_reads (
  order_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  last_read_message_id CHAR(36) NOT NULL,
  last_read_created_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_id, user_id),
  CONSTRAINT fk_ride_chat_read_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_ride_chat_read_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_ride_chat_read_user (user_id, order_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
