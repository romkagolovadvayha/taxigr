import { createHash } from 'node:crypto';
import type { RowDataPacket } from 'mysql2/promise';
import { extractHouseNumber, hasApproximateCoordinates } from '../src/domain/address-precision';
import type { Address, Coordinates } from '../src/domain/models';
import { distanceBetweenCoordinates } from '../src/domain/navigation';
import { houseAddressKey, rememberedHouse } from '../src/domain/remembered-address';
import { getAddressDirectory } from './address-directory';
import { db, withTransaction } from './db';

type PointRow = RowDataPacket & { address_json: Address | string };
const fromRow = (row: PointRow): Address => typeof row.address_json === 'string' ? JSON.parse(row.address_json) as Address : row.address_json;

export async function getRememberedAddresses(): Promise<Address[]> {
  // Read on each search: changes are visible across server instances and restarts.
  const [rows] = await db.query<PointRow[]>('SELECT address_json FROM remembered_address_points ORDER BY created_at');
  return rows.map(fromRow);
}

function invalid(message: string, code = 'ADDRESS_POINT_INVALID', statusCode = 400): never {
  throw Object.assign(new Error(message), { statusCode, code });
}

export async function rememberAddressPoint(userId: string, input: Address, coordinates: Coordinates): Promise<Address> {
  const identity = houseAddressKey(input);
  if (!identity || input.placeId || extractHouseNumber(input)?.toLocaleLowerCase('ru') !== extractHouseNumber({ label: input.label })?.toLocaleLowerCase('ru')) {
    invalid('Укажите адрес дома и его номер');
  }
  const directory = await getAddressDirectory();
  const canonical = directory.find(address => houseAddressKey(address) === identity);
  const address = canonical ?? input;
  if (!hasApproximateCoordinates(address)) {
    invalid('Расположение этого дома уже известно. Выберите его в поиске.', 'ADDRESS_POINT_KNOWN', 409);
  }
  if (distanceBetweenCoordinates(address.coordinates, coordinates) > 15_000) {
    invalid('Точка слишком далеко от выбранного адреса. Проверьте населённый пункт.');
  }
  const key = createHash('sha256').update(identity).digest('hex');
  const point = rememberedHouse(address, coordinates, `saved-house:${key}`);
  return withTransaction(async connection => {
    // The unique key serializes concurrent confirmations. Never overwrite a point
    // selected by another person, including when retrying a timed-out request.
    await connection.execute(
      'INSERT INTO remembered_address_points (address_key, address_json, created_by) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE address_key = address_key',
      [key, JSON.stringify(point), userId],
    );
    const [rows] = await connection.query<PointRow[]>(
      'SELECT address_json FROM remembered_address_points WHERE address_key = ? FOR UPDATE', [key]);
    const saved = fromRow(rows[0]!);
    if (distanceBetweenCoordinates(saved.coordinates, coordinates) > 80) {
      invalid('Для этого дома уже сохранена другая точка. Вернитесь к поиску и проверьте адрес.', 'ADDRESS_POINT_CONFLICT', 409);
    }
    return saved;
  });
}
