import { describe, expect, it } from 'vitest';

import { formatRouteAddresses, formatRouteLabel } from '../src/domain/route-label';

describe('route labels', () => {
  it('removes a repeated locality from both addresses', () => {
    expect(
      formatRouteLabel(
        { label: 'с. Грахово, ул. Юбилейная, 5' },
        { label: 'с. Грахово, ул. Ачинцева, 2а' },
      ),
    ).toBe('ул. Юбилейная, 5 → ул. Ачинцева, 2а');
  });

  it('keeps localities when the route crosses settlements', () => {
    expect(
      formatRouteLabel(
        { label: 'с. Грахово, ул. Ачинцева, 5' },
        { label: 'с. Заречный, ул. Школьная, 2' },
      ),
    ).toBe('с. Грахово, ул. Ачинцева, 5 → с. Заречный, ул. Школьная, 2');
  });

  it('recognizes the same locality from address details', () => {
    expect(
      formatRouteAddresses(
        { label: 'с. Грахово, ул. Ачинцева, 5' },
        { label: 'ул. 50 лет Победы, 19', details: 'с. Грахово, Граховский район' },
      ),
    ).toEqual({
      pickup: 'ул. Ачинцева, 5',
      destination: 'ул. 50 лет Победы, 19',
      sameLocality: true,
    });
  });

  it('does not shorten addresses when their localities are unknown', () => {
    expect(formatRouteLabel({ label: 'ул. Полевая, 1' }, { label: 'ул. Садовая, 2' })).toBe(
      'ул. Полевая, 1 → ул. Садовая, 2',
    );
  });
});
