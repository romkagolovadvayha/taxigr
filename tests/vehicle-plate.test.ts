import { describe, expect, it } from 'vitest';
import { parseVehiclePlate } from '../src/domain/vehicle-plate';

describe('vehicle plate display', () => {
  it.each(['а123вс 18', 'А 123 ВС-18', 'А123ВС18'])('splits %s without changing its region', (plate) => {
    expect(parseVehiclePlate(plate)).toEqual({ prefix: 'А', digits: '123', suffix: 'ВС', region: '18' });
  });
  it('supports Latin lookalikes and three-digit regions', () => {
    expect(parseVehiclePlate('A240PY 777')).toEqual({ prefix: 'A', digits: '240', suffix: 'PY', region: '777' });
  });
  it.each(['А123ВС', 'ТРАНЗИТ', 'М123АВ 1234', '', '12345'])('preserves unfamiliar or incomplete plates instead of inventing a region: %s', (plate) => {
    expect(parseVehiclePlate(plate)).toBeNull();
  });
});
