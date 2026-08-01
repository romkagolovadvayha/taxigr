CREATE TABLE IF NOT EXISTS driver_shifts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  started_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  ended_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_shift_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  INDEX idx_driver_shift_period (driver_id, started_at, ended_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
