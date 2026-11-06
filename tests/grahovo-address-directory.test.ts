import { describe, expect, it } from 'vitest';

import { grahovoDirectoryAddresses } from '../src/data/grahovo-address-directory';

describe('official Grahovo GAR address directory', () => {
  it('contains the complete active 2026-11-02 district snapshot', () => {
    const houses = grahovoDirectoryAddresses.filter((address) => address.houseNumber);
    const parents = grahovoDirectoryAddresses.filter((address) => !address.houseNumber);
    const settlements = parents.filter((address) =>
      address.details?.includes('населённый пункт из ГАР'),
    );
    const planningObjects = parents.filter((address) =>
      address.details?.includes('территория из ГАР'),
    );
    const streets = parents.filter((address) => address.details?.includes('улица из ГАР'));

    expect(settlements).toHaveLength(41);
    expect(settlements.every((address) => address.kind === 'settlement')).toBe(true);
    expect(planningObjects).toHaveLength(38);
    expect(streets).toHaveLength(194);
    expect(houses).toHaveLength(4167);
    expect(grahovoDirectoryAddresses).toHaveLength(4440);
  });

  it('has stable unique identifiers and unambiguous visible labels', () => {
    const ids = new Set(grahovoDirectoryAddresses.map((address) => address.id));
    const labels = new Set(grahovoDirectoryAddresses.map((address) => address.label));

    expect(ids.size).toBe(grahovoDirectoryAddresses.length);
    expect(labels.size).toBe(grahovoDirectoryAddresses.length);
  });

  it('includes the streets that were absent from the old fallback', () => {
    const labels = new Set(grahovoDirectoryAddresses.map((address) => address.label));

    expect(labels).toContain('д. Порым, ул. Кирпичная');
    expect(labels).toContain('с. Заречный, ул. Заречная');
    expect(labels).toContain('с. Заречный, ул. Конзаводская');
  });

  it('includes all 56 active Porshur addressable objects', () => {
    const houses = grahovoDirectoryAddresses.filter(
      (address) => address.label.startsWith('д. Поршур,') && address.houseNumber,
    );

    expect(houses).toHaveLength(56);
    expect(houses.map((address) => address.label)).toContain('д. Поршур, ул. Бабаева, 32');
    expect(houses.map((address) => address.label)).toContain('д. Поршур, ул. Тимофеева, 51');
  });

  it('includes active GAR objects attached to district territories', () => {
    expect(grahovoDirectoryAddresses.map((address) => address.label)).toContain(
      'тер. Гаражная (Порым), 1/2',
    );
  });
});
