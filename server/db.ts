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

export async function withTransaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await db.getConnection();
  try {
    await connection.beginTransaction();
    const result = await work(connection);
    await connection.commit();
    return result;
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

export async function firstRow<T extends RowDataPacket>(
  sql: string,
  values: unknown[] = [],
): Promise<T | null> {
  const [rows] = await db.query<T[]>(sql, values);
  return rows[0] ?? null;
}

