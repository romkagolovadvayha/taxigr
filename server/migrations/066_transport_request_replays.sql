CREATE TABLE IF NOT EXISTS transport_request_replays (
  request_key CHAR(64) PRIMARY KEY,
  fingerprint CHAR(64) NOT NULL,
  status_code SMALLINT UNSIGNED NULL,
  response_body MEDIUMTEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_transport_replay_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
