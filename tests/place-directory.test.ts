import { describe, expect, it } from 'vitest';

import { createEmptySchedule, getPlaceOpenStatus, placeSearchScore } from '../src/domain/place-directory';
import type { PlaceDirectoryEntry } from '../src/domain/models';

function dateInSamara(value: string): Date {
  return new Date(`${value}+04:00`);
}

describe('place directory', () => {
  it('finds places by aliases, categories, partial words and a one-letter typo', () => {
    const place = {
      name: 'Пятёрочка',
      aliases: ['Пятерочка', '5ка'],
      category: 'shopping',
      description: 'Супермаркет',
      addressLabel: 'ул. Советская, 15А',
    } satisfies Pick<PlaceDirectoryEntry, 'name' | 'aliases' | 'category' | 'description' | 'addressLabel'>;

    expect(placeSearchScore(place, '5ка')).toBeGreaterThan(0);
    expect(placeSearchScore(place, 'магазин')).toBeGreaterThan(0);
    expect(placeSearchScore(place, 'пятер')).toBeGreaterThan(0);
    expect(placeSearchScore(place, 'пятерочка')).toBeGreaterThan(0);
    expect(placeSearchScore(place, 'аптека')).toBe(0);
  });

  it('shows closing time for a regular and overnight interval', () => {
    const regular = createEmptySchedule();
    regular.tue = [{ opensAt: '09:00', closesAt: '17:00' }];
    expect(getPlaceOpenStatus(regular, dateInSamara('2026-08-25T15:30:00'))).toEqual({
      kind: 'open',
      label: 'Открыто до 17:00',
    });

    const overnight = createEmptySchedule();
    overnight.tue = [{ opensAt: '18:00', closesAt: '02:00' }];
    expect(getPlaceOpenStatus(overnight, dateInSamara('2026-08-26T01:15:00'))).toEqual({
      kind: 'open',
      label: 'Открыто до 02:00',
    });
  });

  it('finds the next opening across closed days and supports 24-hour places', () => {
    const schedule = createEmptySchedule();
    schedule.fri = [{ opensAt: '18:00', closesAt: '23:00' }];
    schedule.sat = [{ opensAt: '18:00', closesAt: '23:00' }];
    expect(getPlaceOpenStatus(schedule, dateInSamara('2026-08-25T12:00:00'))).toEqual({
      kind: 'closed',
      label: 'Закрыто до пт, 18:00',
    });

    const always = createEmptySchedule();
    always.tue = [{ opensAt: '00:00', closesAt: '00:00' }];
    expect(getPlaceOpenStatus(always, dateInSamara('2026-08-25T12:00:00'))).toEqual({
      kind: 'open',
      label: 'Открыто круглосуточно',
    });
  });

  it('distinguishes missing hours from a closed schedule', () => {
    expect(getPlaceOpenStatus(createEmptySchedule(), dateInSamara('2026-08-25T12:00:00'))).toEqual({
      kind: 'unknown',
      label: 'Режим не указан',
    });
  });
});
