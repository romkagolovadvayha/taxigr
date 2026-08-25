import mysql, { type Pool, type PoolConnection, type RowDataPacket } from 'mysql2/promise';

import { config } from './config';

export const db: Pool = mysql.createPool({
  uri: config.MYSQL_URL,
  connectionLimit: 12,
  maxIdle: 8,
  idleTimeout: 60_000,
  enableKeepAlive: true,
  timezone: 'Z',
  decimalNumbers: true,
});

function isRetryableTransactionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const candidate = error as { code?: unknown; errno?: unknown };
  return (
    candidate.code === 'ER_LOCK_DEADLOCK' ||
    candidate.code === 'ER_LOCK_WAIT_TIMEOUT' ||
    candidate.errno === 1213 ||
    candidate.errno === 1205
  );
}

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const connection = await db.getConnection();
    try {
      await connection.beginTransaction();
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      await connection.rollback();
      if (!isRetryableTransactionError(error) || attempt === maxAttempts) throw error;
    } finally {
      connection.release();
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 20 + Math.random() * 20));
  }
  throw new Error('Transaction retry limit reached');
}

export async function firstRow<T extends RowDataPacket>(
  sql: string,
  values: unknown[] = [],
): Promise<T | null> {
  const [rows] = await db.query<T[]>(sql, values);
  return rows[0] ?? null;
}
