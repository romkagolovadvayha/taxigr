ALTER TABLE users
  ADD COLUMN rating DECIMAL(3,2) NOT NULL DEFAULT 5.00 AFTER avatar_url,
  ADD COLUMN rating_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rating;

ALTER TABLE drivers
  ADD COLUMN rating_count INT UNSIGNED NOT NULL DEFAULT 0 AFTER rating;

CREATE TABLE ride_ratings (
  id CHAR(36) PRIMARY KEY,
  order_id CHAR(36) NOT NULL,
  rater_user_id CHAR(36) NOT NULL,
  ratee_user_id CHAR(36) NOT NULL,
  rater_role VARCHAR(24) NOT NULL,
  score TINYINT UNSIGNED NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_ride_rating_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_ride_rating_rater FOREIGN KEY (rater_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_ride_rating_ratee FOREIGN KEY (ratee_user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT chk_ride_rating_role CHECK (rater_role IN ('passenger','driver')),
  CONSTRAINT chk_ride_rating_score CHECK (score BETWEEN 1 AND 5),
  CONSTRAINT chk_ride_rating_participants CHECK (rater_user_id <> ratee_user_id),
  UNIQUE KEY uniq_ride_rating_side (order_id, rater_role),
  INDEX idx_ride_rating_ratee (ratee_user_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
