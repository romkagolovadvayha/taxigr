import { randomUUID } from 'node:crypto';

import { db } from '../db';

async function seed(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo seed is disabled in production');
  }
  const passengerId = randomUUID();
  const driverUserId = randomUUID();
  const driverId = randomUUID();
  await db.execute(
    `INSERT IGNORE INTO users
      (id, name, phone, phone_verified_at, gender, profile_completed_at)
     VALUES
      (?, 'Дмитрий Пассажир', '+79120000001', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3)),
      (?, 'Алексей Водитель', '+79120000002', UTC_TIMESTAMP(3), 'male', UTC_TIMESTAMP(3))`,
    [passengerId, driverUserId],
  );
  await db.execute(
    `UPDATE users
     SET phone_verified_at = COALESCE(phone_verified_at, UTC_TIMESTAMP(3))
     WHERE phone IN ('+79120000001', '+79120000002')`,
  );
  await db.execute(
    `INSERT IGNORE INTO user_roles (user_id, role)
     SELECT id, 'passenger' FROM users WHERE phone IN ('+79120000001', '+79120000002')`,
  );
  const [users] = await db.query<import('mysql2/promise').RowDataPacket[]>(
    "SELECT id, phone FROM users WHERE phone IN ('+79120000001', '+79120000002')",
  );
  const actualDriverUser = String(users.find((row) => row.phone === '+79120000002')!.id);
  await db.execute(
    `INSERT INTO drivers (id, user_id, has_child_seat)
     VALUES (?, ?, TRUE) ON DUPLICATE KEY UPDATE has_child_seat = TRUE`,
    [driverId, actualDriverUser],
  );
  const [drivers] = await db.query<import('mysql2/promise').RowDataPacket[]>(
    'SELECT id FROM drivers WHERE user_id = ?',
    [actualDriverUser],
  );
  await db.execute(
    `INSERT IGNORE INTO vehicles (id, driver_id, make, model, year, color, color_hex, plate)
     VALUES (?, ?, 'Lada', 'Vesta', 2022, 'Белая', '#F7F7F2', 'А123АА18')`,
    [randomUUID(), drivers[0]!.id],
  );
  await db.execute(
    "INSERT IGNORE INTO user_roles (user_id, role) VALUES (?, 'driver')",
    [actualDriverUser],
  );
}

seed()
  .then(async () => {
    console.log('Demo users and driver seeded.');
    await db.end();
  })
  .catch(async (error) => {
    console.error(error);
    await db.end();
    process.exitCode = 1;
  });
