import { describe, expect, it } from 'vitest';

import { grahovoDirectoryAddresses } from '../src/data/grahovo-address-directory';
import { buildManualAddress, findBestAddressAnchor } from '../src/domain/manual-address';

describe('manual address fallback', () => {
  it('anchors an unregistered Porshur house to the matching street', () => {
    const query = 'Поршур, Бабаева, 99';
    const anchor = findBestAddressAnchor(query, grahovoDirectoryAddresses);
    const address = buildManualAddress(query, anchor);

    expect(anchor?.label).toBe('д. Поршур, ул. Бабаева');
    expect(address).toMatchObject({
      label: 'Поршур, Бабаева, 99',
      houseNumber: '99',
    });
    expect(address?.details).toContain('Введено вручную');
    expect(address?.coordinates.latitude).toBeCloseTo(56.0248498, 6);
  });

  it('uses the settlement when the typed street is absent from GAR', () => {
    const query = 'Поршур, Новая улица, 7';
    const anchor = findBestAddressAnchor(query, grahovoDirectoryAddresses);

    expect(anchor?.label).toBe('д. Поршур');
    expect(buildManualAddress(query, anchor)?.houseNumber).toBe('7');
  });

  it('does not create a manual address without a street and house number', () => {
    const anchor = grahovoDirectoryAddresses[0] ?? null;
    expect(buildManualAddress('Поршур', anchor)).toBeNull();
    expect(buildManualAddress('Поршур, Бабаева', anchor)).toBeNull();
  });
});
