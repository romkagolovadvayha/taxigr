CREATE TABLE IF NOT EXISTS driver_priority_assignments (
  driver_id CHAR(36) NOT NULL,
  scope VARCHAR(24) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (driver_id, scope),
  CONSTRAINT fk_driver_priority_driver
    FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE CASCADE,
  CONSTRAINT chk_driver_priority_scope CHECK (scope IN ('grahovo','district','intercity')),
  INDEX idx_driver_priority_scope (scope, driver_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS driver_dispatch_settings (
  scope VARCHAR(24) PRIMARY KEY,
  delay_minutes TINYINT UNSIGNED NOT NULL DEFAULT 1,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_driver_dispatch_admin
    FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT chk_driver_dispatch_scope CHECK (scope IN ('grahovo','district','intercity'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO driver_dispatch_settings (scope, delay_minutes)
VALUES ('grahovo', 1), ('district', 1), ('intercity', 1)
ON DUPLICATE KEY UPDATE scope = VALUES(scope);

ALTER TABLE orders
  ADD COLUMN priority_release_at TIMESTAMP(3) NULL AFTER pricing_scope,
  ADD COLUMN priority_released_at TIMESTAMP(3) NULL AFTER priority_release_at,
  ADD INDEX idx_orders_priority_release (status, priority_released_at, priority_release_at);

UPDATE orders
SET priority_release_at = created_at,
    priority_released_at = created_at
WHERE priority_release_at IS NULL;
