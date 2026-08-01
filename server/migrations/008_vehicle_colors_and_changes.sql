ALTER TABLE driver_applications
  ADD COLUMN vehicle_color_hex CHAR(7) NOT NULL DEFAULT '#777C84' AFTER vehicle_color;

ALTER TABLE vehicles
  ADD COLUMN color_hex CHAR(7) NOT NULL DEFAULT '#777C84' AFTER color;

UPDATE driver_applications
SET vehicle_color_hex = CASE
  WHEN LOWER(vehicle_color) REGEXP 'бел|слонов|молоч' THEN '#F7F7F2'
  WHEN LOWER(vehicle_color) REGEXP 'черн|чёрн' THEN '#171717'
  WHEN LOWER(vehicle_color) REGEXP 'серебр' THEN '#B8BDC4'
  WHEN LOWER(vehicle_color) REGEXP 'графит|антрацит' THEN '#454A52'
  WHEN LOWER(vehicle_color) REGEXP 'сер|асфальт' THEN '#777C84'
  WHEN LOWER(vehicle_color) REGEXP 'темно-син|тёмно-син' THEN '#193C70'
  WHEN LOWER(vehicle_color) REGEXP 'син|голуб' THEN '#2F6FED'
  WHEN LOWER(vehicle_color) REGEXP 'борд|вишн' THEN '#721F2C'
  WHEN LOWER(vehicle_color) REGEXP 'красн' THEN '#D64545'
  WHEN LOWER(vehicle_color) REGEXP 'темно-зел|тёмно-зел' THEN '#1F5134'
  WHEN LOWER(vehicle_color) REGEXP 'зел|зелён' THEN '#2F7D4A'
  WHEN LOWER(vehicle_color) REGEXP 'беж|песоч' THEN '#D8C3A5'
  WHEN LOWER(vehicle_color) REGEXP 'коричн|кофе' THEN '#6B4634'
  WHEN LOWER(vehicle_color) REGEXP 'желт|жёлт' THEN '#F4C400'
  WHEN LOWER(vehicle_color) REGEXP 'оранж' THEN '#E97926'
  WHEN LOWER(vehicle_color) REGEXP 'золот' THEN '#C9A227'
  WHEN LOWER(vehicle_color) REGEXP 'фиолет|сирен' THEN '#6B4DA0'
  ELSE vehicle_color_hex
END;

UPDATE vehicles
SET color_hex = CASE
  WHEN LOWER(color) REGEXP 'бел|слонов|молоч' THEN '#F7F7F2'
  WHEN LOWER(color) REGEXP 'черн|чёрн' THEN '#171717'
  WHEN LOWER(color) REGEXP 'серебр' THEN '#B8BDC4'
  WHEN LOWER(color) REGEXP 'графит|антрацит' THEN '#454A52'
  WHEN LOWER(color) REGEXP 'сер|асфальт' THEN '#777C84'
  WHEN LOWER(color) REGEXP 'темно-син|тёмно-син' THEN '#193C70'
  WHEN LOWER(color) REGEXP 'син|голуб' THEN '#2F6FED'
  WHEN LOWER(color) REGEXP 'борд|вишн' THEN '#721F2C'
  WHEN LOWER(color) REGEXP 'красн' THEN '#D64545'
  WHEN LOWER(color) REGEXP 'темно-зел|тёмно-зел' THEN '#1F5134'
  WHEN LOWER(color) REGEXP 'зел|зелён' THEN '#2F7D4A'
  WHEN LOWER(color) REGEXP 'беж|песоч' THEN '#D8C3A5'
  WHEN LOWER(color) REGEXP 'коричн|кофе' THEN '#6B4634'
  WHEN LOWER(color) REGEXP 'желт|жёлт' THEN '#F4C400'
  WHEN LOWER(color) REGEXP 'оранж' THEN '#E97926'
  WHEN LOWER(color) REGEXP 'золот' THEN '#C9A227'
  WHEN LOWER(color) REGEXP 'фиолет|сирен' THEN '#6B4DA0'
  ELSE color_hex
END;

ALTER TABLE vehicles
  DROP INDEX plate,
  ADD INDEX idx_vehicle_plate_active (plate, active);

CREATE TABLE vehicle_change_requests (
  id CHAR(36) PRIMARY KEY,
  driver_id CHAR(36) NOT NULL,
  current_vehicle_id CHAR(36) NOT NULL,
  vehicle_make VARCHAR(80) NOT NULL,
  vehicle_model VARCHAR(80) NOT NULL,
  vehicle_year SMALLINT UNSIGNED NOT NULL,
  vehicle_color VARCHAR(64) NOT NULL,
  vehicle_color_hex CHAR(7) NOT NULL,
  plate VARCHAR(24) NOT NULL,
  has_child_seat BOOLEAN NOT NULL DEFAULT FALSE,
  status VARCHAR(24) NOT NULL DEFAULT 'pending',
  moderation_comment TEXT NULL,
  moderated_by CHAR(36) NULL,
  moderated_at TIMESTAMP(3) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_vehicle_change_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  CONSTRAINT fk_vehicle_change_current FOREIGN KEY (current_vehicle_id) REFERENCES vehicles(id) ON DELETE RESTRICT,
  CONSTRAINT fk_vehicle_change_admin FOREIGN KEY (moderated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_vehicle_change_status CHECK (status IN ('pending','approved','rejected')),
  INDEX idx_vehicle_change_driver_created (driver_id, created_at),
  INDEX idx_vehicle_change_status_created (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
