import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import mysql from 'mysql2/promise';

import { config } from '../config';

const migrationsDirectory = resolve(import.meta.dirname, '..', 'migrations');
const migrationFiles = (await readdir(migrationsDirectory))
  .filter((fileName) => /^\d+_.+\.sql$/u.test(fileName))
  .sort((left, right) => left.localeCompare(right, 'en'));

const connection = await mysql.createConnection({
  uri: config.MYSQL_URL,
  multipleStatements: true,
});

try {
  const [lockRows] = await connection.query<mysql.RowDataPacket[]>(
    "SELECT GET_LOCK('taxi_grahovo_schema_migrations', 30) AS acquired",
  );
  if (Number(lockRows[0]?.acquired) !== 1) {
    throw new Error('Could not acquire the database migration lock.');
  }

  await connection.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      migration VARCHAR(255) PRIMARY KEY,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const [appliedRows] = await connection.query<mysql.RowDataPacket[]>(
    'SELECT migration, checksum FROM schema_migrations',
  );
  const applied = new Map(
    appliedRows.map((row) => [String(row.migration), String(row.checksum)]),
  );

  for (const migrationFile of migrationFiles) {
    const sql = await readFile(resolve(migrationsDirectory, migrationFile), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const existingChecksum = applied.get(migrationFile);
    if (existingChecksum) {
      if (existingChecksum !== checksum) {
        throw new Error(`Applied migration was modified: ${migrationFile}`);
      }
      continue;
    }

    await connection.query(sql);
    await connection.query(
      'INSERT INTO schema_migrations (migration, checksum) VALUES (?, ?)',
      [migrationFile, checksum],
    );
    console.log(`Applied database migration: ${migrationFile}`);
  }
  console.log(`Database migrations completed (${migrationFiles.length} known).`);
} finally {
  await connection.query("SELECT RELEASE_LOCK('taxi_grahovo_schema_migrations')").catch(() => undefined);
  await connection.end();
}
