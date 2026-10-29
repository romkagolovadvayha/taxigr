-- DDL commits independently in MySQL. A deployment may stop between these
-- statements, before the migration journal is written; allow a safe retry.
SET @driver_application_sez_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'driver_applications' AND column_name = 'has_sez_pass') = 0,
  'ALTER TABLE driver_applications ADD COLUMN has_sez_pass BOOLEAN NOT NULL DEFAULT FALSE AFTER has_child_seat',
  'DO 0'
);
PREPARE driver_application_sez_statement FROM @driver_application_sez_sql;
EXECUTE driver_application_sez_statement;
DEALLOCATE PREPARE driver_application_sez_statement;

SET @driver_sez_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'drivers' AND column_name = 'has_sez_pass') = 0,
  'ALTER TABLE drivers ADD COLUMN has_sez_pass BOOLEAN NOT NULL DEFAULT FALSE AFTER has_child_seat',
  'DO 0'
);
PREPARE driver_sez_statement FROM @driver_sez_sql;
EXECUTE driver_sez_statement;
DEALLOCATE PREPARE driver_sez_statement;

SET @driver_license_sql = IF(
  (SELECT COUNT(*) FROM information_schema.columns
   WHERE table_schema = DATABASE() AND table_name = 'drivers' AND column_name = 'license_number') = 0,
  'ALTER TABLE drivers ADD COLUMN license_number VARCHAR(64) NULL AFTER has_sez_pass',
  'DO 0'
);
PREPARE driver_license_statement FROM @driver_license_sql;
EXECUTE driver_license_statement;
DEALLOCATE PREPARE driver_license_statement;

UPDATE drivers d
SET license_number = (
  SELECT a.license_number FROM driver_applications a
  WHERE a.user_id = d.user_id AND a.status = 'approved'
  ORDER BY a.moderated_at DESC, a.created_at DESC, a.id DESC LIMIT 1
)
WHERE license_number IS NULL;
