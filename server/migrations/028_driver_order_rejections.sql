CREATE TABLE IF NOT EXISTS driver_order_rejections (
  order_id CHAR(36) NOT NULL,
  driver_id CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (order_id, driver_id),
  CONSTRAINT fk_driver_order_rejection_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_driver_order_rejection_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  INDEX idx_driver_order_rejections_driver (driver_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
