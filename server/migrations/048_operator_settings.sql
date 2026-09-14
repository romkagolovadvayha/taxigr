CREATE TABLE IF NOT EXISTS operator_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  settings_json JSON NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT operator_settings_singleton CHECK (id = 1),
  CONSTRAINT operator_settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO operator_settings (id, settings_json) VALUES (1, NULL);
