import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import mysql from 'mysql2/promise';
import { describe, expect, it } from 'vitest';

describe.skipIf(process.env.RUN_API_INTEGRATION !== '1')('additive upgrade migrations', () => {
  it('resumes partial 055/056 DDL and preserves customized rates on repeated execution', async () => {
    const target = new URL(process.env.MYSQL_URL ?? '');
    if (!['127.0.0.1', 'localhost'].includes(target.hostname) || !/^\/taxi_(qa|test)_/.test(target.pathname)) {
      throw new Error('Migration tests require an isolated local taxi_qa_* or taxi_test_* database');
    }
    const database = `taxi_test_migration_${randomUUID().replaceAll('-', '')}`;
    const connection = await mysql.createConnection({ uri: target.href, multipleStatements: true });
    try {
      await connection.query(`CREATE DATABASE \`${database}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
      await connection.query(`USE \`${database}\``);
      const files = (await readdir('server/migrations')).filter(name => /^\d+_.*\.sql$/u.test(name)).sort();
      for (const file of files.filter(name => Number(name.slice(0, 3)) < 55)) {
        await connection.query(await readFile(`server/migrations/${file}`, 'utf8'));
      }
      // Simulate a crash after only the first ALTER of each new migration.
      await connection.query("ALTER TABLE max_auth_challenges ADD COLUMN return_platform VARCHAR(16) NOT NULL DEFAULT 'legacy'");
      await connection.query('ALTER TABLE tariff_settings ADD COLUMN intercity_per_kilometer_07_22_minor INT UNSIGNED NOT NULL DEFAULT 5000');
      await connection.query('UPDATE tariff_settings SET intercity_per_kilometer_07_22_minor = 6100');
      for (let attempt = 0; attempt < 2; attempt++) {
        for (const file of ['055_messenger_auth_return.sql', '056_intercity_time_fares.sql']) {
          await connection.query(await readFile(`server/migrations/${file}`, 'utf8'));
        }
        const [rates] = await connection.query<mysql.RowDataPacket[]>('SELECT intercity_per_kilometer_minor AS legacy, intercity_per_kilometer_07_22_minor AS day, intercity_per_kilometer_22_02_minor AS evening, intercity_per_kilometer_02_07_minor AS night FROM tariff_settings WHERE id = 1');
        expect(rates[0]).toMatchObject({ legacy: 6100, day: 6100, evening: 7000, night: 10000 });
        const [columns] = await connection.query<mysql.RowDataPacket[]>("SELECT TABLE_NAME, COLUMN_DEFAULT FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ? AND COLUMN_NAME = 'return_platform'", [database]);
        expect(columns).toHaveLength(3);
        expect(columns.every(column => String(column.COLUMN_DEFAULT).replaceAll("'", '') === 'legacy')).toBe(true);
      }
    } finally {
      await connection.query(`DROP DATABASE IF EXISTS \`${database}\``);
      await connection.end();
    }
  }, 30_000);
});
