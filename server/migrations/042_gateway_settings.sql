CREATE TABLE IF NOT EXISTS gateway_settings (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  settings_json JSON NOT NULL,
  proxy_password_encrypted TEXT NULL,
  webhook_secret_encrypted TEXT NULL,
  revision INT UNSIGNED NOT NULL DEFAULT 0,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT gateway_settings_singleton CHECK (id = 1),
  CONSTRAINT gateway_settings_updated_by_fk FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT IGNORE INTO gateway_settings (id, settings_json) VALUES (1, JSON_OBJECT(
  'proxyEnabled', JSON_EXTRACT('false', '$'),
  'proxyUrl', 'https://proxy.prostoj.store:443',
  'proxyUsername', '',
  'webhooksEnabled', JSON_EXTRACT('false', '$'),
  'webhookUrl', 'https://hooks.prostoj.store/relay',
  'project', '',
  'apiPublicUrl', ''
));
