import { describe, expect, it } from 'vitest';
import { searchIntercitySettlements } from '../src/domain/intercity-search';
import { intercitySettlements } from '../src/data/intercity-settlements';
import { mergeAddressSuggestions } from '../src/domain/address-suggestions-selection';
import { isDestinationAddressComplete } from '../src/domain/address-precision';
import { isGrahovoDistrictAddress } from '../src/domain/pricing';

describe('nationwide locality search', () => {
  it.each(['Самара', 'город Самара', 'г. Самара', 'Samara', 'Cfvfhf'])('finds Samara without a network lookup: %s', query => {
    const found = searchIntercitySettlements(query)[0]!;
    expect(found.label).toBe('Самара');
    expect(found.coordinates.latitude).toBeCloseTo(53.2, 1);
    expect(found.coordinates.longitude).toBeCloseTo(50.15, 1);
    expect(isDestinationAddressComplete(found)).toBe(true);
  });
  it.each(['Санкт-Петербург', 'Екатеринбург', 'Владивосток', 'Новосибирск', 'Тольятти', 'Москва'])(
    'finds %s locally', query => expect(searchIntercitySettlements(query)[0]?.label).toBe(query),
  );
  it('returns prefix suggestions and retains the city for an intercity street query', () => {
    expect(searchIntercitySettlements('Сама')[0]?.label).toBe('Самара');
    expect(searchIntercitySettlements('Самара Гагарина 5')[0]?.label).toBe('Самара');
    expect(searchIntercitySettlements('Ачинцева 5')).toEqual([]);
  });
  it('preserves the verified existing city identifiers', () => {
    expect(searchIntercitySettlements('Можга')[0]?.id).toBe('osm-settlement:6821105');
    expect(searchIntercitySettlements('Ижевск')[0]?.id).toBe('intercity:izhevsk');
    expect(searchIntercitySettlements('Казань')[0]?.id).toBe('intercity:kazan');
    expect(intercitySettlements.some(isGrahovoDistrictAddress)).toBe(false);
    expect(searchIntercitySettlements('я хочу в можгу')[0]?.id).toBe('osm-settlement:6821105');
  });
  it('keeps same-named places in different regions selectable', () => {
    const towns = searchIntercitySettlements('Советск').filter(a => a.label === 'Советск');
    expect(towns.length).toBeGreaterThan(1);
    expect(mergeAddressSuggestions(towns, [])).toHaveLength(towns.length);
  });
  it('resolves both meanings of tsk in Latin city names', () => {
    expect(searchIntercitySettlements('Sovetsk')[0]?.label).toBe('Советск');
    expect(searchIntercitySettlements('Novokuznetsk')[0]?.label).toBe('Новокузнецк');
  });
});
