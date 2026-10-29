import { randomUUID } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { z } from 'zod';
import { withTransaction } from './db';
import { normalizeRussianPhone } from './phone-verification';

export const adminDriverProfileSchema = z.object({
  name: z.string().trim().min(2).max(160).optional(),
  phone: z.string().trim().max(32).transform(value => normalizeRussianPhone(value))
    .refine((value): value is string => value !== null, 'Укажите российский мобильный номер').optional(),
  licenseNumber: z.string().trim().min(4).max(64).nullable().optional(),
  hasChildSeat: z.boolean().optional(),
  hasSezPass: z.boolean().optional(),
  vehicle: z.object({
    make: z.string().trim().min(2).max(80),
    model: z.string().trim().min(1).max(80),
    year: z.number().int().min(1980).max(new Date().getFullYear() + 1),
    color: z.string().trim().min(2).max(64),
    colorHex: z.string().regex(/^#[0-9A-F]{6}$/iu).transform(value => value.toUpperCase()),
    plate: z.string().trim().min(5).max(24).transform(value => value.toUpperCase()),
  }).strict().optional(),
}).strict().refine(value => Object.keys(value).length > 0, 'Измените хотя бы одно поле');

function conflict(message: string, code: string): never {
  throw Object.assign(new Error(message), {statusCode: 409, code});
}

export async function updateAdminDriverProfile(
  driverId: string, input: z.infer<typeof adminDriverProfileSchema>, actorId: string, ip: string,
): Promise<{id: string; userId: string}> {
  return withTransaction(async connection => {
    const [drivers] = await connection.query<(RowDataPacket & {
      user_id: string; name: string; phone: string | null; license_number: string | null;
      has_child_seat: number; has_sez_pass: number;
    })[]>(`SELECT d.user_id, u.name, u.phone, d.license_number, d.has_child_seat, d.has_sez_pass
      FROM drivers d JOIN users u ON u.id = d.user_id WHERE d.id = ? FOR UPDATE`, [driverId]);
    const current = drivers[0];
    if (!current) throw Object.assign(new Error('Водитель не найден'), {statusCode: 404, code: 'DRIVER_NOT_FOUND'});
    const [vehicles] = await connection.query<RowDataPacket[]>(
      'SELECT id, make, model, year, color, color_hex AS colorHex, plate FROM vehicles WHERE driver_id = ? AND active = TRUE FOR UPDATE', [driverId],
    );
    const vehicle = vehicles[0];
    const vehicleChanged = !!input.vehicle && (!vehicle || Object.entries(input.vehicle).some(([key, value]) => vehicle[key] !== value));
    const equipmentChanged = input.hasChildSeat !== undefined && input.hasChildSeat !== Boolean(current.has_child_seat);
    if (vehicleChanged || equipmentChanged) {
      const [orders] = await connection.query<RowDataPacket[]>(`SELECT id FROM orders WHERE driver_id = ?
        AND status IN ('accepted','driver_arriving','driver_waiting','in_progress') LIMIT 1 FOR UPDATE`, [driverId]);
      if (orders.length) conflict('Дождитесь завершения текущей поездки, чтобы изменить автомобиль или детское кресло', 'ACTIVE_RIDE_IN_PROGRESS');
      const [pending] = await connection.query<RowDataPacket[]>(
        "SELECT id FROM vehicle_change_requests WHERE driver_id = ? AND status = 'pending' LIMIT 1 FOR UPDATE", [driverId],
      );
      if (pending.length) conflict('Сначала рассмотрите заявку водителя на изменение автомобиля', 'PENDING_VEHICLE_CHANGE_EXISTS');
    }
    if (input.phone !== undefined && input.phone !== current.phone) {
      const [owners] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM users WHERE phone = ? AND id <> ? LIMIT 1 FOR UPDATE', [input.phone, current.user_id],
      );
      if (owners.length) conflict('Этот телефон уже используется другим пользователем', 'PHONE_ALREADY_EXISTS');
      // An administrative edit does not prove ownership of the new number.
      await connection.execute('UPDATE users SET phone = ?, phone_verified_at = NULL WHERE id = ?', [input.phone, current.user_id]);
    }
    if (input.name !== undefined) await connection.execute('UPDATE users SET name = ? WHERE id = ?', [input.name, current.user_id]);
    await connection.execute(`UPDATE drivers SET has_sez_pass = COALESCE(?, has_sez_pass),
      has_child_seat = COALESCE(?, has_child_seat),
      license_number = CASE WHEN ? THEN ? ELSE license_number END WHERE id = ?`, [
      input.hasSezPass ?? null, input.hasChildSeat ?? null,
      input.licenseNumber !== undefined, input.licenseNumber ?? null, driverId,
    ]);
    if (vehicleChanged && input.vehicle) {
      const next = input.vehicle;
      const [plates] = await connection.query<RowDataPacket[]>(
        'SELECT id FROM vehicles WHERE plate = ? AND active = TRUE AND driver_id <> ? LIMIT 1 FOR UPDATE', [next.plate, driverId],
      );
      if (plates.length) conflict('Этот госномер уже используется другим водителем', 'PLATE_ALREADY_EXISTS');
      // Orders keep their original vehicle_id and historical vehicle details.
      await connection.execute('UPDATE vehicles SET active = FALSE WHERE driver_id = ? AND active = TRUE', [driverId]);
      await connection.execute(`INSERT INTO vehicles (id, driver_id, make, model, year, color, color_hex, plate, active)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, TRUE)`, [randomUUID(), driverId, next.make, next.model, next.year, next.color, next.colorHex, next.plate]);
    }
    await connection.execute(`INSERT INTO audit_logs
      (actor_user_id, action, entity_type, entity_id, before_json, after_json, ip_address) VALUES (?, 'driver.profile.update', 'driver', ?, ?, ?, ?)`, [
      actorId, driverId, JSON.stringify({...current, vehicle: vehicle ?? null}), JSON.stringify(input), ip,
    ]);
    return {id: driverId, userId: current.user_id};
  });
}
