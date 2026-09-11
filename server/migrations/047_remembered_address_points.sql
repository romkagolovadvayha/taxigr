CREATE TABLE remembered_address_points (
  address_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  address_json JSON NOT NULL,
  created_by CHAR(36) NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_remembered_address_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
