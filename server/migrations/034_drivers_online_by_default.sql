ALTER TABLE drivers
  MODIFY COLUMN status VARCHAR(24) NOT NULL DEFAULT 'online';

UPDATE drivers
SET status = 'online'
WHERE status = 'offline';

INSERT INTO driver_shifts (driver_id, started_at)
SELECT d.id, UTC_TIMESTAMP(3)
FROM drivers d
WHERE d.status = 'online'
  AND NOT EXISTS (
    SELECT 1
    FROM driver_shifts s
    WHERE s.driver_id = d.id AND s.ended_at IS NULL
  );
