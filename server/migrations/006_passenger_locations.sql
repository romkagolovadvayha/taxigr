CREATE TABLE IF NOT EXISTS passenger_locations (
  order_id CHAR(36) PRIMARY KEY,
  passenger_id CHAR(36) NOT NULL,
  latitude DECIMAL(10,7) NOT NULL,
  longitude DECIMAL(10,7) NOT NULL,
  accuracy_meters DECIMAL(8,2) NULL,
  recorded_at TIMESTAMP(3) NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_passenger_location_order
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_passenger_location_user
    FOREIGN KEY (passenger_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_passenger_location_user (passenger_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
